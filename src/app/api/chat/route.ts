import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { AiProviderError } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import {
  NO_PROVIDER_ERROR,
  generateBubbles,
  loadUserProfile,
  pickProvider,
  toChatTurns,
} from "@/lib/chatEngine";
import { ensureDb } from "@/lib/dbReady";
import { findOwnedCharacter } from "@/lib/owned";
import { readImageAsBase64 } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Balasan model bisa memakan 10-40 detik. Di Vercel, batas default fungsi
 * Hobby adalah 10 detik — jadi kita naikkan ke maksimum yang diizinkan.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { characterId, content, imageUrl } = body as {
    characterId?: string;
    content?: string;
    imageUrl?: string | null;
  };

  if (!characterId) {
    return NextResponse.json({ error: "characterId wajib diisi." }, { status: 400 });
  }
  if (!content?.trim() && !imageUrl) {
    return NextResponse.json({ error: "Pesan tidak boleh kosong." }, { status: 400 });
  }

  const character = await findOwnedCharacter(characterId, user.id);
  if (!character) {
    return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  }

  const provider = await pickProvider(user.id, character.providerId);
  if (!provider) {
    return NextResponse.json({ error: NO_PROVIDER_ERROR }, { status: 412 });
  }

  // Gambar diperiksa dulu sebelum pesan disimpan, supaya pesan yang gagal
  // tidak meninggalkan riwayat setengah jadi.
  const image = await readImageAsBase64(imageUrl, user.id);

  const [userMessage] = await db
    .insert(messages)
    .values({
      characterId,
      role: "user",
      content: content?.trim() || "",
      imageUrl: imageUrl || null,
    })
    .returning();

  const historyRows = await db
    .select()
    .from(messages)
    .where(eq(messages.characterId, characterId))
    .orderBy(desc(messages.createdAt))
    .limit(21);

  try {
    const bubbles = await generateBubbles({
      character,
      provider,
      userText: content?.trim() || (imageUrl ? "(mengirim foto tanpa teks)" : ""),
      image,
      history: toChatTurns(historyRows, userMessage.id),
      userProfile: await loadUserProfile(user.id),
    });

    const assistantMessages = [];
    for (const bubble of bubbles) {
      const [row] = await db
        .insert(messages)
        .values({ characterId, role: "assistant", content: bubble })
        .returning();
      assistantMessages.push(row);
    }

    return NextResponse.json({ userMessage, assistantMessages });
  } catch (err) {
    const message = err instanceof AiProviderError ? err.message : "Gagal menghubungi penyedia AI.";
    return NextResponse.json({ userMessage, error: message }, { status: 502 });
  }
}
