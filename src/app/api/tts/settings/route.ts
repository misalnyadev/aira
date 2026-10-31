import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  cleanStyleText,
  cleanVoiceId,
  DEFAULT_TTS_ACCOUNT_SUMMARY,
  normalizeGeminiModelId,
  normalizeHdModelId,
  normalizeHdProvider,
  normalizeTtsConfig,
  parseTtsConfig,
  toTtsAccountSummary,
} from "@/lib/hdVoice";
import { mergePatchedBackupKeys, parseBackupKeys } from "@/lib/providerPool";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." };

async function checkSharedGeminiKey(userId: string): Promise<boolean> {
  const rows = await db
    .select({ apiKey: apiProviders.apiKey, backupKeys: apiProviders.backupKeys })
    .from(apiProviders)
    .where(and(eq(apiProviders.userId, userId), eq(apiProviders.type, "gemini")));

  return rows.some(
    (r) => Boolean(r.apiKey?.trim()) || parseBackupKeys(r.backupKeys, r.apiKey).length > 0
  );
}

export async function GET() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const [[row], hasSharedGeminiKey] = await Promise.all([
    db
      .select({ ttsConfig: users.ttsConfig })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
    checkSharedGeminiKey(user.id),
  ]);

  if (!row) {
    return NextResponse.json({
      tts: {
        ...DEFAULT_TTS_ACCOUNT_SUMMARY,
        hasSharedGeminiKey,
        hasActiveKey: hasSharedGeminiKey,
      },
    });
  }

  return NextResponse.json({
    tts: toTtsAccountSummary(parseTtsConfig(row.ttsConfig), { hasSharedGeminiKey }),
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
    modelId?: unknown;
    femaleVoiceId?: unknown;
    maleVoiceId?: unknown;
    stability?: unknown;
    similarityBoost?: unknown;
  };

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

  const [[row], hasSharedGeminiKey] = await Promise.all([
    db
      .select({ ttsConfig: users.ttsConfig })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
    checkSharedGeminiKey(user.id),
  ]);

  const current = parseTtsConfig(row?.ttsConfig);

  // Kunci Gemini khusus suara
  let nextGeminiPrimary = current.geminiApiKey;
  if (patch.clearGeminiApiKey) {
    nextGeminiPrimary = "";
  } else if (typeof patch.geminiApiKey === "string" && patch.geminiApiKey.trim()) {
    nextGeminiPrimary = patch.geminiApiKey.trim();
  }

  const nextGeminiBackups = mergePatchedBackupKeys(
    current.geminiBackupKeys,
    {
      backupKeys: patch.geminiBackupKeys,
      keepBackupIndexes: patch.keepGeminiBackupIndexes,
      newBackupKeys: patch.newGeminiBackupKeys,
    },
    nextGeminiPrimary
  );

  // Kunci ElevenLabs
  let nextPrimary = current.apiKey;
  if (patch.clearApiKey) {
    nextPrimary = "";
  } else if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
    nextPrimary = patch.apiKey.trim();
  }

  const nextBackups = mergePatchedBackupKeys(
    current.backupKeys,
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

  return NextResponse.json({ tts: toTtsAccountSummary(merged, { hasSharedGeminiKey }) });
}
