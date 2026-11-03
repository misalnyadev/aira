import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  cleanTtsModelId,
  cleanVoiceId,
  normalizeHdProvider,
  parseTtsConfig,
  toTtsAccountSummary,
} from "@/lib/hdVoice";
import { parseBackupKeys, promoteKeyAtIndex } from "@/lib/providerPool";
import {
  collectTtsKeyPoolForUser,
  testTtsConnection,
} from "@/lib/ttsModelsServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

async function checkSharedGeminiKey(userId: string): Promise<boolean> {
  const rows = await db
    .select({ apiKey: apiProviders.apiKey, backupKeys: apiProviders.backupKeys })
    .from(apiProviders)
    .where(and(eq(apiProviders.userId, userId), eq(apiProviders.type, "gemini")));

  return rows.some(
    (r) =>
      Boolean(r.apiKey?.trim()) ||
      parseBackupKeys(r.backupKeys, r.apiKey).length > 0
  );
}

/**
 * Uji langsung API key Suara HD (Gemini TTS maupun ElevenLabs) di sisi server:
 * - Mendukung key yang sedang diketik di form maupun key yang sudah tersimpan.
 * - Memeriksa ketersediaan model & menyembuhkan otomatis bila model lama dipensiunkan.
 */
export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Kamu belum masuk." },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const {
    provider: rawProvider,
    apiKey,
    backupKeys,
    clearStoredPrimary,
    keepBackupIndexes,
    modelId,
    voiceId,
  } = (body ?? {}) as {
    provider?: unknown;
    apiKey?: unknown;
    backupKeys?: unknown;
    clearStoredPrimary?: unknown;
    keepBackupIndexes?: unknown;
    modelId?: unknown;
    voiceId?: unknown;
  };

  const provider = normalizeHdProvider(rawProvider);

  const [row] = await db
    .select({ ttsConfig: users.ttsConfig })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const config = parseTtsConfig(row?.ttsConfig);

  const poolResult = await collectTtsKeyPoolForUser({
    userId: user.id,
    provider,
    config,
    typedPrimaryKey: typeof apiKey === "string" ? apiKey : "",
    typedBackupKeys: Array.isArray(backupKeys)
      ? backupKeys.filter((k): k is string => typeof k === "string")
      : [],
    clearStoredPrimary: Boolean(clearStoredPrimary),
    keepBackupIndexes: Array.isArray(keepBackupIndexes)
      ? keepBackupIndexes.filter((n): n is number => typeof n === "number")
      : undefined,
  });

  const targetModel =
    cleanTtsModelId(modelId) ||
    (provider === "gemini" ? config.geminiModelId : config.modelId);
  const targetVoice =
    cleanVoiceId(voiceId) ||
    (provider === "gemini" ? config.geminiFemaleVoice : config.femaleVoiceId);

  const probe = await testTtsConnection({
    provider,
    pool: poolResult.items,
    modelId: targetModel,
    voiceId: targetVoice,
  });

  if (!probe.ok) {
    return NextResponse.json(probe);
  }

  let updatedSummary = null;
  let promoted = false;

  if (!poolResult.hasUnsavedTypedKeys) {
    let nextConfig = config;
    let shouldPersist = false;

    if (
      probe.usedSource === "dedicated" &&
      typeof probe.usedDedicatedIndex === "number" &&
      probe.usedDedicatedIndex > 0
    ) {
      const promo = promoteKeyAtIndex(
        poolResult.storedDedicatedPrimary,
        poolResult.storedDedicatedBackups,
        probe.usedDedicatedIndex
      );
      if (promo) {
        promoted = true;
        shouldPersist = true;
        nextConfig =
          provider === "gemini"
            ? {
                ...nextConfig,
                geminiApiKey: promo.apiKey,
                geminiBackupKeys: promo.backupKeys,
              }
            : {
                ...nextConfig,
                apiKey: promo.apiKey,
                backupKeys: promo.backupKeys,
              };
      }
    }

    if (probe.healedFrom && probe.activeModel !== probe.healedFrom) {
      shouldPersist = true;
      nextConfig =
        provider === "gemini"
          ? { ...nextConfig, geminiModelId: probe.activeModel }
          : { ...nextConfig, modelId: probe.activeModel };
    }

    if (shouldPersist) {
      await db
        .update(users)
        .set({ ttsConfig: JSON.stringify(nextConfig) })
        .where(eq(users.id, user.id))
        .catch(() => undefined);
      const hasSharedGeminiKey = await checkSharedGeminiKey(user.id);
      updatedSummary = toTtsAccountSummary(nextConfig, { hasSharedGeminiKey });
    }
  }

  return NextResponse.json({
    ...probe,
    promoted,
    ...(updatedSummary ? { tts: updatedSummary } : {}),
  });
}
