import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { brainstormRoomMembers, brainstormRooms, characters } from "@/db/schema";
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

  const members = await db
    .select({
      characterId: brainstormRoomMembers.characterId,
      name: characters.name,
      avatarUrl: characters.avatarUrl,
      shortBio: characters.shortBio,
      personality: characters.personality,
      bible: characters.bible,
      greeting: characters.greeting,
      providerId: characters.providerId,
      model: characters.model,
      media: characters.media,
      voiceConfig: characters.voiceConfig,
      memoryEnabled: characters.memoryEnabled,
      browsingEnabled: characters.browsingEnabled,
    })
    .from(brainstormRoomMembers)
    .innerJoin(characters, eq(characters.id, brainstormRoomMembers.characterId))
    .where(eq(brainstormRoomMembers.roomId, id))
    .orderBy(asc(brainstormRoomMembers.createdAt));

  return NextResponse.json({ room, members });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  const { id } = await ctx.params;
  const [room] = await db.select().from(brainstormRooms).where(eq(brainstormRooms.id, id)).limit(1);
  if (!room || room.userId !== user.id) return NextResponse.json({ error: "Meja tidak ditemukan." }, { status: 404 });
  await db.delete(brainstormRooms).where(eq(brainstormRooms.id, id));
  return NextResponse.json({ ok: true });
}
