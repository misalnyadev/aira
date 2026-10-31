import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { DEFAULT_CHAT_BACKGROUND, normalizeChatBackground, parseChatBackground } from "@/lib/chatBackground";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UNAUTHORIZED = { error: "Kamu belum masuk." };

/**
 * Tampilan chat milik akun.
 *
 * Disimpan di server, bukan di HP, supaya latar yang dipilih di satu perangkat
 * ikut terbawa ke perangkat lain — sama seperti profil dan API key.
 */
export async function GET() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const [row] = await db
    .select({ chatBackground: users.chatBackground })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  return NextResponse.json({
    chatBackground: parseChatBackground(row?.chatBackground),
  });
}

export async function PATCH(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("chatBackground" in body)) {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const chatBackground = normalizeChatBackground(
    (body as { chatBackground?: unknown }).chatBackground
  );

  await db
    .update(users)
    .set({ chatBackground: JSON.stringify(chatBackground) })
    .where(eq(users.id, user.id));

  return NextResponse.json({ chatBackground });
}

/** Kembalikan latar bawaan tanpa menyentuh database (dipakai tombol "Atur ulang"). */
export async function DELETE() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  await db
    .update(users)
    .set({ chatBackground: JSON.stringify(DEFAULT_CHAT_BACKGROUND) })
    .where(eq(users.id, user.id));

  return NextResponse.json({ chatBackground: DEFAULT_CHAT_BACKGROUND });
}
