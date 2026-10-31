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
  toChatTurns,
} from "@/lib/chatEngine";
import { toTimeAwareChatTurns } from "@/lib/characterMemory";
import { ensureDb } from "@/lib/dbReady";
import { MAX_HISTORY_MESSAGES } from "@/lib/limits";
import { staleAssistantIds } from "@/lib/messageRules";
import { findOwnedCharacter } from "@/lib/owned";
import { readImageAsBase64 } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Ulangi balasan terakhir.
 *
 * Yang dihapus hanya balasan asisten SETELAH pesan pengguna terakhir — pesan
 * pengguna sendiri tidak disentuh. Jadi hasilnya persis seperti kalau dia
 * mengirim ulang pesan yang sama, tanpa pesan dobel di riwayat.
 */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });

  const { id } = await context.params;

  const character = await findOwnedCharacter(id, user.id);
  if (!character) {
    return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  }

  const all = await db
    .select()
    .from(messages)
    .where(eq(messages.characterId, id))
    .orderBy(desc(messages.createdAt))
    .limit(MAX_HISTORY_MESSAGES + 12);

  const lastUser = all.find((m) => m.role === "user");
  if (!lastUser) {
    return NextResponse.json(
      { error: "Belum ada pesan yang bisa diulang. Kirim pesan dulu." },
      { status: 400 }
    );
  }

  const { profile, autoFallback } = await loadUserChatSettings(user.id);
  const candidates = await pickProviderCandidates(user.id, character.providerId, autoFallback);
  if (!candidates.length) {
    return NextResponse.json({ error: NO_PROVIDER_ERROR }, { status: 412 });
  }

  // Balasan asisten yang muncul setelah pesan pengguna terakhir.
  const staleIds = new Set(staleAssistantIds(all, lastUser.createdAt));
  const stale = all.filter((m) => staleIds.has(m.id));
  for (const row of stale) {
    await db.delete(messages).where(eq(messages.id, row.id));
  }

  const image = await readImageAsBase64(lastUser.imageUrl, user.id);
  const chronologicalPrior = all
    .filter((m) => m.createdAt.getTime() < lastUser.createdAt.getTime() && m.id !== lastUser.id)
    .reverse();
  const cleanUserText = lastUser.content || (lastUser.imageUrl ? "(mengirim foto tanpa teks)" : "");

  try {
    const memoryExtras = await buildMemoryExtrasForTurn({
      character,
      chronologicalHistory: chronologicalPrior,
      excludeMessageId: lastUser.id,
      userText: cleanUserText,
      primaryProviderType: candidates[0]?.type,
    });

    const historyTurns = character.memoryEnabled
      ? toTimeAwareChatTurns(chronologicalPrior, lastUser.id)
      : toChatTurns(chronologicalPrior, lastUser.id);

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
          characterId: id,
          role: "assistant",
          content: result.bubbles[i],
          createdAt: new Date(baseTime + i),
        })
        .returning();
      assistantMessages.push(row);
    }

    return NextResponse.json({
      removedIds: stale.map((m) => m.id),
      lastUserId: lastUser.id,
      assistantMessages,
      fallbackUsed: result.fallbackUsed,
      providerLabel: result.providerLabel,
      primaryLabel: result.primaryLabel,
      keyRotated: result.keyRotated,
    });
  } catch (err) {
    return NextResponse.json(
      { error: toUserFacingError(err) },
      { status: 502 }
    );
  }
}
