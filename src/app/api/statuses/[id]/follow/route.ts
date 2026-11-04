import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterStatuses, statusFollows } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });

  const { id } = await ctx.params;
  const [status] = await db
    .select({ id: characterStatuses.id, userId: characterStatuses.userId, characterId: characterStatuses.characterId })
    .from(characterStatuses)
    .where(eq(characterStatuses.id, id))
    .limit(1);
  if (!status) return NextResponse.json({ error: "Status tidak ditemukan." }, { status: 404 });
  if (status.userId === user.id) {
    return NextResponse.json({ error: "Kamu sudah mengikuti profil ini." }, { status: 400 });
  }

  const targetCondition = status.characterId
    ? eq(statusFollows.targetCharacterId, status.characterId)
    : eq(statusFollows.targetUserId, status.userId);
  const [existing] = await db
    .select({ id: statusFollows.id })
    .from(statusFollows)
    .where(and(eq(statusFollows.followerUserId, user.id), targetCondition))
    .limit(1);

  const following = !existing;
  if (existing) {
    await db.delete(statusFollows).where(eq(statusFollows.id, existing.id));
  } else {
    await db.insert(statusFollows).values({
      followerUserId: user.id,
      targetUserId: status.characterId ? null : status.userId,
      targetCharacterId: status.characterId,
    });
  }

  return NextResponse.json({ following });
}
