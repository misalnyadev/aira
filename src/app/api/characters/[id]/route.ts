import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { normalizeBubbleStyle, parseOptionalBubbleStyle } from "@/lib/bubbleStyle";
import {
  collectMediaKeys,
  normalizeCharacterMedia,
  parseCharacterMedia,
} from "@/lib/characterMedia";
import { normalizeChatBackground, parseOptionalChatBackground } from "@/lib/chatBackground";
import { ensureDb } from "@/lib/dbReady";
import {
  MAX_BIBLE_CHARS,
  MAX_GREETING_CHARS,
  MAX_PERSONALITY_CHARS,
  MAX_SHORT_BIO_CHARS,
} from "@/lib/limits";
import { findOwnedCharacter } from "@/lib/owned";
import { deleteR2Object } from "@/lib/r2";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." };
const NOT_FOUND = { error: "Karakter tidak ditemukan." };

function serializeDetail(row: typeof characters.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatarUrl,
    shortBio: row.shortBio,
    personality: row.personality,
    bible: row.bible,
    greeting: row.greeting,
    providerId: row.providerId,
    model: row.model,
    chatBackground: parseOptionalChatBackground(row.chatBackground),
    bubbleStyle: parseOptionalBubbleStyle(row.bubbleStyle),
    media: parseCharacterMedia(row.media),
  };
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await context.params;
  const row = await findOwnedCharacter(id, user.id);
  if (!row) return NextResponse.json(NOT_FOUND, { status: 404 });

  return NextResponse.json({ character: serializeDetail(row) });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const {
    name,
    avatarUrl,
    shortBio,
    personality,
    greeting,
    bible,
    providerId,
    model,
    chatBackground,
    bubbleStyle,
    media,
  } = body as {
    name?: string;
    avatarUrl?: string | null;
    shortBio?: string;
    personality?: string;
    greeting?: string;
    bible?: string;
    providerId?: string | null;
    model?: string | null;
    chatBackground?: unknown | null;
    bubbleStyle?: unknown | null;
    media?: unknown | null;
  };

  if (personality !== undefined && personality.trim().length > MAX_PERSONALITY_CHARS) {
    return NextResponse.json(
      { error: `Kepribadian maksimal ${MAX_PERSONALITY_CHARS.toLocaleString("id-ID")} karakter.` },
      { status: 400 }
    );
  }
  if (greeting !== undefined && greeting.trim().length > MAX_GREETING_CHARS) {
    return NextResponse.json(
      { error: `Pesan pembuka maksimal ${MAX_GREETING_CHARS} karakter.` },
      { status: 400 }
    );
  }
  if (shortBio !== undefined && shortBio.trim().length > MAX_SHORT_BIO_CHARS) {
    return NextResponse.json(
      { error: `Status singkat maksimal ${MAX_SHORT_BIO_CHARS} karakter.` },
      { status: 400 }
    );
  }
  if (bible !== undefined && bible.trim().length > MAX_BIBLE_CHARS) {
    return NextResponse.json(
      { error: `Bible maksimal ${MAX_BIBLE_CHARS.toLocaleString("id-ID")} karakter.` },
      { status: 400 }
    );
  }

  const updates: Partial<typeof characters.$inferInsert> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name.trim();
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl || null;
  if (shortBio !== undefined) updates.shortBio = shortBio.trim();
  if (personality !== undefined) updates.personality = personality.trim();
  if (greeting !== undefined) updates.greeting = greeting.trim();
  if (bible !== undefined) updates.bible = bible.trim();
  if (providerId !== undefined) updates.providerId = providerId || null;
  if (model !== undefined) updates.model = model?.trim() || null;
  if ("chatBackground" in body) {
    updates.chatBackground =
      chatBackground === null ? null : JSON.stringify(normalizeChatBackground(chatBackground));
  }
  if ("bubbleStyle" in body) {
    updates.bubbleStyle =
      bubbleStyle === null ? null : JSON.stringify(normalizeBubbleStyle(bubbleStyle));
  }
  if ("media" in body) {
    const cleaned = media === null ? null : normalizeCharacterMedia(media, user.id);
    updates.media = cleaned ? JSON.stringify(cleaned) : null;
  }

  /*
   * Kepemilikan diperiksa DI DALAM klausa WHERE, bukan setelah UPDATE.
   * Kalau diperiksa sesudahnya, baris milik orang lain sudah terlanjur
   * berubah — dan tidak ada cara mengembalikannya.
   */
  const [row] = await db
    .update(characters)
    .set(updates)
    .where(and(eq(characters.id, id), eq(characters.userId, user.id)))
    .returning();

  if (!row) return NextResponse.json(NOT_FOUND, { status: 404 });

  return NextResponse.json({ character: serializeDetail(row) });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await context.params;
  const owned = await findOwnedCharacter(id, user.id);
  if (!owned) return NextResponse.json(NOT_FOUND, { status: 404 });

  const mediaKeys = collectMediaKeys(parseCharacterMedia(owned.media));
  await db.delete(characters).where(eq(characters.id, id));
  if (mediaKeys.length > 0) {
    await Promise.allSettled(mediaKeys.map((key) => deleteR2Object(key)));
  }
  return NextResponse.json({ ok: true });
}
