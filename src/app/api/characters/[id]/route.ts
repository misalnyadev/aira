import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { ensureDb } from "@/lib/dbReady";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const { id } = await context.params;
  const [row] = await db.select().from(characters).where(eq(characters.id, id));
  if (!row) return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ character: row });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { name, avatarUrl, shortBio, personality, greeting, providerId, model } = body as {
    name?: string;
    avatarUrl?: string | null;
    shortBio?: string;
    personality?: string;
    greeting?: string;
    providerId?: string | null;
    model?: string | null;
  };

  const updates: Partial<typeof characters.$inferInsert> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name.trim();
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl || null;
  if (shortBio !== undefined) updates.shortBio = shortBio.trim();
  if (personality !== undefined) updates.personality = personality.trim();
  if (greeting !== undefined) updates.greeting = greeting.trim();
  if (providerId !== undefined) updates.providerId = providerId || null;
  if (model !== undefined) updates.model = model?.trim() || null;

  const [row] = await db
    .update(characters)
    .set(updates)
    .where(eq(characters.id, id))
    .returning();

  if (!row) return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ character: row });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const { id } = await context.params;
  await db.delete(characters).where(eq(characters.id, id));
  return NextResponse.json({ ok: true });
}
