import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, messages } from "@/db/schema";
import { ensureDemoCharacters } from "@/lib/seedDemo";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureDb();
  // Isi karakter contoh saat database masih kosong (deploy pertama kali).
  await ensureDemoCharacters();

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
      createdAt: characters.createdAt,
      lastAt: lastMessageSub.lastAt,
    })
    .from(characters)
    .leftJoin(lastMessageSub, eq(lastMessageSub.characterId, characters.id))
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
        preview: lastMsg
          ? lastMsg.content || (lastMsg.imageUrl ? "📷 Foto" : "")
          : "Mulai percakapan baru",
        updatedAt: row.lastAt ?? row.createdAt,
      };
    })
  );

  return NextResponse.json({ characters: list });
}

export async function POST(req: Request) {
  await ensureDb();

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { name, avatarUrl, shortBio, personality, greeting, providerId, model } = body as {
    name?: string;
    avatarUrl?: string;
    shortBio?: string;
    personality?: string;
    greeting?: string;
    providerId?: string | null;
    model?: string | null;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Nama karakter wajib diisi." }, { status: 400 });
  }
  if (!personality?.trim()) {
    return NextResponse.json({ error: "Deskripsi kepribadian wajib diisi." }, { status: 400 });
  }

  const [row] = await db
    .insert(characters)
    .values({
      name: name.trim(),
      avatarUrl: avatarUrl?.trim() || null,
      shortBio: shortBio?.trim() || "",
      personality: personality.trim(),
      greeting: greeting?.trim() || "",
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
