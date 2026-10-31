import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { toUserFacingError } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import {
  NO_PROVIDER_ERROR,
  buildMemoryExtrasForTurn,
  generateBubbles,
  loadUserChatSettings,
  pickProviderCandidates,
  refreshCharacterMemory,
  toChatTurns,
} from "@/lib/chatEngine";
import { toTimeAwareChatTurns } from "@/lib/characterMemory";
import { ensureDb } from "@/lib/dbReady";
import { MAX_HISTORY_MESSAGES } from "@/lib/limits";
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

  const { profile, autoFallback } = await loadUserChatSettings(user.id);
  const candidates = await pickProviderCandidates(user.id, character.providerId, autoFallback);
  if (!candidates.length) {
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
    .limit(MAX_HISTORY_MESSAGES + 1);

  // `ORDER BY created_at DESC` mengambil pesan terbaru lebih dulu; balik ke urutan
  // kronologis (awal -> terbaru) supaya model membaca jalannya cerita dengan benar.
  const chronologicalHistory = [...historyRows].reverse();
  const cleanUserText = content?.trim() || (imageUrl ? "(mengirim foto tanpa teks)" : "");

  try {
    const memoryExtras = await buildMemoryExtrasForTurn({
      character,
      chronologicalHistory,
      excludeMessageId: userMessage.id,
      userText: cleanUserText,
    });

    const historyTurns = character.memoryEnabled
      ? toTimeAwareChatTurns(chronologicalHistory, userMessage.id)
      : toChatTurns(chronologicalHistory, userMessage.id);

    const result = await generateBubbles({
      userId: user.id,
      character,
      candidates,
      userText: cleanUserText,
      image,
      history: historyTurns,
      userProfile: profile,
      memoryExtras,
    });

    const assistantMessages = [];
    const baseTime = Date.now();
    for (let i = 0; i < result.bubbles.length; i++) {
      const [row] = await db
        .insert(messages)
        .values({
          characterId,
          role: "assistant",
          content: result.bubbles[i],
          createdAt: new Date(baseTime + i),
        })
        .returning();
      assistantMessages.push(row);
    }

    if (character.memoryEnabled) {
      await refreshCharacterMemory({
        userId: user.id,
        character,
        candidates,
        forceAll: false,
      }).catch(() => undefined);
    }

    return NextResponse.json({
      userMessage,
      assistantMessages,
      fallbackUsed: result.fallbackUsed,
      providerLabel: result.providerLabel,
      primaryLabel: result.primaryLabel,
      keyRotated: result.keyRotated,
    });
  } catch (err) {
    return NextResponse.json(
      { userMessage, error: toUserFacingError(err) },
      { status: 502 }
    );
  }
}
