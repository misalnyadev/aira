import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import {
  buildR2ImageKey,
  deleteR2Object,
  getR2Object,
  isR2Configured,
  parseR2AttachmentId,
  putR2Object,
} from "@/lib/r2";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024; // 6MB setelah dikompresi di browser

function extFromMime(mime: string): ".png" | ".webp" | ".gif" | ".jpg" {
  const clean = (mime || "").toLowerCase();
  if (clean.includes("png")) return ".png";
  if (clean.includes("webp")) return ".webp";
  if (clean.includes("gif")) return ".gif";
  return ".jpg";
}

function mimeFromExt(ext: string): string {
  const clean = ext.toLowerCase();
  if (clean === ".png") return "image/png";
  if (clean === ".webp") return "image/webp";
  if (clean === ".gif") return "image/gif";
  return "image/jpeg";
}

/**
 * Simpan gambar dengan urutan prioritas hemat database:
 * 1) Cloudflare R2 (`images/{userId}/{uuid}.{ext}` -> `/api/attachments/r2-{uuid}.{ext}`)
 *    bila R2 aktif di server, sehingga kuota Neon PostgreSQL tetap lega.
 * 2) Disk lokal `public/uploads` (mode self-hosted / dev lokal).
 * 3) Fallback tabel `attachments` di PostgreSQL bila R2 belum diset di serverless.
 */
export async function storeImage(
  buffer: Buffer,
  mimeType: string,
  originalName?: string,
  userId?: string | null
): Promise<string> {
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error("Ukuran gambar terlalu besar (maksimal 6MB setelah dikompresi).");
  }

  const ext = extFromMime(mimeType || path.extname(originalName || ""));
  const contentType = mimeFromExt(ext);
  const filePart = `${crypto.randomUUID()}${ext}`;

  // 1) Prioritaskan Cloudflare R2 bila sudah dikonfigurasi dan ada pemilik akun.
  if (userId && isR2Configured()) {
    const r2Key = buildR2ImageKey(userId, filePart);
    if (r2Key) {
      const stored = await putR2Object(r2Key, new Uint8Array(buffer), contentType);
      if (stored) {
        return `/api/attachments/r2-${filePart}`;
      }
    }
  }

  // 2) Coba tulis ke disk (mode lokal/self-hosted).
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(UPLOAD_DIR, filePart), buffer);
    return `/uploads/${filePart}`;
  } catch {
    // Read-only filesystem (Vercel tanpa R2) -> simpan di database.
  }

  // 3) Fallback: simpan sebagai attachment di database.
  const [row] = await db
    .insert(attachments)
    .values({
      userId: userId ?? null,
      mimeType: contentType,
      data: buffer.toString("base64"),
      bytes: buffer.length,
    })
    .returning({ id: attachments.id });

  return `/api/attachments/${row.id}`;
}

export async function saveUploadedFile(file: File, userId?: string | null): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  return storeImage(Buffer.from(arrayBuffer), file.type, file.name, userId);
}

/** Ambil gambar sebagai base64 untuk dikirim ke model AI (vision). */
export async function readImageAsBase64(
  url: string | null | undefined,
  userId?: string | null
): Promise<{ base64: string; mimeType: string } | null> {
  if (!url) return null;

  try {
    // a) Data URL langsung.
    if (url.startsWith("data:")) {
      const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(url);
      if (!match) return null;
      return { mimeType: match[1], base64: match[2] };
    }

    // b) Lampiran dari Cloudflare R2 atau database (`/api/attachments/...`).
    if (url.startsWith("/api/attachments/")) {
      const id = url.split("/").pop();
      if (!id) return null;

      const r2File = parseR2AttachmentId(id);
      if (r2File) {
        if (!userId) return null;
        const r2Key = buildR2ImageKey(userId, r2File);
        if (!r2Key) return null;
        const obj = await getR2Object(r2Key);
        if (!obj) return null;
        return {
          base64: Buffer.from(obj.body).toString("base64"),
          mimeType: obj.contentType.startsWith("image/")
            ? obj.contentType
            : mimeFromExt(path.extname(r2File)),
        };
      }

      const [row] = await db
        .select({
          data: attachments.data,
          mimeType: attachments.mimeType,
          userId: attachments.userId,
        })
        .from(attachments)
        .where(eq(attachments.id, id))
        .limit(1);

      if (!row) return null;
      if (userId && row.userId && row.userId !== userId) return null;

      return { base64: row.data, mimeType: row.mimeType };
    }

    // c) File di disk (mode lokal).
    if (url.startsWith("/uploads/")) {
      const cleanName = path.basename(url);
      const filePath = path.join(UPLOAD_DIR, cleanName);
      const buffer = await readFile(filePath);
      return {
        base64: buffer.toString("base64"),
        mimeType: mimeFromExt(path.extname(cleanName)),
      };
    }
  } catch {
    return null;
  }

  return null;
}

/** Hapus satu berkas gambar milik pengguna (R2, disk lokal, atau baris DB lama). */
export async function removeStoredImage(
  url: string | null | undefined,
  userId: string
): Promise<void> {
  if (!url || !userId) return;

  try {
    if (url.startsWith("/api/attachments/")) {
      const id = url.split("/").pop();
      if (!id) return;

      const r2File = parseR2AttachmentId(id);
      if (r2File) {
        const r2Key = buildR2ImageKey(userId, r2File);
        if (r2Key) await deleteR2Object(r2Key);
        return;
      }

      await db
        .delete(attachments)
        .where(and(eq(attachments.id, id), eq(attachments.userId, userId)));
      return;
    }

    if (url.startsWith("/uploads/")) {
      const cleanName = path.basename(url);
      await unlink(path.join(UPLOAD_DIR, cleanName)).catch(() => undefined);
    }
  } catch {
    /* best-effort cleanup */
  }
}

export async function removeStoredImages(
  urls: (string | null | undefined)[],
  userId: string
): Promise<void> {
  const unique = [...new Set(urls.map((u) => u?.trim()).filter(Boolean) as string[])];
  if (!unique.length) return;
  await Promise.allSettled(unique.map((u) => removeStoredImage(u, userId)));
}
