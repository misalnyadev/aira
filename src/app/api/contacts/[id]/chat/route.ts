import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterContacts, characters, contactMessages } from "@/db/schema";
import { toUserFacingError, type MemoryPromptContext } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { extractCallReplyEmotion, type CallEmotion } from "@/lib/callEmotion";
import {
  describeTimeAwareness,
  toTimeAwareChatTurns,
} from "@/lib/characterMemory";
import {
  isUsingCallClipsInChat,
  parseCharacterMedia,
} from "@/lib/characterMedia";
import {
  NO_PROVIDER_ERROR,
  generateBubbles,
  loadUserChatSettings,
  pickProviderCandidates,
  toChatTurns,
} from "@/lib/chatEngine";
import { effectiveContactState } from "@/lib/contactPin";
import { serializeContactMessageForViewer } from "@/lib/contactsServer";
import { ensureDb } from "@/lib/dbReady";
import { parseCharacterVoice } from "@/lib/hdVoice";
import { MAX_HISTORY_MESSAGES } from "@/lib/limits";
import { captureAndBuildSharedNotesContext } from "@/lib/sharedNotesServer";
import { buildTeamMemoryContext } from "@/lib/teamMemory";
import { readImageAsBase64 } from "@/lib/uploads";
import { shouldReplyWithVoiceNote } from "@/lib/voiceNote";
import { extractWebBrowsePlan, gatherWebContext } from "@/lib/webBrowse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const { content, imageUrl, callMode, isVoiceNote } = body as {
    content?: string;
    imageUrl?: string | null;
    callMode?: "video" | "audio" | null;
    isVoiceNote?: boolean;
  };
  const activeCallMode =
    callMode === "video" || callMode === "audio" ? callMode : undefined;
  const userSentVoiceNote = Boolean(isVoiceNote && !activeCallMode && content?.trim());

  if (!content?.trim() && !imageUrl) {
    return NextResponse.json(
      { error: "Pesan tidak boleh kosong." },
      { status: 400 }
    );
  }

  const [contact] = await db
    .select()
    .from(characterContacts)
    .where(eq(characterContacts.id, id))
    .limit(1);

  if (
    !contact ||
    effectiveContactState(contact.adminStatus, contact.ownerStatus) !==
      "active" ||
    (contact.guestUserId !== user.id && contact.ownerUserId !== user.id)
  ) {
    return NextResponse.json(
      { error: "Kontak obrolan tidak ditemukan atau belum aktif." },
      { status: 404 }
    );
  }

  const contactMeta = {
    ownerUserId: contact.ownerUserId,
    guestUserId: contact.guestUserId,
  };

  // =========================================================================
  // KASUS A: Pengirim adalah Pemilik Karakter -> Balas Manual Murni (Tanpa AI)
  // =========================================================================
  if (user.id === contact.ownerUserId && user.id !== contact.guestUserId) {
    const cleanManualText = content?.trim() || "";
    const [manualRow] = await db
      .insert(contactMessages)
      .values({
        contactId: contact.id,
        senderKind: "owner_manual",
        content: cleanManualText,
        imageUrl: imageUrl || null,
        isVoiceNote: userSentVoiceNote,
      })
      .returning();

    const manualNotes = cleanManualText && !imageUrl
      ? await captureAndBuildSharedNotesContext({
          scope: {
            characterId: contact.characterId,
            scopeUserId: contact.guestUserId,
          },
          userText: cleanManualText,
          enableAutoCapture: true,
        }).catch(() => ({ capturedNotes: [] }))
      : { capturedNotes: [] };

    await db
      .update(characterContacts)
      .set({ updatedAt: new Date() })
      .where(eq(characterContacts.id, contact.id));

    return NextResponse.json({
      userMessage: serializeContactMessageForViewer(
        manualRow,
        "owner",
        contactMeta
      ),
      assistantMessages: [],
      capturedNotes: manualNotes.capturedNotes,
      manualReply: true,
    });
  }

  // =========================================================================
  // KASUS B: Pengirim adalah Pengundang (Guest)
  // =========================================================================
  const shouldRunAi = Boolean(contact.aiAutoReply || activeCallMode);

  // Jika mode manual aktif (AI dijeda oleh pemilik karakter) & bukan telepon:
  if (!shouldRunAi) {
    const cleanGuestManualText = content?.trim() || "";
    const [guestRow] = await db
      .insert(contactMessages)
      .values({
        contactId: contact.id,
        senderKind: "guest",
        content: cleanGuestManualText,
        imageUrl: imageUrl || null,
        isVoiceNote: userSentVoiceNote,
      })
      .returning();

    const guestManualNotes = cleanGuestManualText && !imageUrl
      ? await captureAndBuildSharedNotesContext({
          scope: {
            characterId: contact.characterId,
            scopeUserId: contact.guestUserId,
          },
          userText: cleanGuestManualText,
          enableAutoCapture: true,
        }).catch(() => ({ capturedNotes: [] }))
      : { capturedNotes: [] };

    await db
      .update(characterContacts)
      .set({ updatedAt: new Date() })
      .where(eq(characterContacts.id, contact.id));

    return NextResponse.json({
      userMessage: serializeContactMessageForViewer(
        guestRow,
        "guest",
        contactMeta
      ),
      assistantMessages: [],
      capturedNotes: guestManualNotes.capturedNotes,
      manualMode: true,
    });
  }

  // Jalankan AI menggunakan API Key & Profil milik PENGUNDANG sendiri!
  const [character] = await db
    .select()
    .from(characters)
    .where(eq(characters.id, contact.characterId))
    .limit(1);

  if (!character) {
    return NextResponse.json(
      { error: "Karakter tidak ditemukan." },
      { status: 404 }
    );
  }

  const { profile, autoFallback } = await loadUserChatSettings(user.id);
  const candidates = await pickProviderCandidates(user.id, null, autoFallback);
  if (!candidates.length) {
    return NextResponse.json({ error: NO_PROVIDER_ERROR }, { status: 412 });
  }

  const image = await readImageAsBase64(imageUrl, user.id);

  const [guestMessage] = await db
    .insert(contactMessages)
    .values({
      contactId: contact.id,
      senderKind: "guest",
      content: content?.trim() || "",
      imageUrl: imageUrl || null,
      isVoiceNote: userSentVoiceNote,
    })
    .returning();

  const historyRows = await db
    .select()
    .from(contactMessages)
    .where(eq(contactMessages.contactId, contact.id))
    .orderBy(desc(contactMessages.createdAt))
    .limit(MAX_HISTORY_MESSAGES + 1);

  const chronologicalRows = [...historyRows].reverse();
  const normalizedHistory = chronologicalRows.map((r) => ({
    id: r.id,
    characterId: character.id,
    role: r.senderKind === "guest" ? "user" : "assistant",
    content: r.content,
    imageUrl: r.imageUrl,
    status: r.status,
    createdAt: r.createdAt,
  }));

  const cleanUserText =
    content?.trim() || (imageUrl ? "(mengirim foto tanpa teks)" : "");

  const charVoiceCfg = parseCharacterVoice(character.voiceConfig);
  const replyAsVoiceNote = shouldReplyWithVoiceNote({
    mode: charVoiceCfg?.voiceNoteMode,
    userSentVoiceNote,
    userText: cleanUserText,
    hasImage: Boolean(imageUrl),
    callMode: activeCallMode,
  });

  try {
    const now = new Date();
    const notesCtx = await captureAndBuildSharedNotesContext({
      scope: { characterId: character.id, scopeUserId: contact.guestUserId },
      userText: cleanUserText,
      enableAutoCapture: !activeCallMode && !imageUrl,
      now,
    }).catch(() => ({
      sharedNotesBlock: "",
      capturedNotes: [],
      activeCount: 0,
    }));

    const prior = normalizedHistory.filter((m) => m.id !== guestMessage.id);
    const lastPrior = prior[prior.length - 1] ?? null;

    let memoryExtras: MemoryPromptContext | undefined;
    if (character.memoryEnabled || character.browsingEnabled) {
      let timeAwareness: string | undefined;
      let memorySummary: string | undefined;
      let webContext = "";
      let webSearchActive = false;

      if (character.memoryEnabled) {
        timeAwareness = describeTimeAwareness(now, lastPrior?.createdAt ?? null);
        memorySummary = contact.memorySummary || "";
      }

      if (character.browsingEnabled) {
        const browsePlan = extractWebBrowsePlan(cleanUserText);
        if (browsePlan.urls.length > 0 || browsePlan.shouldSearch) {
          webSearchActive = browsePlan.shouldSearch;
          const skipServerSearch =
            candidates[0]?.type === "gemini" && browsePlan.shouldSearch;
          webContext = await gatherWebContext(browsePlan, {
            skipServerSearch,
          }).catch(() => "");
        }
      }

      if (timeAwareness || memorySummary || webContext || webSearchActive) {
        memoryExtras = {
          timeAwareness,
          memorySummary,
          webContext,
          webSearchActive,
        };
      }
    }
    if (notesCtx.sharedNotesBlock) {
      memoryExtras = {
        ...memoryExtras,
        sharedNotesBlock: notesCtx.sharedNotesBlock,
        timeAwareness:
          memoryExtras?.timeAwareness ||
          describeTimeAwareness(now, lastPrior?.createdAt ?? null),
      };
    }
    const teamContext = await buildTeamMemoryContext({
      ownerUserId: contact.ownerUserId,
      currentCharacterId: character.id,
      sharedOnly: true,
    }).catch(() => "");
    if (teamContext) {
      memoryExtras = { ...memoryExtras, teamContext };
    }
    if (replyAsVoiceNote) {
      memoryExtras = { ...memoryExtras, voiceNoteReply: true };
    }

    const historyTurns = character.memoryEnabled
      ? toTimeAwareChatTurns(normalizedHistory, guestMessage.id)
      : toChatTurns(normalizedHistory, guestMessage.id);

    const result = await generateBubbles({
      userId: user.id,
      character: {
        ...character,
        providerId: null,
        memorySummary: contact.memorySummary || "",
      },
      candidates,
      userText: cleanUserText,
      image,
      history: historyTurns,
      userProfile: profile,
      memoryExtras,
      callMode: activeCallMode,
    });

    const chatExpressionMode =
      !activeCallMode &&
      isUsingCallClipsInChat(parseCharacterMedia(character.media));
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
      const [inserted] = await db
        .insert(contactMessages)
        .values({
          contactId: contact.id,
          senderKind: "character_ai",
          content: item.content,
          isVoiceNote: replyAsVoiceNote,
          createdAt: new Date(baseTime + i),
        })
        .returning();

      const serialized = serializeContactMessageForViewer(
        inserted,
        "guest",
        contactMeta
      );
      if (item.emotion) serialized.emotion = item.emotion;
      assistantMessages.push(serialized);
    }

    await db
      .update(characterContacts)
      .set({ updatedAt: new Date() })
      .where(eq(characterContacts.id, contact.id));

    return NextResponse.json({
      userMessage: serializeContactMessageForViewer(
        guestMessage,
        "guest",
        contactMeta
      ),
      assistantMessages,
      capturedNotes: notesCtx.capturedNotes,
      callEmotion,
    });
  } catch (err) {
    // Kembalikan pesan pengundang bila AI gagal menjawab agar riwayat tidak ganjil.
    await db
      .delete(contactMessages)
      .where(eq(contactMessages.id, guestMessage.id));
    return NextResponse.json(
      { error: toUserFacingError(err) },
      { status: 502 }
    );
  }
}
