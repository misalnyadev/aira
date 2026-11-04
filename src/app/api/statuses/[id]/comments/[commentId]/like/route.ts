import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterStatuses, statusCommentLikes, statusComments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string; commentId: string }> }
) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });

  const { id, commentId } = await ctx.params;
  const [status] = await db
    .select({ id: characterStatuses.id })
    .from(characterStatuses)
    .where(eq(characterStatuses.id, id))
    .limit(1);
  if (!status) return NextResponse.json({ error: "Status tidak ditemukan." }, { status: 404 });

  const [comment] = await db
    .select({ id: statusComments.id })
    .from(statusComments)
    .where(and(eq(statusComments.id, commentId), eq(statusComments.statusId, id)))
    .limit(1);
  if (!comment) return NextResponse.json({ error: "Komentar tidak ditemukan." }, { status: 404 });

  const [existingLike] = await db
    .select({ id: statusCommentLikes.id })
    .from(statusCommentLikes)
    .where(and(eq(statusCommentLikes.commentId, commentId), eq(statusCommentLikes.userId, user.id)))
    .limit(1);

  const liked = !existingLike;
  if (existingLike) {
    await db.delete(statusCommentLikes).where(eq(statusCommentLikes.id, existingLike.id));
  } else {
    await db.insert(statusCommentLikes).values({ commentId, userId: user.id });
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(statusCommentLikes)
    .where(eq(statusCommentLikes.commentId, commentId));

  return NextResponse.json({ liked, likeCount: Number(countRow?.count ?? 0) });
}
