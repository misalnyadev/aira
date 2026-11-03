import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  cleanStyleText,
  cleanTtsModelId,
  cleanVoiceId,
  DEFAULT_TTS_ACCOUNT_SUMMARY,
  normalizeGeminiModelId,
  normalizeHdModelId,
  normalizeHdProvider,
  normalizeTtsConfig,
  parseTtsConfig,
  toTtsAccountSummary,
} from "@/lib/hdVoice";
import {
  cleanBackupKeys,
  mergePatchedBackupKeys,
  promoteKeyAtIndex,
} from "@/lib/providerPool";
import { loadSharedGeminiKeySummaries } from "@/lib/ttsModelsServer";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." };

export async function GET() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const [[row], sharedGeminiProviders] = await Promise.all([
    db
      .select({ ttsConfig: users.ttsConfig })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
    loadSharedGeminiKeySummaries(user.id),
  ]);

  const hasSharedGeminiKey = sharedGeminiProviders.length > 0;

  if (!row) {
    return NextResponse.json({
      tts: {
        ...DEFAULT_TTS_ACCOUNT_SUMMARY,
        hasSharedGeminiKey,
        ...(hasSharedGeminiKey ? { sharedGeminiProviders } : {}),
        hasActiveKey: hasSharedGeminiKey,
      },
    });
  }

  return NextResponse.json({
    tts: toTtsAccountSummary(parseTtsConfig(row.ttsConfig), {
      hasSharedGeminiKey,
      sharedGeminiProviders,
    }),
  });
}

export async function PATCH(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Data setelan suara tidak valid." }, { status: 400 });
  }

  const patch = body as {
    provider?: unknown;
    // Gemini
    geminiApiKey?: string;
    clearGeminiApiKey?: boolean;
    geminiBackupKeys?: unknown;
    keepGeminiBackupIndexes?: unknown;
    newGeminiBackupKeys?: unknown;
    promoteGeminiBackupIndex?: unknown;
    replaceGeminiBackup?: unknown;
    geminiModelId?: unknown;
    geminiFemaleVoice?: unknown;
    geminiMaleVoice?: unknown;
    geminiStyle?: unknown;
    // ElevenLabs
    apiKey?: string;
    clearApiKey?: boolean;
    backupKeys?: unknown;
    keepBackupIndexes?: unknown;
    newBackupKeys?: unknown;
    promoteBackupIndex?: unknown;
    replaceBackup?: unknown;
    modelId?: unknown;
    femaleVoiceId?: unknown;
    maleVoiceId?: unknown;
    stability?: unknown;
    similarityBoost?: unknown;
  };

  if (
    patch.geminiModelId !== undefined &&
    typeof patch.geminiModelId === "string" &&
    patch.geminiModelId.trim() !== "" &&
    !cleanTtsModelId(patch.geminiModelId)
  ) {
    return NextResponse.json(
      { error: "ID model Gemini TTS tidak valid (hindari spasi)." },
      { status: 400 }
    );
  }
  if (
    patch.modelId !== undefined &&
    typeof patch.modelId === "string" &&
    patch.modelId.trim() !== "" &&
    !cleanTtsModelId(patch.modelId)
  ) {
    return NextResponse.json(
      { error: "ID model ElevenLabs tidak valid (hindari spasi)." },
      { status: 400 }
    );
  }
  if (patch.geminiFemaleVoice !== undefined && !cleanVoiceId(patch.geminiFemaleVoice)) {
    return NextResponse.json(
      { error: "Nama suara Gemini Perempuan tidak valid." },
      { status: 400 }
    );
  }
  if (patch.geminiMaleVoice !== undefined && !cleanVoiceId(patch.geminiMaleVoice)) {
    return NextResponse.json(
      { error: "Nama suara Gemini Laki-laki tidak valid." },
      { status: 400 }
    );
  }
  if (patch.femaleVoiceId !== undefined && !cleanVoiceId(patch.femaleVoiceId)) {
    return NextResponse.json(
      { error: "Voice ID Perempuan tidak valid. Pastikan hanya huruf/angka tanpa spasi." },
      { status: 400 }
    );
  }
  if (patch.maleVoiceId !== undefined && !cleanVoiceId(patch.maleVoiceId)) {
    return NextResponse.json(
      { error: "Voice ID Laki-laki tidak valid. Pastikan hanya huruf/angka tanpa spasi." },
      { status: 400 }
    );
  }

  const [[row], sharedGeminiProviders] = await Promise.all([
    db
      .select({ ttsConfig: users.ttsConfig })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
    loadSharedGeminiKeySummaries(user.id),
  ]);
  const hasSharedGeminiKey = sharedGeminiProviders.length > 0;

  const current = parseTtsConfig(row?.ttsConfig);

  // Kunci Gemini khusus suara
  let nextGeminiPrimary = current.geminiApiKey;
  let baseGeminiBackups = [...current.geminiBackupKeys];

  if (
    patch.replaceGeminiBackup &&
    typeof patch.replaceGeminiBackup === "object"
  ) {
    const rep = patch.replaceGeminiBackup as { index?: unknown; apiKey?: unknown };
    const idx = typeof rep.index === "number" ? rep.index : -1;
    const val = typeof rep.apiKey === "string" ? rep.apiKey.trim() : "";
    if (idx >= 0 && idx < baseGeminiBackups.length && val) {
      baseGeminiBackups[idx] = val;
    }
  }

  if (typeof patch.promoteGeminiBackupIndex === "number") {
    const idx = patch.promoteGeminiBackupIndex;
    const promo = promoteKeyAtIndex(
      nextGeminiPrimary,
      baseGeminiBackups,
      nextGeminiPrimary.trim() ? idx + 1 : idx
    );
    if (promo) {
      nextGeminiPrimary = promo.apiKey;
      baseGeminiBackups = promo.backupKeys;
    }
  }

  if (patch.clearGeminiApiKey) {
    nextGeminiPrimary = "";
  } else if (typeof patch.geminiApiKey === "string" && patch.geminiApiKey.trim()) {
    nextGeminiPrimary = patch.geminiApiKey.trim();
  }

  const nextGeminiBackups =
    patch.replaceGeminiBackup || typeof patch.promoteGeminiBackupIndex === "number"
      ? cleanBackupKeys(baseGeminiBackups, nextGeminiPrimary)
      : mergePatchedBackupKeys(
          baseGeminiBackups,
          {
            backupKeys: patch.geminiBackupKeys,
            keepBackupIndexes: patch.keepGeminiBackupIndexes,
            newBackupKeys: patch.newGeminiBackupKeys,
          },
          nextGeminiPrimary
        );

  // Kunci ElevenLabs
  let nextPrimary = current.apiKey;
  let baseBackups = [...current.backupKeys];

  if (patch.replaceBackup && typeof patch.replaceBackup === "object") {
    const rep = patch.replaceBackup as { index?: unknown; apiKey?: unknown };
    const idx = typeof rep.index === "number" ? rep.index : -1;
    const val = typeof rep.apiKey === "string" ? rep.apiKey.trim() : "";
    if (idx >= 0 && idx < baseBackups.length && val) {
      baseBackups[idx] = val;
    }
  }

  if (typeof patch.promoteBackupIndex === "number") {
    const idx = patch.promoteBackupIndex;
    const promo = promoteKeyAtIndex(
      nextPrimary,
      baseBackups,
      nextPrimary.trim() ? idx + 1 : idx
    );
    if (promo) {
      nextPrimary = promo.apiKey;
      baseBackups = promo.backupKeys;
    }
  }

  if (patch.clearApiKey) {
    nextPrimary = "";
  } else if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
    nextPrimary = patch.apiKey.trim();
  }

  const nextBackups =
    patch.replaceBackup || typeof patch.promoteBackupIndex === "number"
      ? cleanBackupKeys(baseBackups, nextPrimary)
      : mergePatchedBackupKeys(
          baseBackups,
          {
            backupKeys: patch.backupKeys,
            keepBackupIndexes: patch.keepBackupIndexes,
            newBackupKeys: patch.newBackupKeys,
          },
          nextPrimary
        );

  const merged = normalizeTtsConfig({
    provider: patch.provider !== undefined ? normalizeHdProvider(patch.provider) : current.provider,
    geminiApiKey: nextGeminiPrimary,
    geminiBackupKeys: nextGeminiBackups,
    geminiModelId:
      patch.geminiModelId !== undefined
        ? normalizeGeminiModelId(patch.geminiModelId)
        : current.geminiModelId,
    geminiFemaleVoice:
      patch.geminiFemaleVoice !== undefined
        ? cleanVoiceId(patch.geminiFemaleVoice, current.geminiFemaleVoice)
        : current.geminiFemaleVoice,
    geminiMaleVoice:
      patch.geminiMaleVoice !== undefined
        ? cleanVoiceId(patch.geminiMaleVoice, current.geminiMaleVoice)
        : current.geminiMaleVoice,
    geminiStyle:
      patch.geminiStyle !== undefined ? cleanStyleText(patch.geminiStyle) : current.geminiStyle,
    apiKey: nextPrimary,
    backupKeys: nextBackups,
    modelId: patch.modelId !== undefined ? normalizeHdModelId(patch.modelId) : current.modelId,
    femaleVoiceId:
      patch.femaleVoiceId !== undefined
        ? cleanVoiceId(patch.femaleVoiceId, current.femaleVoiceId)
        : current.femaleVoiceId,
    maleVoiceId:
      patch.maleVoiceId !== undefined
        ? cleanVoiceId(patch.maleVoiceId, current.maleVoiceId)
        : current.maleVoiceId,
    stability: patch.stability !== undefined ? patch.stability : current.stability,
    similarityBoost:
      patch.similarityBoost !== undefined ? patch.similarityBoost : current.similarityBoost,
  });

  await db
    .update(users)
    .set({ ttsConfig: JSON.stringify(merged) })
    .where(eq(users.id, user.id));

  return NextResponse.json({
    tts: toTtsAccountSummary(merged, {
      hasSharedGeminiKey,
      sharedGeminiProviders,
    }),
  });
}
