import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Menyajikan gambar yang disimpan di database (mode Vercel/serverless).
 * URL-nya dipakai langsung sebagai <img src="/api/attachments/{id}">.
 *
 * Hanya pemilik gambar yang boleh membukanya. Browser mengirim cookie sesi
 * pada permintaan <img>, jadi pemeriksaan ini tetap jalan.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    await ensureDb();
  } catch {
    /* biarkan query di bawah yang melaporkan error */
  }

  const user = await requireUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const [row] = await db
    .select({ data: attachments.data, mimeType: attachments.mimeType, userId: attachments.userId })
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1);

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  // Lampiran lama (sebelum ada akun) bisa saja belum punya pemilik.
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
