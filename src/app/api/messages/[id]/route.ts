import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characters, messages } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { removeStoredImage } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Hapus satu pesan.
 *
 * Kepemilikan diperiksa lewat karakter pemilik pesan itu — bukan lewat id
 * pesan, karena id pesan bukan pengenal pengguna.
 */
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });

  const { id } = await context.params;

  const [owned] = await db
    .select({
      messageId: messages.id,
      characterId: messages.characterId,
      imageUrl: messages.imageUrl,
    })
    .from(messages)
    .innerJoin(characters, eq(characters.id, messages.characterId))
    .where(and(eq(messages.id, id), eq(characters.userId, user.id)))
    .limit(1);

  if (!owned) {
    return NextResponse.json({ error: "Pesan tidak ditemukan." }, { status: 404 });
  }

  await db.delete(messages).where(eq(messages.id, id));
  if (owned.imageUrl) {
    await removeStoredImage(owned.imageUrl, user.id);
  }

  return NextResponse.json({ ok: true, characterId: owned.characterId });
}
