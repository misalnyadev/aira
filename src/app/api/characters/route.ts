import { NextResponse } from "next/server";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  characterContacts,
  characterQuotaRequests,
  characters,
  messages,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { parseOptionalBubbleStyle } from "@/lib/bubbleStyle";
import { parseCharacterMedia } from "@/lib/characterMedia";
import { parseOptionalChatBackground } from "@/lib/chatBackground";
import { loadActiveContactThreadsForUser } from "@/lib/contactsServer";
import { ensureDb } from "@/lib/dbReady";
import { parseCharacterVoice } from "@/lib/hdVoice";
import {
  MAX_BIBLE_CHARS,
  MAX_GREETING_CHARS,
  MAX_PERSONALITY_CHARS,
  MAX_SHORT_BIO_CHARS,
} from "@/lib/limits";
import { effectiveCharacterLimit } from "@/lib/quotaRules";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." };

export async function GET() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  /*
   * Tidak ada lagi seed otomatis di sini.
   * Dulu karakter contoh dibuat ulang setiap kali daftar dimuat — akibatnya
   * karakter yang sudah dihapus muncul lagi. Sekarang seed hanya terjadi
   * sekali saat pendaftaran (lihat /api/auth/register).
   */

  const lastMessageSub = db
    .select({
      characterId: messages.characterId,
      lastAt: sql<string>`max(${messages.createdAt})`.as("last_at"),
    })
    .from(messages)
    .groupBy(messages.characterId)
    .as("last_message_sub");

  const rows = await db
    .select({
      id: characters.id,
      name: characters.name,
      avatarUrl: characters.avatarUrl,
      shortBio: characters.shortBio,
      greeting: characters.greeting,
      bible: characters.bible,
      chatBackground: characters.chatBackground,
      bubbleStyle: characters.bubbleStyle,
      media: characters.media,
      voiceConfig: characters.voiceConfig,
      memoryEnabled: characters.memoryEnabled,
      browsingEnabled: characters.browsingEnabled,
      invitePin: characters.invitePin,
      createdAt: characters.createdAt,
      lastAt: lastMessageSub.lastAt,
    })
    .from(characters)
    .leftJoin(lastMessageSub, eq(lastMessageSub.characterId, characters.id))
    .where(eq(characters.userId, user.id))
    .orderBy(desc(sql`coalesce(${lastMessageSub.lastAt}, ${characters.createdAt})`));

  const list = await Promise.all(
    rows.map(async (row) => {
      const [lastMsg] = await db
        .select({ content: messages.content, role: messages.role, imageUrl: messages.imageUrl })
        .from(messages)
        .where(eq(messages.characterId, row.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      return {
        id: row.id,
        name: row.name,
        avatarUrl: row.avatarUrl,
        shortBio: row.shortBio,
        greeting: row.greeting,
        hasBible: Boolean(row.bible?.trim()),
        chatBackground: parseOptionalChatBackground(row.chatBackground),
        bubbleStyle: parseOptionalBubbleStyle(row.bubbleStyle),
        media: parseCharacterMedia(row.media),
        voiceConfig: parseCharacterVoice(row.voiceConfig),
        memoryEnabled: Boolean(row.memoryEnabled),
        browsingEnabled: Boolean(row.browsingEnabled),
        invitePin: row.invitePin ?? null,
        preview: lastMsg
          ? lastMsg.content || (lastMsg.imageUrl ? "📷 Foto" : "")
          : "Mulai percakapan baru",
        updatedAt: row.lastAt ?? row.createdAt,
      };
    })
  );

  const [
    [{ count }],
    [latestReq],
    adminPending,
    ownerPendingContacts,
    adminPendingContacts,
    contactThreads,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(characters)
      .where(eq(characters.userId, user.id)),
    db
      .select({
        id: characterQuotaRequests.id,
        requestedQuota: characterQuotaRequests.requestedQuota,
        reason: characterQuotaRequests.reason,
        status: characterQuotaRequests.status,
        adminNote: characterQuotaRequests.adminNote,
        createdAt: characterQuotaRequests.createdAt,
        resolvedAt: characterQuotaRequests.resolvedAt,
      })
      .from(characterQuotaRequests)
      .where(eq(characterQuotaRequests.userId, user.id))
      .orderBy(desc(characterQuotaRequests.createdAt))
      .limit(1),
    user.isAdmin
      ? db
          .select({ count: sql<number>`count(*)::int` })
          .from(characterQuotaRequests)
          .where(eq(characterQuotaRequests.status, "pending"))
      : Promise.resolve([{ count: 0 }]),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(characterContacts)
      .where(
        and(
          eq(characterContacts.ownerUserId, user.id),
          eq(characterContacts.ownerStatus, "pending"),
          ne(characterContacts.adminStatus, "rejected")
        )
      ),
    Promise.resolve([{ count: 0 }]),
    loadActiveContactThreadsForUser(user.id),
  ]);

  const limit = effectiveCharacterLimit(user);

  return NextResponse.json({
    characters: list,
    contactThreads,
    limit,
    count: Number(count),
    isAdmin: user.isAdmin,
    latestQuotaRequest: latestReq ?? null,
    pendingQuotaRequestsCount: Number(adminPending[0]?.count ?? 0),
    pendingOwnerContactsCount: Number(ownerPendingContacts[0]?.count ?? 0),
    pendingAdminContactsCount: Number(adminPendingContacts[0]?.count ?? 0),
  });
}

export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { name, avatarUrl, shortBio, personality, greeting, bible, providerId, model } = body as {
    name?: string;
    avatarUrl?: string;
    shortBio?: string;
    personality?: string;
    greeting?: string;
    bible?: string;
    providerId?: string | null;
    model?: string | null;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Nama karakter wajib diisi." }, { status: 400 });
  }
  if (!personality?.trim()) {
    return NextResponse.json({ error: "Deskripsi kepribadian wajib diisi." }, { status: 400 });
  }

  // Batas jumlah karakter milik sendiri dijaga ketat di server sesuai peran & kuota akun.
  const limit = effectiveCharacterLimit(user);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(characters)
    .where(eq(characters.userId, user.id));

  if (Number(count) >= limit) {
    const errText = user.isAdmin
      ? `Maksimal ${limit} karakter per akun. Hapus salah satu dulu.`
      : `Kuota karakter kamu sudah penuh (${count}/${limit}). Ajukan tambah slot karakter ke Admin di menu Karakter.`;
    return NextResponse.json({ error: errText }, { status: 403 });
  }

  if (personality.trim().length > MAX_PERSONALITY_CHARS) {
    return NextResponse.json(
      { error: `Kepribadian maksimal ${MAX_PERSONALITY_CHARS.toLocaleString("id-ID")} karakter.` },
      { status: 400 }
    );
  }
  if ((greeting ?? "").trim().length > MAX_GREETING_CHARS) {
    return NextResponse.json(
      { error: `Pesan pembuka maksimal ${MAX_GREETING_CHARS} karakter.` },
      { status: 400 }
    );
  }
  if ((shortBio ?? "").trim().length > MAX_SHORT_BIO_CHARS) {
    return NextResponse.json(
      { error: `Status singkat maksimal ${MAX_SHORT_BIO_CHARS} karakter.` },
      { status: 400 }
    );
  }
  if ((bible ?? "").trim().length > MAX_BIBLE_CHARS) {
    return NextResponse.json(
      { error: `Bible maksimal ${MAX_BIBLE_CHARS.toLocaleString("id-ID")} karakter.` },
      { status: 400 }
    );
  }

  const [row] = await db
    .insert(characters)
    .values({
      userId: user.id,
      name: name.trim(),
      avatarUrl: avatarUrl?.trim() || null,
      shortBio: (shortBio ?? "").trim(),
      personality: personality.trim(),
      bible: (bible ?? "").trim(),
      greeting: (greeting ?? "").trim(),
      providerId: providerId || null,
      model: model?.trim() || null,
    })
    .returning();

  if (row.greeting) {
    await db.insert(messages).values({
      characterId: row.id,
      role: "assistant",
      content: row.greeting,
    });
  }

  return NextResponse.json({ character: row }, { status: 201 });
}
