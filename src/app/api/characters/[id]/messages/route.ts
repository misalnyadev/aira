import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { findOwnedCharacter } from "@/lib/owned";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const { id } = await context.params;

  // Riwayat hanya bisa dibaca pemilik karakternya.
  const owned = await findOwnedCharacter(id, user.id);
  if (!owned) {
    return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.characterId, id))
    .orderBy(asc(messages.createdAt));

  return NextResponse.json({ messages: rows });
}
