import { NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { attachments, characterStatuses, statusCommentLikes, statusComments, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { withUploaderParam } from "@/lib/contactsServer";
import { buildR2ImageKey, parseR2AttachmentId } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

async function isOwnedCommentImage(url: string, userId: string): Promise<boolean> {
  if (!url.startsWith("/") || url.includes("?") || url.includes("#")) return false;

  const attachmentPrefix = "/api/attachments/";
  if (url.startsWith(attachmentPrefix)) {
    const id = url.slice(attachmentPrefix.length);
    if (!id || id.includes("/")) return false;
    const r2File = parseR2AttachmentId(id);
    if (r2File) {
      return !r2File.toLowerCase().endsWith(".gif") && Boolean(buildR2ImageKey(userId, r2File));
    }
    if (!UUID_RE.test(id)) return false;
    const [attachment] = await db
      .select({ id: attachments.id, mimeType: attachments.mimeType })
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.userId, userId)))
      .limit(1);
    return Boolean(attachment && attachment.mimeType.toLowerCase() !== "image/gif");
  }

  return false;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  const { id } = await ctx.params;
  const [exists] = await db.select({ id: characterStatuses.id }).from(characterStatuses).where(eq(characterStatuses.id, id)).limit(1);
  if (!exists) return NextResponse.json({ error: "Status tidak ditemukan." }, { status: 404 });

  const rows = await db
    .select({
      id: statusComments.id,
      content: statusComments.content,
      imageUrl: statusComments.imageUrl,
      parentCommentId: statusComments.parentCommentId,
      createdAt: statusComments.createdAt,
      userId: statusComments.userId,
      displayName: users.displayName,
      nickname: users.nickname,
      avatarUrl: users.avatarUrl,
    })
    .from(statusComments)
    .leftJoin(users, eq(users.id, statusComments.userId))
    .where(eq(statusComments.statusId, id))
    .orderBy(asc(statusComments.createdAt))
    .limit(100);

  const likesByComment = new Map<string, { likeCount: number; likedByMe: boolean }>();
  if (rows.length > 0) {
    const likeRows = await db
      .select({
        commentId: statusCommentLikes.commentId,
        likeCount: sql<number>`count(*)::int`,
        likedByMe: sql<boolean>`bool_or(${statusCommentLikes.userId} = ${user.id})`,
      })
      .from(statusCommentLikes)
      .where(inArray(statusCommentLikes.commentId, rows.map((row) => row.id)))
      .groupBy(statusCommentLikes.commentId);
    likeRows.forEach((row) => {
      likesByComment.set(row.commentId, {
        likeCount: Number(row.likeCount),
        likedByMe: Boolean(row.likedByMe),
      });
    });
  }

  const comments = rows.map((row) => {
    const likes = likesByComment.get(row.id);
    return {
      ...row,
      imageUrl: withUploaderParam(row.imageUrl, row.userId),
      likeCount: likes?.likeCount ?? 0,
      likedByMe: likes?.likedByMe ?? false,
    };
  });

  return NextResponse.json({ comments });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  const { id } = await ctx.params;
  const [exists] = await db.select({ id: characterStatuses.id }).from(characterStatuses).where(eq(characterStatuses.id, id)).limit(1);
  if (!exists) return NextResponse.json({ error: "Status tidak ditemukan." }, { status: 404 });

  const payload = await req.json().catch(() => null);
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const text = typeof body?.content === "string" ? body.content.trim().slice(0, 500) : "";
  const rawImageUrl = body?.imageUrl;
  if (rawImageUrl !== undefined && rawImageUrl !== null && typeof rawImageUrl !== "string") {
    return NextResponse.json({ error: "Foto tidak valid." }, { status: 400 });
  }
  const imageUrl = typeof rawImageUrl === "string" ? rawImageUrl.trim() || null : null;
  if (imageUrl && (imageUrl.length > 2000 || !(await isOwnedCommentImage(imageUrl, user.id)))) {
    return NextResponse.json({ error: "Foto tidak valid atau bukan milikmu." }, { status: 400 });
  }
  if (!text && !imageUrl) return NextResponse.json({ error: "Komentar kosong." }, { status: 400 });

  const rawParentCommentId = body?.parentCommentId;
  if (rawParentCommentId !== undefined && rawParentCommentId !== null && typeof rawParentCommentId !== "string") {
    return NextResponse.json({ error: "Balasan tidak valid." }, { status: 400 });
  }
  const parentCommentId = typeof rawParentCommentId === "string" ? rawParentCommentId.trim() || null : null;
  if (parentCommentId) {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(parentCommentId)) {
      return NextResponse.json({ error: "Balasan tidak valid." }, { status: 400 });
    }
    const [parent] = await db
      .select({ id: statusComments.id })
      .from(statusComments)
      .where(
        and(
          eq(statusComments.id, parentCommentId),
          eq(statusComments.statusId, id),
          isNull(statusComments.parentCommentId)
        )
      )
      .limit(1);
    if (!parent) return NextResponse.json({ error: "Komentar yang dibalas tidak ditemukan." }, { status: 404 });
  }

  const [row] = await db
    .insert(statusComments)
    .values({ statusId: id, userId: user.id, content: text, imageUrl, parentCommentId })
    .returning();
  return NextResponse.json({ comment: row });
}
