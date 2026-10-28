import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Menyajikan gambar yang disimpan di database (mode Vercel/serverless).
 * URL-nya dipakai langsung sebagai <img src="/api/attachments/{id}">.
 */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    await ensureDb();
  } catch {
    /* biarkan query di bawah yang melaporkan error */
  }

  const [row] = await db
    .select({ data: attachments.data, mimeType: attachments.mimeType })
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1);

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = Buffer.from(row.data, "base64");

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": row.mimeType || "image/jpeg",
      "Content-Length": String(bytes.length),
      // ID attachment tidak pernah berubah -> boleh di-cache permanen.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
