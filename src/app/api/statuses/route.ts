import { NextResponse } from "next/server";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  characterStatuses,
  characters,
  statusBookmarks,
  statusComments,
  statusFollows,
  statusLikes,
  statusViews,
  users,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { findOwnedCharacter } from "@/lib/owned";
import { withUploaderParam } from "@/lib/contactsServer";
import { isOwnedStatusKey, presignR2Url, isR2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clampText(s: string, max: number) {
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
}

export async function GET(req: Request) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });

  const requestedStatusId = new URL(req.url).searchParams.get("id");
  const now = new Date();

  // ambil semua status yang belum kedaluwarsa (status 24j) + reel permanen
  const rows = await db
    .select({
      id: characterStatuses.id,
      userId: characterStatuses.userId,
      characterId: characterStatuses.characterId,
      kind: characterStatuses.kind,
      mediaType: characterStatuses.mediaType,
      caption: characterStatuses.caption,
      content: characterStatuses.content,
      imageUrl: characterStatuses.imageUrl,
      videoKey: characterStatuses.videoKey,
      expiresAt: characterStatuses.expiresAt,
      createdAt: characterStatuses.createdAt,
      characterName: characters.name,
      characterAvatar: characters.avatarUrl,
      userDisplayName: users.displayName,
      userNickname: users.nickname,
      userAvatar: users.avatarUrl,
    })
    .from(characterStatuses)
    .leftJoin(characters, eq(characters.id, characterStatuses.characterId))
    .leftJoin(users, eq(users.id, characterStatuses.userId))
    .where(
      requestedStatusId
        ? and(
            or(isNull(characterStatuses.expiresAt), gt(characterStatuses.expiresAt, now)),
            eq(characterStatuses.id, requestedStatusId)
          )
        : or(isNull(characterStatuses.expiresAt), gt(characterStatuses.expiresAt, now))
    )
    .orderBy(desc(characterStatuses.createdAt))
    .limit(requestedStatusId ? 1 : 120);

  const bookmarkedStatusIds = new Set<string>();
  if (rows.length > 0) {
    const bookmarks = await db
      .select({ statusId: statusBookmarks.statusId })
      .from(statusBookmarks)
      .where(
        and(
          eq(statusBookmarks.userId, user.id),
          inArray(statusBookmarks.statusId, rows.map((row) => row.id))
        )
      );
    bookmarks.forEach((bookmark) => bookmarkedStatusIds.add(bookmark.statusId));
  }

  const followedCharacterIds = new Set<string>();
  const followedUserIds = new Set<string>();
  const characterIds = [...new Set(rows.map((row) => row.characterId).filter((id): id is string => id !== null))];
  const userIds = [...new Set(rows.filter((row) => row.characterId === null).map((row) => row.userId))];
  if (characterIds.length > 0) {
    const follows = await db
      .select({ targetCharacterId: statusFollows.targetCharacterId })
      .from(statusFollows)
      .where(
        and(
          eq(statusFollows.followerUserId, user.id),
          inArray(statusFollows.targetCharacterId, characterIds)
        )
      );
    follows.forEach((follow) => {
      if (follow.targetCharacterId) followedCharacterIds.add(follow.targetCharacterId);
    });
  }
  if (userIds.length > 0) {
    const follows = await db
      .select({ targetUserId: statusFollows.targetUserId })
      .from(statusFollows)
      .where(and(eq(statusFollows.followerUserId, user.id), inArray(statusFollows.targetUserId, userIds)));
    follows.forEach((follow) => {
      if (follow.targetUserId) followedUserIds.add(follow.targetUserId);
    });
  }

  // enrich dengan like/comment counts + likedByMe
  const enriched = await Promise.all(
    rows.map(async (r) => {
      const [likeCountRow] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(statusLikes)
        .where(eq(statusLikes.statusId, r.id));
      const [commentCountRow] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(statusComments)
        .where(eq(statusComments.statusId, r.id));
      const [liked] = await db
        .select({ id: statusLikes.id })
        .from(statusLikes)
        .where(and(eq(statusLikes.statusId, r.id), eq(statusLikes.userId, user.id)))
        .limit(1);
      const [viewed] = await db
        .select({ id: statusViews.id })
        .from(statusViews)
        .where(and(eq(statusViews.statusId, r.id), eq(statusViews.userId, user.id)))
        .limit(1);

      let videoUrl: string | null = null;
      if (r.videoKey && isR2Configured() && isOwnedStatusKey(r.videoKey, r.userId)) {
        try {
          videoUrl = presignR2Url({ method: "GET", key: r.videoKey, expiresInSeconds: 21600 });
        } catch {
          videoUrl = null;
        }
      } else if (r.videoKey && r.videoKey.startsWith("/")) {
        videoUrl = r.videoKey;
      }

      return {
        ...r,
        imageUrl: withUploaderParam(r.imageUrl, r.userId),
        characterAvatar: withUploaderParam(r.characterAvatar, r.userId),
        userAvatar: withUploaderParam(r.userAvatar, r.userId),
        videoUrl,
        likeCount: Number(likeCountRow?.c ?? 0),
        commentCount: Number(commentCountRow?.c ?? 0),
        likedByMe: Boolean(liked),
        bookmarkedByMe: bookmarkedStatusIds.has(r.id),
        followingByMe: r.characterId
          ? followedCharacterIds.has(r.characterId)
          : followedUserIds.has(r.userId),
        canFollow: r.userId !== user.id,
        viewedByMe: Boolean(viewed),
      };
    })
  );

  // pisahkan stories (status) dan reels biar client gampang
  const stories = enriched.filter((x) => x.kind === "status");
  const reels = enriched.filter((x) => x.kind === "reel");

  return NextResponse.json({ statuses: enriched, stories, reels });
}

export async function POST(req: Request) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });
  }

  const {
    characterId,
    kind,
    mediaType,
    caption,
    content,
    imageUrl,
    videoKey,
    videoUrl,
  } = body as {
    characterId?: unknown;
    kind?: unknown;
    mediaType?: unknown;
    caption?: unknown;
    content?: unknown;
    imageUrl?: unknown;
    videoKey?: unknown;
    videoUrl?: unknown;
  };

  const normalizedKind = kind === "reel" ? "reel" : "status";
  const normalizedMedia =
    mediaType === "image" ? "image" : mediaType === "video" ? "video" : "text";

  let charId: string | null = null;
  if (typeof characterId === "string" && characterId.trim()) {
    const owned = await findOwnedCharacter(characterId.trim(), user.id);
    if (!owned) return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
    charId = owned.id;
  }

  const cap = typeof caption === "string" ? clampText(caption, 500) : "";
  const txt = typeof content === "string" ? clampText(content, 700) : "";
  if (normalizedMedia === "text" && !txt && !cap) {
    return NextResponse.json({ error: "Tulis caption atau isi status dulu." }, { status: 400 });
  }
  if (normalizedMedia === "image" && !imageUrl) {
    return NextResponse.json({ error: "Gambar belum diunggah." }, { status: 400 });
  }
  if (normalizedMedia === "video" && !(videoKey || videoUrl)) {
    return NextResponse.json({ error: "Video belum diunggah." }, { status: 400 });
  }

  // validasi videoKey milik user
  let cleanVideoKey: string | null = null;
  if (typeof videoKey === "string" && videoKey.trim()) {
    const k = videoKey.trim();
    // terima baik r2 key mentah maupun presigned url -> ambil key jika perlu, tapi sederhana: cek startsWith media/
    if (k.startsWith("media/")) {
      if (!isOwnedStatusKey(k, user.id)) {
        return NextResponse.json({ error: "Kunci video tidak valid." }, { status: 400 });
      }
      cleanVideoKey = k;
    } else if (k.startsWith("http")) {
      // coba ekstrak key dari url bila dikirim full presigned (fallback: simpan apa adanya tidak dipakai presign)
      cleanVideoKey = k;
    }
  } else if (typeof videoUrl === "string" && videoUrl.trim()) {
    const k = videoUrl.trim();
    if (k.startsWith("media/") && isOwnedStatusKey(k, user.id)) cleanVideoKey = k;
  }

  const cleanImageUrl = typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim().slice(0, 2000) : null;

  const now = new Date();
  const expiresAt = normalizedKind === "status" ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null;

  const [row] = await db
    .insert(characterStatuses)
    .values({
      userId: user.id,
      characterId: charId,
      kind: normalizedKind,
      mediaType: normalizedMedia,
      caption: cap,
      content: txt,
      imageUrl: cleanImageUrl,
      videoKey: cleanVideoKey,
      expiresAt,
    })
    .returning();

  return NextResponse.json({ status: row });
}
