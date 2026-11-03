import { NextResponse } from "next/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { brainstormMessages, brainstormRoomMembers, brainstormRooms, characters } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });

  const rooms = await db
    .select({
      id: brainstormRooms.id,
      title: brainstormRooms.title,
      updatedAt: brainstormRooms.updatedAt,
      createdAt: brainstormRooms.createdAt,
    })
    .from(brainstormRooms)
    .where(eq(brainstormRooms.userId, user.id))
    .orderBy(desc(brainstormRooms.updatedAt));

  const result = await Promise.all(
    rooms.map(async (r) => {
      const members = await db
        .select({
          characterId: brainstormRoomMembers.characterId,
          name: characters.name,
          avatarUrl: characters.avatarUrl,
          shortBio: characters.shortBio,
        })
        .from(brainstormRoomMembers)
        .innerJoin(characters, eq(characters.id, brainstormRoomMembers.characterId))
        .where(eq(brainstormRoomMembers.roomId, r.id))
        .orderBy(asc(brainstormRoomMembers.createdAt));

      const [lastMsg] = await db
        .select({ content: brainstormMessages.content, createdAt: brainstormMessages.createdAt })
        .from(brainstormMessages)
        .where(eq(brainstormMessages.roomId, r.id))
        .orderBy(desc(brainstormMessages.createdAt))
        .limit(1);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(brainstormMessages)
        .where(eq(brainstormMessages.roomId, r.id));

      return {
        id: r.id,
        title: r.title,
        members: members.map((m) => ({
          characterId: m.characterId,
          name: m.name,
          avatarUrl: m.avatarUrl,
          shortBio: m.shortBio,
        })),
        preview: lastMsg?.content || "Belum ada obrolan di meja ini",
        updatedAt: (lastMsg?.createdAt ?? r.updatedAt).toISOString(),
        messageCount: Number(count),
      };
    })
  );

  return NextResponse.json({ rooms: result });
}

export async function POST(req: Request) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { title, characterIds } = body as { title?: string; characterIds?: string[] };
  const cleanTitle = title?.trim() || "Meja Diskusi Baru";

  if (!Array.isArray(characterIds) || characterIds.length < 2 || characterIds.length > 3) {
    return NextResponse.json({ error: "Pilih 2–3 karakter untuk meja diskusi." }, { status: 400 });
  }
  const unique = [...new Set(characterIds.map((s) => String(s).trim()).filter(Boolean))];
  if (unique.length < 2 || unique.length > 3) {
    return NextResponse.json({ error: "Pilih 2–3 karakter yang berbeda." }, { status: 400 });
  }

  // Pastikan semua karakter milik user
  const owned = await db
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.userId, user.id), sql`${characters.id} IN ${unique}`));

  if (owned.length !== unique.length) {
    return NextResponse.json({ error: "Salah satu karakter tidak ditemukan." }, { status: 404 });
  }

  const [room] = await db
    .insert(brainstormRooms)
    .values({ userId: user.id, title: cleanTitle.slice(0, 80) })
    .returning();

  for (const cid of unique) {
    await db.insert(brainstormRoomMembers).values({ roomId: room.id, characterId: cid });
  }

  return NextResponse.json({ room }, { status: 201 });
}
