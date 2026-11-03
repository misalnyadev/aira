import { and, desc, eq, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  characterContacts,
  characters,
  contactMessages,
  users,
} from "@/db/schema";
import { parseOptionalBubbleStyle } from "@/lib/bubbleStyle";
import { parseCharacterMedia } from "@/lib/characterMedia";
import { parseOptionalChatBackground } from "@/lib/chatBackground";
import { ensureDb } from "@/lib/dbReady";
import { parseCharacterVoice } from "@/lib/hdVoice";
import { isOwnedMediaKey, parseMediaKeyMeta } from "@/lib/r2";
import type { CharacterSummary, ChatMessage } from "@/types/chat";

/**
 * Ketika sambungan kontak karakter baru saja aktif (`admin_status = 'approved'`
 * DAN `owner_status = 'approved'`), pastikan ada sapaan pembuka (`greeting`)
 * dari karakter jika utas pesan kontak tersebut masih kosong.
 */
export async function ensureInitialContactGreeting(
  contactId: string,
  characterId: string
): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactMessages)
    .where(eq(contactMessages.contactId, contactId));

  if (Number(count) > 0) return;

  const [charRow] = await db
    .select({ greeting: characters.greeting })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  const greeting = charRow?.greeting?.trim();
  if (!greeting) return;

  await db.insert(contactMessages).values({
    contactId,
    senderKind: "character_ai",
    content: greeting,
    status: "sent",
  });
}

/**
 * Sematkan parameter `?u={ownerUserId}` pada URL `/api/attachments/...`
 * supaya lawan kontak yang telah disetujui dapat memuat avatar/foto tersebut.
 */
export function withUploaderParam(
  url: string | null | undefined,
  uploaderUserId: string | null | undefined
): string | null {
  if (!url) return null;
  if (!uploaderUserId) return url;
  if (!url.startsWith("/api/attachments/")) return url;
  if (url.includes("?u=") || url.includes("&u=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}u=${encodeURIComponent(uploaderUserId)}`;
}

/**
 * Periksa apakah `viewerUserId` diizinkan membaca media karakter R2 (`GET`).
 * Diizinkan bila:
 *   1) ia adalah pemilik asli media tersebut, ATAU
 *   2) ia adalah kontak aktif (`admin_status = 'approved' && owner_status = 'approved'`)
 *      dari karakter tersebut.
 */
export async function canReadCharacterMediaKey(
  key: string,
  viewerUserId: string
): Promise<boolean> {
  if (isOwnedMediaKey(key, viewerUserId)) return true;

  const meta = parseMediaKeyMeta(key);
  if (!meta) return false;

  await ensureDb();

  const [contact] = await db
    .select({ id: characterContacts.id })
    .from(characterContacts)
    .where(
      and(
        eq(characterContacts.characterId, meta.characterId),
        eq(characterContacts.ownerUserId, meta.ownerUserId),
        eq(characterContacts.guestUserId, viewerUserId),
        eq(characterContacts.adminStatus, "approved"),
        eq(characterContacts.ownerStatus, "approved")
      )
    )
    .limit(1);

  return Boolean(contact);
}

/**
 * Periksa apakah dua akun memiliki setidaknya satu sambungan kontak karakter aktif.
 * Dipakai untuk mengizinkan pemuatan avatar & foto kiriman di ruang chat 2 arah.
 */
export async function hasActiveContactBetweenUsers(
  userA: string,
  userB: string
): Promise<boolean> {
  if (!userA || !userB) return false;
  if (userA === userB) return true;

  const UUID_RE = /^[0-9a-f-]{36}$/i;
  if (!UUID_RE.test(userA) || !UUID_RE.test(userB)) return false;

  const [row] = await db
    .select({ id: characterContacts.id })
    .from(characterContacts)
    .where(
      and(
        eq(characterContacts.adminStatus, "approved"),
        eq(characterContacts.ownerStatus, "approved"),
        or(
          and(
            eq(characterContacts.ownerUserId, userA),
            eq(characterContacts.guestUserId, userB)
          ),
          and(
            eq(characterContacts.ownerUserId, userB),
            eq(characterContacts.guestUserId, userA)
          )
        )
      )
    )
    .limit(1);

  return Boolean(row);
}

/**
 * Konversi satu baris `contact_messages` menjadi `ChatMessage` untuk UI
 * berdasarkan sudut pandang pembuka ruang obrolan (`viewerRole`).
 *
 * - Bagi Pengundang (`guest`):
 *     pesan `guest` = kanan (`user`), `character_ai` & `owner_manual` = kiri (`assistant`).
 * - Bagi Pemilik Karakter (`owner`):
 *     pesan `guest` = kiri (`assistant`), `character_ai` & `owner_manual` = kanan (`user`).
 */
export function serializeContactMessageForViewer(
  row: typeof contactMessages.$inferSelect,
  viewerRole: "guest" | "owner",
  contactMeta: { ownerUserId: string; guestUserId: string }
): ChatMessage {
  const senderKind = (
    row.senderKind === "guest" ||
    row.senderKind === "owner_manual" ||
    row.senderKind === "character_ai"
      ? row.senderKind
      : "character_ai"
  ) as "guest" | "character_ai" | "owner_manual";

  const isRightSide =
    viewerRole === "guest"
      ? senderKind === "guest"
      : senderKind !== "guest";

  const uploaderId =
    senderKind === "guest" ? contactMeta.guestUserId : contactMeta.ownerUserId;

  return {
    id: row.id,
    characterId: `contact:${row.contactId}`,
    role: isRightSide ? "user" : "assistant",
    content: row.content,
    imageUrl: withUploaderParam(row.imageUrl, uploaderId),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    senderKind,
  };
}

/**
 * Ambil seluruh utas kontak karakter aktif (`admin_status = 'approved' && owner_status = 'approved'`)
 * baik sebagai Pengundang (`guest_contact`) maupun sebagai Pemilik Karakter (`owner_contact`).
 */
export async function loadActiveContactThreadsForUser(
  userId: string
): Promise<CharacterSummary[]> {
  const ownerUsers = alias(users, "active_owner_users");
  const guestUsers = alias(users, "active_guest_users");

  const rows = await db
    .select({
      contactId: characterContacts.id,
      characterId: characterContacts.characterId,
      ownerUserId: characterContacts.ownerUserId,
      guestUserId: characterContacts.guestUserId,
      aiAutoReply: characterContacts.aiAutoReply,
      contactUpdatedAt: characterContacts.updatedAt,
      charName: characters.name,
      charAvatarUrl: characters.avatarUrl,
      charShortBio: characters.shortBio,
      charGreeting: characters.greeting,
      charBible: characters.bible,
      charBg: characters.chatBackground,
      charBubble: characters.bubbleStyle,
      charMedia: characters.media,
      charVoice: characters.voiceConfig,
      charMemoryEnabled: characters.memoryEnabled,
      charBrowsingEnabled: characters.browsingEnabled,
      ownerDisplayName: ownerUsers.displayName,
      ownerNickname: ownerUsers.nickname,
      ownerEmail: ownerUsers.email,
      guestDisplayName: guestUsers.displayName,
      guestNickname: guestUsers.nickname,
      guestEmail: guestUsers.email,
      guestAvatarUrl: guestUsers.avatarUrl,
    })
    .from(characterContacts)
    .innerJoin(characters, eq(characters.id, characterContacts.characterId))
    .innerJoin(ownerUsers, eq(ownerUsers.id, characterContacts.ownerUserId))
    .innerJoin(guestUsers, eq(guestUsers.id, characterContacts.guestUserId))
    .where(
      and(
        eq(characterContacts.adminStatus, "approved"),
        eq(characterContacts.ownerStatus, "approved"),
        or(
          eq(characterContacts.guestUserId, userId),
          eq(characterContacts.ownerUserId, userId)
        )
      )
    )
    .orderBy(desc(characterContacts.updatedAt));

  return Promise.all(
    rows.map(async (r) => {
      const [lastMsg] = await db
        .select({
          content: contactMessages.content,
          imageUrl: contactMessages.imageUrl,
          senderKind: contactMessages.senderKind,
          createdAt: contactMessages.createdAt,
        })
        .from(contactMessages)
        .where(eq(contactMessages.contactId, r.contactId))
        .orderBy(desc(contactMessages.createdAt))
        .limit(1);

      const ownerLabel =
        r.ownerDisplayName || r.ownerNickname || r.ownerEmail.split("@")[0];
      const guestLabel =
        r.guestDisplayName || r.guestNickname || r.guestEmail.split("@")[0];

      const updatedIso = (
        lastMsg?.createdAt ?? r.contactUpdatedAt
      ).toISOString();

      if (r.guestUserId === userId) {
        const parsedMedia = parseCharacterMedia(r.charMedia);
        if (parsedMedia) {
          if (parsedMedia.chatVideoPosterUrl) {
            parsedMedia.chatVideoPosterUrl =
              withUploaderParam(
                parsedMedia.chatVideoPosterUrl,
                r.ownerUserId
              ) ?? undefined;
          }
          if (parsedMedia.callVideoPosterUrl) {
            parsedMedia.callVideoPosterUrl =
              withUploaderParam(
                parsedMedia.callVideoPosterUrl,
                r.ownerUserId
              ) ?? undefined;
          }
          if (parsedMedia.callClips) {
            for (const clip of Object.values(parsedMedia.callClips)) {
              if (clip?.posterUrl) {
                clip.posterUrl =
                  withUploaderParam(clip.posterUrl, r.ownerUserId) ?? undefined;
              }
            }
          }
        }

        const rawPreview = lastMsg
          ? lastMsg.content || (lastMsg.imageUrl ? "📷 Foto" : "")
          : "Kontak terhubung — mulai sapa";

        return {
          id: `contact:${r.contactId}`,
          contactId: r.contactId,
          sourceCharacterId: r.characterId,
          threadKind: "guest_contact" as const,
          partnerName: ownerLabel,
          aiAutoReply: Boolean(r.aiAutoReply),
          name: r.charName,
          avatarUrl: withUploaderParam(r.charAvatarUrl, r.ownerUserId),
          shortBio: r.charShortBio || `Kontak · @${ownerLabel}`,
          greeting: r.charGreeting,
          hasBible: Boolean(r.charBible?.trim()),
          chatBackground: parseOptionalChatBackground(r.charBg),
          bubbleStyle: parseOptionalBubbleStyle(r.charBubble),
          media: parsedMedia,
          voiceConfig: parseCharacterVoice(r.charVoice),
          memoryEnabled: Boolean(r.charMemoryEnabled),
          browsingEnabled: Boolean(r.charBrowsingEnabled),
          preview: rawPreview,
          updatedAt: updatedIso,
        };
      }

      const ownerPreview = lastMsg
        ? `${lastMsg.senderKind === "guest" ? `${guestLabel}: ` : lastMsg.senderKind === "owner_manual" ? "Kamu: " : "AI: "}${lastMsg.content || (lastMsg.imageUrl ? "📷 Foto" : "")}`
        : `Kontak baru dengan ${guestLabel}`;

      return {
        id: `contact:${r.contactId}`,
        contactId: r.contactId,
        sourceCharacterId: r.characterId,
        threadKind: "owner_contact" as const,
        partnerName: guestLabel,
        aiAutoReply: Boolean(r.aiAutoReply),
        name: `${guestLabel} · ${r.charName}`,
        avatarUrl:
          withUploaderParam(r.guestAvatarUrl, r.guestUserId) ?? r.charAvatarUrl,
        shortBio: r.aiAutoReply
          ? `Kontak ${r.charName} · AI + Manual`
          : `Kontak ${r.charName} · Mode Manual`,
        greeting: "",
        hasBible: false,
        chatBackground: null,
        bubbleStyle: null,
        media: null,
        voiceConfig: null,
        memoryEnabled: false,
        browsingEnabled: false,
        preview: ownerPreview,
        updatedAt: updatedIso,
      };
    })
  );
}
