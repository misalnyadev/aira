import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ttsClips } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { deleteR2Object, isOwnedTtsKey, isR2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." };

export async function GET() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const [totalsRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${ttsClips.bytes}), 0)::bigint`,
    })
    .from(ttsClips)
    .where(eq(ttsClips.userId, user.id));

  const rows = await db
    .select({
      id: ttsClips.id,
      clipHash: ttsClips.clipHash,
      provider: ttsClips.provider,
      voice: ttsClips.voice,
      text: ttsClips.text,
      mimeType: ttsClips.mimeType,
      bytes: ttsClips.bytes,
      createdAt: ttsClips.createdAt,
    })
    .from(ttsClips)
    .where(eq(ttsClips.userId, user.id))
    .orderBy(desc(ttsClips.createdAt))
    .limit(200);

  return NextResponse.json({
    r2Enabled: isR2Configured(),
    totalCount: Number(totalsRow?.count ?? 0),
    totalBytes: Number(totalsRow?.bytes ?? 0),
    clips: rows,
  });
}

export async function DELETE(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clipId = searchParams.get("id")?.trim() ?? "";
  const clearAll = searchParams.get("all") === "1";

  if (clipId) {
    const [row] = await db
      .select()
      .from(ttsClips)
      .where(and(eq(ttsClips.id, clipId), eq(ttsClips.userId, user.id)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Rekaman tidak ditemukan." }, { status: 404 });
    }

    await db
      .delete(ttsClips)
      .where(and(eq(ttsClips.id, clipId), eq(ttsClips.userId, user.id)));

    if (isOwnedTtsKey(row.r2Key, user.id)) {
      await deleteR2Object(row.r2Key);
    }
    return NextResponse.json({ ok: true });
  }

  if (clearAll) {
    const rows = await db
      .select({ r2Key: ttsClips.r2Key })
      .from(ttsClips)
      .where(eq(ttsClips.userId, user.id));

    await db.delete(ttsClips).where(eq(ttsClips.userId, user.id));

    const ownedKeys = rows
      .map((r) => r.r2Key)
      .filter((k) => isOwnedTtsKey(k, user.id));

    // Hapus bertahap dari R2 agar tidak membanjiri koneksi sekaligus.
    const BATCH = 15;
    for (let i = 0; i < ownedKeys.length; i += BATCH) {
      const slice = ownedKeys.slice(i, i + BATCH);
      await Promise.allSettled(slice.map((k) => deleteR2Object(k)));
    }
    return NextResponse.json({ ok: true, deleted: rows.length });
  }

  return NextResponse.json({ error: "Parameter penghapusan tidak valid." }, { status: 400 });
}
