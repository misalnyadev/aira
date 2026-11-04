import path from "path";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { attachments, characterStatuses, characters, statusComments, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { hasActiveContactBetweenUsers } from "@/lib/contactsServer";
import { ensureDb } from "@/lib/dbReady";
import { buildR2ImageKey, getR2Object, parseR2AttachmentId } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fallbackMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

async function isStatusCommentImage(id: string, ownerUserId: string): Promise<boolean> {
  const [comment] = await db
    .select({ id: statusComments.id })
    .from(statusComments)
    .where(
      and(
        eq(statusComments.imageUrl, `/api/attachments/${id}`),
        eq(statusComments.userId, ownerUserId)
      )
    )
    .limit(1);
  return Boolean(comment);
}

async function isActiveStatusImage(id: string, ownerUserId: string): Promise<boolean> {
  const [status] = await db
    .select({ id: characterStatuses.id })
    .from(characterStatuses)
    .where(
      and(
        eq(characterStatuses.imageUrl, `/api/attachments/${id}`),
        eq(characterStatuses.userId, ownerUserId),
        or(isNull(characterStatuses.expiresAt), gt(characterStatuses.expiresAt, new Date()))
      )
    )
    .limit(1);
  return Boolean(status);
}

async function isProfileOrCharacterAvatar(id: string, ownerUserId: string): Promise<boolean> {
  const url = `/api/attachments/${id}`;
  const [userAvatar, characterAvatar] = await Promise.all([
    db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, ownerUserId), eq(users.avatarUrl, url)))
      .limit(1),
    db
      .select({ id: characters.id })
      .from(characters)
      .where(and(eq(characters.userId, ownerUserId), eq(characters.avatarUrl, url)))
      .limit(1),
  ]);
  return Boolean(userAvatar.length || characterAvatar.length);
}

/**
 * Menyajikan gambar milik pengguna dari Cloudflare R2 (`r2-...`) maupun
 * lampiran lama dari tabel `attachments` database (`/api/attachments/{id}`).
 *
 * Avatar profil/karakter dan foto status aktif/komentar dapat dibaca pengguna masuk
 * bila URL-nya dirujuk pada data tersebut; lampiran lain tetap mengikuti aturan pemilik/kontak aktif.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { searchParams } = new URL(req.url);
  const requestedOwnerId = searchParams.get("u")?.trim() || null;

  try {
    await ensureDb();
  } catch {
    /* biarkan pemeriksaan sesi / query di bawah yang melaporkan bila gagal */
  }

  const user = await requireUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // 1) Lampiran gambar baru yang tersimpan di Cloudflare R2.
  const r2File = parseR2AttachmentId(id);
  if (r2File) {
    let targetOwnerId = user.id;
    if (requestedOwnerId && requestedOwnerId !== user.id) {
      const [isCommentImage, isStatusImage, isAvatar] = await Promise.all([
        isStatusCommentImage(id, requestedOwnerId),
        isActiveStatusImage(id, requestedOwnerId),
        isProfileOrCharacterAvatar(id, requestedOwnerId),
      ]);
      const allowed =
        user.isAdmin ||
        isCommentImage ||
        isStatusImage ||
        isAvatar ||
        (await hasActiveContactBetweenUsers(user.id, requestedOwnerId));
      if (!allowed) return new Response("Not found", { status: 404 });
      targetOwnerId = requestedOwnerId;
    }

    const r2Key = buildR2ImageKey(targetOwnerId, r2File);
    if (!r2Key) return new Response("Not found", { status: 404 });

    const obj = await getR2Object(r2Key);
    if (!obj) return new Response("Not found", { status: 404 });

    const contentType = obj.contentType.startsWith("image/")
      ? obj.contentType
      : fallbackMime(r2File);

    return new Response(obj.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(obj.body.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  }

  // 2) Kompatibilitas lampiran lama yang tersimpan di tabel `attachments` Neon.
  const [row] = await db
    .select({ data: attachments.data, mimeType: attachments.mimeType, userId: attachments.userId })
    .from(attachments)
    .where(eq(attachments.id, id))
    .limit(1);

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  if (row.userId && row.userId !== user.id) {
    const [isCommentImage, isStatusImage, isAvatar] = await Promise.all([
      isStatusCommentImage(id, row.userId),
      isActiveStatusImage(id, row.userId),
      isProfileOrCharacterAvatar(id, row.userId),
    ]);
    const allowed =
      user.isAdmin ||
      isCommentImage ||
      isStatusImage ||
      isAvatar ||
      (await hasActiveContactBetweenUsers(user.id, row.userId));
    if (!allowed) {
      return new Response("Not found", { status: 404 });
    }
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
