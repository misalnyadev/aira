import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ttsClips } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { getR2Object, isOwnedTtsKey, isR2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." };

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  if (!isR2Configured()) {
    return NextResponse.json({ error: "Cloudflare R2 belum aktif di server." }, { status: 503 });
  }

  const { id } = await context.params;
  const [row] = await db
    .select()
    .from(ttsClips)
    .where(and(eq(ttsClips.id, id), eq(ttsClips.userId, user.id)))
    .limit(1);

  if (!row || !isOwnedTtsKey(row.r2Key, user.id)) {
    return NextResponse.json({ error: "Rekaman suara tidak ditemukan." }, { status: 404 });
  }

  const obj = await getR2Object(row.r2Key);
  if (!obj) {
    return NextResponse.json(
      { error: "Berkas audio di R2 tidak ditemukan lagi." },
      { status: 404 }
    );
  }

  return new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type": row.mimeType || obj.contentType,
      "X-Tts-Source": "r2",
      "X-Tts-Hash": row.clipHash,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
