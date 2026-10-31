import path from "path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { buildR2ImageKey, getR2Object, parseR2AttachmentId } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fallbackMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

/**
 * Menyajikan gambar milik pengguna dari Cloudflare R2 (`r2-...`) maupun
 * lampiran lama dari tabel `attachments` database (`/api/attachments/{id}`).
 *
 * Hanya pemilik sesi yang boleh membukanya; browser otomatis mengirim cookie sesi
 * pada permintaan `<img src="...">` maupun CSS `background-image`.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    await ensureDb();
  } catch {
    /* biarkan pemeriksaan sesi / query di bawah yang melaporkan bila gagal */
  }

  const user = await requireUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // 1) Lampiran gambar baru yang tersimpan di Cloudflare R2.
  const r2File = parseR2AttachmentId(id);
  if (r2File) {
    const r2Key = buildR2ImageKey(user.id, r2File);
    if (!r2Key) return new Response("Not found", { status: 404 });

    const obj = await getR2Object(r2Key);
    if (!obj) return new Response("Not found", { status: 404 });

    const contentType = obj.contentType.startsWith("image/")
      ? obj.contentType
      : fallbackMime(r2File);

    return new Response(obj.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(obj.body.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  }

  // 2) Kompatibilitas lampiran lama yang tersimpan di tabel `attachments` Neon.
  const [row] = await db
    .select({ data: attachments.data, mimeType: attachments.mimeType, userId: attachments.userId })
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1);

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  if (row.userId && row.userId !== user.id) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = Buffer.from(row.data, "base64");

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": row.mimeType || "image/jpeg",
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
