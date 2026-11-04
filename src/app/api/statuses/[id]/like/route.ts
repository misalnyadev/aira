import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterStatuses, statusLikes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  const { id } = await ctx.params;
  const [exists] = await db.select({ id: characterStatuses.id }).from(characterStatuses).where(eq(characterStatuses.id, id)).limit(1);
  if (!exists) return NextResponse.json({ error: "Status tidak ditemukan." }, { status: 404 });

  const [liked] = await db
    .select({ id: statusLikes.id })
    .from(statusLikes)
    .where(and(eq(statusLikes.statusId, id), eq(statusLikes.userId, user.id)))
    .limit(1);

  let likedNow = false;
  if (liked) {
    await db.delete(statusLikes).where(eq(statusLikes.id, liked.id));
    likedNow = false;
  } else {
    await db.insert(statusLikes).values({ statusId: id, userId: user.id });
    likedNow = true;
  }

  const [countRow] = await db.select({ c: sql<number>`count(*)::int` }).from(statusLikes).where(eq(statusLikes.statusId, id));
  return NextResponse.json({ liked: likedNow, likeCount: Number(countRow?.c ?? 0) });
}
