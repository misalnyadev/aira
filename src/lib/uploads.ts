import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024; // 6MB setelah dikompresi di browser

function extFromMime(mime: string): string {
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  return ".jpg";
}

/**
 * Simpan gambar.
 * - Self-hosted / lokal  -> file di `public/uploads` (URL: `/uploads/xxx.jpg`)
 * - Vercel (read-only FS) -> otomatis fallback ke tabel `attachments`
 *                            (URL: `/api/attachments/{id}`)
 * Keduanya bisa dipakai langsung sebagai `<img src="...">`.
 */
export async function storeImage(
  buffer: Buffer,
  mimeType: string,
  originalName?: string
): Promise<string> {
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error("Ukuran gambar terlalu besar (maksimal 6MB setelah dikompresi).");
  }

  // 1) Coba tulis ke disk (mode lokal/self-hosted).
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    const ext = path.extname(originalName || "").toLowerCase() || extFromMime(mimeType);
    const filename = `${crypto.randomUUID()}${ext}`;
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);
    return `/uploads/${filename}`;
  } catch {
    // Read-only filesystem (Vercel) -> simpan di database.
  }

  // 2) Fallback: simpan sebagai attachment di database.
  const [row] = await db
    .insert(attachments)
    .values({
      mimeType: mimeType || "image/jpeg",
      data: buffer.toString("base64"),
      bytes: buffer.length,
    })
    .returning({ id: attachments.id });

  return `/api/attachments/${row.id}`;
}

export async function saveUploadedFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  return storeImage(Buffer.from(arrayBuffer), file.type, file.name);
}

/** Ambil gambar sebagai base64 untuk dikirim ke model (vision). */
export async function readImageAsBase64(
  url: string | null | undefined
): Promise<{ base64: string; mimeType: string } | null> {
  if (!url) return null;

  try {
    // a) Data URL langsung.
    if (url.startsWith("data:")) {
      const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(url);
      if (!match) return null;
      return { mimeType: match[1], base64: match[2] };
    }

    // b) Attachment dari database (mode Vercel).
    if (url.startsWith("/api/attachments/")) {
      const id = url.split("/").pop();
      if (!id) return null;
      const [row] = await db
        .select({ data: attachments.data, mimeType: attachments.mimeType })
        .from(attachments)
        .where(eq(attachments.id, id))
        .limit(1);
      return row ? { base64: row.data, mimeType: row.mimeType } : null;
    }

    // c) File di disk (mode lokal).
    if (url.startsWith("/uploads/")) {
      const filePath = path.join(process.cwd(), "public", url);
      const buffer = await readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      return {
        base64: buffer.toString("base64"),
        mimeType:
          ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".gif"
                ? "image/gif"
                : "image/jpeg",
      };
    }
  } catch {
    return null;
  }

  return null;
}

/** Alias lama — tetap dipakai beberapa route. */
export const readPublicFileAsBase64 = readImageAsBase64;
