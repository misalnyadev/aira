import { NextResponse } from "next/server";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { characters, messages } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { extractCallReplyEmotion, type CallEmotion } from "@/lib/callEmotion";
import {
  buildMemoryExtrasForTurn,
  generateBubbles,
  loadUserChatSettings,
  pickProviderCandidates,
  toChatTurns,
} from "@/lib/chatEngine";
import {
  describeTimeAwareness,
  toTimeAwareChatTurns,
} from "@/lib/characterMemory";
import { isUsingCallClipsInChat, parseCharacterMedia } from "@/lib/characterMedia";
import { ensureDb } from "@/lib/dbReady";
import { MAX_HISTORY_MESSAGES } from "@/lib/limits";
import { findOwnedCharacter } from "@/lib/owned";
import {
  MAX_PROACTIVE_BUBBLES,
  buildProactiveCheckInDirective,
  evaluateProactiveEligibility,
} from "@/lib/proactiveCheckIn";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/characters/[id]/check-in
 *
 * Dipicu secara senyap saat pengguna membuka ruang chat karakter setelah jeda
 * beberapa jam atau pergantian hari WIB. Bila semua syarat kelayakan & anti-spam
 * terpenuhi, karakter menyapa duluan 1–2 gelembung pendek secara alami.
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const { id: characterId } = await context.params;
  const character = await findOwnedCharacter(characterId, user.id);
  if (!character) {
    return NextResponse.json(
      { error: "Karakter tidak ditemukan." },
      { status: 404 }
    );
  }

  if (!character.proactiveEnabled) {
    return NextResponse.json({ triggered: false, reason: "disabled" });
  }

  const historyRows = await db
    .select()
    .from(messages)
    .where(eq(messages.characterId, characterId))
    .orderBy(desc(messages.createdAt))
    .limit(MAX_HISTORY_MESSAGES);

  const chronologicalHistory = [...historyRows].reverse();
  const lastMsg =
    chronologicalHistory[chronologicalHistory.length - 1] ?? null;

  let lastUserAt: Date | null = null;
  for (let i = chronologicalHistory.length - 1; i >= 0; i--) {
    if (chronologicalHistory[i].role === "user") {
      lastUserAt = chronologicalHistory[i].createdAt;
      break;
    }
  }

  const now = new Date();
  const eligibility = evaluateProactiveEligibility({
    proactiveEnabled: Boolean(character.proactiveEnabled),
    proactiveLastAt: character.proactiveLastAt,
    lastMessageAt: lastMsg?.createdAt ?? null,
    lastUserMessageAt: lastUserAt,
    messageCount: chronologicalHistory.length,
    now,
  });

  if (!eligibility.eligible || !lastMsg || !lastUserAt) {
    return NextResponse.json({
      triggered: false,
      reason: eligibility.eligible ? "no_conversation_yet" : eligibility.reason,
    });
  }

  const { profile, autoFallback } = await loadUserChatSettings(user.id);
  const candidates = await pickProviderCandidates(
    user.id,
    character.providerId,
    autoFallback
  );
  if (!candidates.length) {
    return NextResponse.json({ triggered: false, reason: "no_provider" });
  }

  // Klaim atomik supaya tab ganda / klik cepat tidak pernah memicu 2 sapaan beruntun.
  const previousLastAt = character.proactiveLastAt;
  const [claimed] = await db
    .update(characters)
    .set({ proactiveLastAt: now })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.userId, user.id),
        eq(characters.proactiveEnabled, true),
        or(
          isNull(characters.proactiveLastAt),
          lt(characters.proactiveLastAt, lastUserAt)
        )
      )
    )
    .returning({ id: characters.id });

  if (!claimed) {
    return NextResponse.json({ triggered: false, reason: "already_claimed" });
  }

  try {
    const directive = buildProactiveCheckInDirective({
      now,
      lastMessageAt: lastMsg.createdAt,
      hasMemorySummary: Boolean(character.memorySummary?.trim()),
    });

    const baseMemoryExtras = character.memoryEnabled
      ? await buildMemoryExtrasForTurn({
          character,
          chronologicalHistory,
          userText: lastMsg.content || "",
          primaryProviderType: candidates[0]?.type,
          now,
        })
      : undefined;

    const memoryExtras = {
      ...baseMemoryExtras,
      timeAwareness:
        baseMemoryExtras?.timeAwareness ||
        describeTimeAwareness(now, lastMsg.createdAt),
    };

    const historyTurns = character.memoryEnabled
      ? toTimeAwareChatTurns(chronologicalHistory)
      : toChatTurns(chronologicalHistory);

    const result = await generateBubbles({
      userId: user.id,
      character,
      candidates,
      userText: directive,
      image: null,
      history: historyTurns,
      userProfile: profile,
      memoryExtras,
    });

    const trimmedBubbles = result.bubbles.slice(0, MAX_PROACTIVE_BUBBLES);
    const chatExpressionMode = isUsingCallClipsInChat(
      parseCharacterMedia(character.media)
    );

    const prepared: { content: string; emotion?: CallEmotion }[] =
      chatExpressionMode
        ? trimmedBubbles
            .map((raw) => {
              const parsed = extractCallReplyEmotion(raw);
              return { content: parsed.cleanText, emotion: parsed.emotion };
            })
            .filter((item) => item.content.length > 0)
        : trimmedBubbles
            .map((raw) => ({ content: raw.trim() }))
            .filter((item) => item.content.length > 0);

    if (!prepared.length) {
      await db
        .update(characters)
        .set({ proactiveLastAt: previousLastAt })
        .where(eq(characters.id, characterId))
        .catch(() => undefined);
      return NextResponse.json({ triggered: false, reason: "empty_reply" });
    }

    const assistantMessages = [];
    const baseTime = Date.now();
    for (let i = 0; i < prepared.length; i++) {
      const item = prepared[i];
      const [row] = await db
        .insert(messages)
        .values({
          characterId,
          role: "assistant",
          content: item.content,
          createdAt: new Date(baseTime + i),
        })
        .returning();
      assistantMessages.push(
        item.emotion ? { ...row, emotion: item.emotion } : row
      );
    }

    return NextResponse.json({
      triggered: true,
      assistantMessages,
    });
  } catch {
    await db
      .update(characters)
      .set({ proactiveLastAt: previousLastAt })
      .where(eq(characters.id, characterId))
      .catch(() => undefined);
    return NextResponse.json({ triggered: false, reason: "generation_failed" });
  }
}
