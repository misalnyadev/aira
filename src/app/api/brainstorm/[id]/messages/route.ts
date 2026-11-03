import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { brainstormMessages, brainstormRoomMembers, brainstormRooms, characters } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  const { id } = await ctx.params;
  const [room] = await db.select().from(brainstormRooms).where(eq(brainstormRooms.id, id)).limit(1);
  if (!room || room.userId !== user.id) return NextResponse.json({ error: "Meja tidak ditemukan." }, { status: 404 });

  const msgs = await db
    .select()
    .from(brainstormMessages)
    .where(eq(brainstormMessages.roomId, id))
    .orderBy(asc(brainstormMessages.createdAt))
    .limit(200);

  // Enrich assistant messages with character name/avatar
  const charMap = new Map<string, { name: string; avatarUrl: string | null }>();
  const memberRows = await db
    .select({ characterId: brainstormRoomMembers.characterId, name: characters.name, avatarUrl: characters.avatarUrl })
    .from(brainstormRoomMembers)
    .innerJoin(characters, eq(characters.id, brainstormRoomMembers.characterId))
    .where(eq(brainstormRoomMembers.roomId, id));
  for (const r of memberRows) charMap.set(r.characterId, { name: r.name, avatarUrl: r.avatarUrl });

  const out = msgs.map((m) => {
    const meta = m.characterId ? charMap.get(m.characterId) : null;
    return {
      id: m.id,
      roomId: m.roomId,
      role: m.role,
      characterId: m.characterId,
      characterName: meta?.name ?? null,
      characterAvatarUrl: meta?.avatarUrl ?? null,
      content: m.content,
      imageUrl: m.imageUrl,
      isVoiceNote: m.isVoiceNote,
      emotion: m.emotion,
      createdAt: m.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ messages: out });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  const { id } = await ctx.params;
  const [room] = await db.select().from(brainstormRooms).where(eq(brainstormRooms.id, id)).limit(1);
  if (!room || room.userId !== user.id) return NextResponse.json({ error: "Meja tidak ditemukan." }, { status: 404 });
  await db.delete(brainstormMessages).where(eq(brainstormMessages.roomId, id));
  await db.update(brainstormRooms).set({ updatedAt: new Date() }).where(eq(brainstormRooms.id, id));
  return NextResponse.json({ ok: true });
}
