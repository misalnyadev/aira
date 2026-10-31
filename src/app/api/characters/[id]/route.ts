import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  MAX_BIBLE_CHARS,
  MAX_GREETING_CHARS,
  MAX_PERSONALITY_CHARS,
  MAX_SHORT_BIO_CHARS,
} from "@/lib/limits";
import { findOwnedCharacter } from "@/lib/owned";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." };
const NOT_FOUND = { error: "Karakter tidak ditemukan." };

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await context.params;
  const row = await findOwnedCharacter(id, user.id);
  if (!row) return NextResponse.json(NOT_FOUND, { status: 404 });

  return NextResponse.json({ character: row });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { name, avatarUrl, shortBio, personality, greeting, bible, providerId, model } = body as {
    name?: string;
    avatarUrl?: string | null;
    shortBio?: string;
    personality?: string;
    greeting?: string;
    bible?: string;
    providerId?: string | null;
    model?: string | null;
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

  return NextResponse.json({ character: row });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await context.params;
  const owned = await findOwnedCharacter(id, user.id);
  if (!owned) return NextResponse.json(NOT_FOUND, { status: 404 });

  await db.delete(characters).where(eq(characters.id, id));
  return NextResponse.json({ ok: true });
}
