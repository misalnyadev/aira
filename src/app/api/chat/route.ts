import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { toUserFacingError } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { extractCallReplyEmotion, type CallEmotion } from "@/lib/callEmotion";
import {
  NO_PROVIDER_ERROR,
  buildMemoryExtrasForTurn,
  generateBubbles,
  loadUserChatSettings,
  pickProviderCandidates,
  refreshCharacterMemory,
  toChatTurns,
} from "@/lib/chatEngine";
import {
  describeTimeAwareness,
  toTimeAwareChatTurns,
} from "@/lib/characterMemory";
import { isUsingCallClipsInChat, parseCharacterMedia } from "@/lib/characterMedia";
import { ensureDb } from "@/lib/dbReady";
import { parseCharacterVoice } from "@/lib/hdVoice";
import { MAX_HISTORY_MESSAGES } from "@/lib/limits";
import { findOwnedCharacter } from "@/lib/owned";
import { captureAndBuildSharedNotesContext } from "@/lib/sharedNotesServer";
import { readImageAsBase64 } from "@/lib/uploads";
import { shouldReplyWithVoiceNote } from "@/lib/voiceNote";

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

  const { characterId, content, imageUrl, callMode, isVoiceNote } = body as {
    characterId?: string;
    content?: string;
    imageUrl?: string | null;
    callMode?: "video" | "audio" | null;
    isVoiceNote?: boolean;
  };
  const activeCallMode =
    callMode === "video" || callMode === "audio" ? callMode : undefined;
  const userSentVoiceNote = Boolean(isVoiceNote && !activeCallMode && content?.trim());

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
      isVoiceNote: userSentVoiceNote,
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

  const charVoiceCfg = parseCharacterVoice(character.voiceConfig);
  const replyAsVoiceNote = shouldReplyWithVoiceNote({
    mode: charVoiceCfg?.voiceNoteMode,
    userSentVoiceNote,
    userText: cleanUserText,
    hasImage: Boolean(imageUrl),
    callMode: activeCallMode,
  });

  try {
    const turnNow = new Date();
    const notesCtx = await captureAndBuildSharedNotesContext({
      scope: { characterId, scopeUserId: user.id },
      userText: cleanUserText,
      enableAutoCapture: !activeCallMode && !imageUrl,
      now: turnNow,
    }).catch(() => ({
      sharedNotesBlock: "",
      capturedNotes: [],
      activeCount: 0,
    }));

    const baseExtras = await buildMemoryExtrasForTurn({
      character,
      chronologicalHistory,
      excludeMessageId: userMessage.id,
      userText: cleanUserText,
      primaryProviderType: candidates[0]?.type,
      now: turnNow,
    });
    const priorRows = chronologicalHistory.filter((m) => m.id !== userMessage.id);
    const lastPrior = priorRows[priorRows.length - 1] ?? null;

    const memoryExtras =
      replyAsVoiceNote || notesCtx.sharedNotesBlock
        ? {
            ...baseExtras,
            ...(notesCtx.sharedNotesBlock
              ? {
                  sharedNotesBlock: notesCtx.sharedNotesBlock,
                  timeAwareness:
                    baseExtras?.timeAwareness ||
                    describeTimeAwareness(turnNow, lastPrior?.createdAt ?? null),
                }
              : {}),
            ...(replyAsVoiceNote ? { voiceNoteReply: true } : {}),
          }
        : baseExtras;

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
      callMode: activeCallMode,
    });

    const chatExpressionMode =
      !activeCallMode && isUsingCallClipsInChat(parseCharacterMedia(character.media));
    const shouldExtractEmotion = Boolean(activeCallMode || chatExpressionMode);

    let callEmotion: CallEmotion | undefined;
    let preparedBubbles: { content: string; emotion?: CallEmotion }[] =
      shouldExtractEmotion
        ? result.bubbles
            .map((raw, idx) => {
              const parsed = extractCallReplyEmotion(raw);
              if (activeCallMode && idx === 0) callEmotion = parsed.emotion;
              return { content: parsed.cleanText, emotion: parsed.emotion };
            })
            .filter((item) => item.content.length > 0)
        : result.bubbles.map((raw) => ({ content: raw }));

    if (replyAsVoiceNote && preparedBubbles.length > 1) {
      const mergedText = preparedBubbles.map((b) => b.content.trim()).join(" ");
      if (mergedText.length <= 450) {
        preparedBubbles = [
          { content: mergedText, emotion: preparedBubbles[0]?.emotion },
        ];
      }
    }

    const assistantMessages = [];
    const baseTime = Date.now();
    for (let i = 0; i < preparedBubbles.length; i++) {
      const item = preparedBubbles[i];
      const [row] = await db
        .insert(messages)
        .values({
          characterId,
          role: "assistant",
          content: item.content,
          isVoiceNote: replyAsVoiceNote,
          createdAt: new Date(baseTime + i),
        })
        .returning();
      assistantMessages.push(
        item.emotion ? { ...row, emotion: item.emotion } : row
      );
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
      capturedNotes: notesCtx.capturedNotes,
      ...(callEmotion ? { callEmotion } : {}),
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
