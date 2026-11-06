import { NextResponse } from "next/server";
import { and, asc, eq, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { characterStatuses, statusComments } from "@/db/schema";
import { ensureDb } from "@/lib/dbReady";
import {
  buildR2ImageKey,
  deleteR2Object,
  getR2Config,
  isOwnedImageKey,
  isOwnedStatusKey,
  parseR2AttachmentId,
} from "@/lib/r2";
import { removeStoredImage } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE_SIZE = 25;
const MAX_STATUSES_PER_RUN = 250;
const MEDIA_DELETE_CONCURRENCY = 8;

type ExpiredStatus = Pick<
  typeof characterStatuses.$inferSelect,
  "id" | "userId" | "imageUrl" | "videoKey"
>;
type MediaCleanup = () => Promise<boolean>;

function expiredStatusFilter(now: Date) {
  const legacyExpiryCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return and(
    eq(characterStatuses.kind, "status"),
    or(
      and(isNotNull(characterStatuses.expiresAt), lte(characterStatuses.expiresAt, now)),
      and(isNull(characterStatuses.expiresAt), lte(characterStatuses.createdAt, legacyExpiryCutoff))
    )
  );
}

function isR2ObjectUrl(value: string): boolean {
  try {
    return new URL(value).hostname.endsWith(".r2.cloudflarestorage.com");
  } catch {
    return false;
  }
}

function ownedR2KeyFromUrl(
  value: string,
  userId: string,
  kind: "image" | "status"
): string | null {
  const config = getR2Config();
  if (!config) return null;

  try {
    const url = new URL(value);
    if (url.hostname !== `${config.accountId}.r2.cloudflarestorage.com`) return null;

    const parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
    if (parts.shift() !== config.bucket) return null;

    const key = parts.join("/");
    return kind === "image"
      ? isOwnedImageKey(key, userId)
        ? key
        : null
      : isOwnedStatusKey(key, userId)
        ? key
        : null;
  } catch {
    return null;
  }
}

function cleanupImage(url: string, userId: string): MediaCleanup {
  const cleanUrl = url.split("?")[0];
  if (cleanUrl.startsWith("/api/attachments/")) {
    const id = cleanUrl.split("/").pop() ?? "";
    const filePart = parseR2AttachmentId(id);
    if (filePart) {
      const key = buildR2ImageKey(userId, filePart);
      return key ? () => deleteR2Object(key) : async () => false;
    }
    return () => removeStoredImage(cleanUrl, userId);
  }

  if (/^https?:\/\//i.test(cleanUrl) && isR2ObjectUrl(cleanUrl)) {
    const key = ownedR2KeyFromUrl(cleanUrl, userId, "image");
    return key ? () => deleteR2Object(key) : async () => false;
  }

  return () => removeStoredImage(cleanUrl, userId);
}

function cleanupVideo(value: string, userId: string): MediaCleanup | null {
  if (value.startsWith("media/")) {
    return isOwnedStatusKey(value, userId)
      ? () => deleteR2Object(value)
      : async () => false;
  }

  if (value.startsWith("/uploads/")) {
    return () => removeStoredImage(value, userId);
  }

  if (/^https?:\/\//i.test(value) && isR2ObjectUrl(value)) {
    const key = ownedR2KeyFromUrl(value, userId, "status");
    return key ? () => deleteR2Object(key) : async () => false;
  }

  // URL eksternal lama bukan objek yang kita miliki di R2.
  return null;
}

async function cleanupExpiredStatus(status: ExpiredStatus, now: Date): Promise<boolean> {
  const commentImages = await db
    .select({ userId: statusComments.userId, imageUrl: statusComments.imageUrl })
    .from(statusComments)
    .where(eq(statusComments.statusId, status.id));

  const jobs: MediaCleanup[] = [];
  if (status.imageUrl) jobs.push(cleanupImage(status.imageUrl, status.userId));
  if (status.videoKey) {
    const videoJob = cleanupVideo(status.videoKey, status.userId);
    if (videoJob) jobs.push(videoJob);
  }
  for (const comment of commentImages) {
    if (comment.imageUrl) jobs.push(cleanupImage(comment.imageUrl, comment.userId));
  }

  let allMediaDeleted = true;
  for (let i = 0; i < jobs.length; i += MEDIA_DELETE_CONCURRENCY) {
    const results = await Promise.all(
      jobs.slice(i, i + MEDIA_DELETE_CONCURRENCY).map(async (job) => {
        try {
          return await job();
        } catch {
          return false;
        }
      })
    );
    if (results.some((ok) => !ok)) allMediaDeleted = false;
  }
  if (!allMediaDeleted) return false;

  await db
    .delete(characterStatuses)
    .where(and(eq(characterStatuses.id, status.id), expiredStatusFilter(now)));
  return true;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET belum dikonfigurasi." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  await ensureDb();
  const now = new Date();
  let offset = 0;
  let checked = 0;
  let deleted = 0;
  let failed = 0;
  let hasMore = false;

  while (checked < MAX_STATUSES_PER_RUN) {
    const limit = Math.min(PAGE_SIZE, MAX_STATUSES_PER_RUN - checked);
    const rows = await db
      .select({
        id: characterStatuses.id,
        userId: characterStatuses.userId,
        imageUrl: characterStatuses.imageUrl,
        videoKey: characterStatuses.videoKey,
      })
      .from(characterStatuses)
      .where(expiredStatusFilter(now))
      .orderBy(asc(characterStatuses.expiresAt), asc(characterStatuses.id))
      .limit(limit)
      .offset(offset);

    if (rows.length === 0) break;

    const results = await Promise.all(
      rows.map(async (row) => {
        try {
          return await cleanupExpiredStatus(row, now);
        } catch {
          return false;
        }
      })
    );
    const failedInPage = results.filter((ok) => !ok).length;
    checked += rows.length;
    deleted += rows.length - failedInPage;
    failed += failedInPage;
    offset += failedInPage;

    if (rows.length < limit) break;
  }

  if (checked >= MAX_STATUSES_PER_RUN) {
    const remaining = await db
      .select({ id: characterStatuses.id })
      .from(characterStatuses)
      .where(expiredStatusFilter(now))
      .orderBy(asc(characterStatuses.expiresAt), asc(characterStatuses.id))
      .limit(1)
      .offset(offset);
    hasMore = remaining.length > 0;
  }

  const ok = failed === 0;
  return NextResponse.json(
    {
      ok,
      checked,
      deleted,
      failed,
      hasMore,
      ranAt: now.toISOString(),
    },
    { status: ok ? 200 : 500 }
  );
}
