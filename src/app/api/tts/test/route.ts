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
import {
  buildKeyAttempts,
  parseBackupKeys,
  promoteKeyAtIndex,
} from "@/lib/providerPool";
import {
  collectTtsKeyPoolForUser,
  loadSharedGeminiKeySummaries,
  testSingleTtsKey,
  testTtsConnection,
} from "@/lib/ttsModelsServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type RawTestTarget = {
  kind?: unknown;
  apiKey?: unknown;
  index?: unknown;
  providerId?: unknown;
};

/**
 * Uji koneksi API key Suara HD di sisi server:
 * - Bila `target` diberikan (`typed`, `dedicated_primary`, `dedicated_backup`, `shared_provider`):
 *   menguji TEPAT SATU key tersebut secara 1/1 dan mengembalikan daftar model suara yang aktif.
 * - Bila tanpa `target`: menguji seluruh antrean key suara pengguna.
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
    target: rawTarget,
    apiKey,
    backupKeys,
    clearStoredPrimary,
    keepBackupIndexes,
    modelId,
    voiceId,
  } = (body ?? {}) as {
    provider?: unknown;
    target?: RawTestTarget;
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
  const targetModel =
    cleanTtsModelId(modelId) ||
    (provider === "gemini" ? config.geminiModelId : config.modelId);
  const targetVoice =
    cleanVoiceId(voiceId) ||
    (provider === "gemini" ? config.geminiFemaleVoice : config.femaleVoiceId);

  // Mode uji 1/1 pada key tertentu (mirip menu Setelan & tes sebelum simpan)
  if (rawTarget && typeof rawTarget === "object" && typeof rawTarget.kind === "string") {
    const kind = rawTarget.kind;

    if (kind === "typed") {
      const typedKey = typeof rawTarget.apiKey === "string" ? rawTarget.apiKey.trim() : "";
      const single = await testSingleTtsKey({
        provider,
        apiKey: typedKey,
        modelId: targetModel,
        voiceId: targetVoice,
      });
      return NextResponse.json(single);
    }

    if (kind === "dedicated_primary") {
      const primaryKey = provider === "gemini" ? config.geminiApiKey : config.apiKey;
      if (!primaryKey.trim()) {
        return NextResponse.json({
          ok: false,
          error: "Key utama suara belum tersimpan.",
        });
      }
      const single = await testSingleTtsKey({
        provider,
        apiKey: primaryKey,
        modelId: targetModel,
        voiceId: targetVoice,
      });
      return NextResponse.json(single);
    }

    if (kind === "dedicated_backup") {
      const idx = typeof rawTarget.index === "number" ? rawTarget.index : -1;
      const list =
        provider === "gemini" ? config.geminiBackupKeys : config.backupKeys;
      const backupKey = idx >= 0 && idx < list.length ? list[idx] : "";
      if (!backupKey.trim()) {
        return NextResponse.json({
          ok: false,
          error: "Key cadangan tersebut tidak ditemukan.",
        });
      }
      const single = await testSingleTtsKey({
        provider,
        apiKey: backupKey,
        modelId: targetModel,
        voiceId: targetVoice,
      });
      return NextResponse.json(single);
    }

    if (kind === "shared_provider" && provider === "gemini") {
      const pid = typeof rawTarget.providerId === "string" ? rawTarget.providerId.trim() : "";
      const [provRow] = pid
        ? await db
            .select()
            .from(apiProviders)
            .where(and(eq(apiProviders.id, pid), eq(apiProviders.userId, user.id)))
            .limit(1)
        : [];
      if (!provRow || provRow.type !== "gemini") {
        return NextResponse.json({
          ok: false,
          error: "Provider Gemini di Setelan tidak ditemukan.",
        });
      }
      const provBackups = parseBackupKeys(provRow.backupKeys, provRow.apiKey);
      const provAttempts = buildKeyAttempts("gemini", provRow.apiKey, provBackups);
      if (provAttempts.length === 0) {
        return NextResponse.json({
          ok: false,
          error: "Provider Gemini di Setelan belum memiliki API key.",
        });
      }
      // Uji key pertama provider Setelan (atau cadangan internal provider itu bila ada)
      let lastRes = await testSingleTtsKey({
        provider: "gemini",
        apiKey: provAttempts[0],
        modelId: targetModel,
        voiceId: targetVoice,
      });
      if (!lastRes.ok && !lastRes.modelUnavailable && provAttempts.length > 1) {
        for (let i = 1; i < provAttempts.length; i++) {
          const retry = await testSingleTtsKey({
            provider: "gemini",
            apiKey: provAttempts[i],
            modelId: targetModel,
            voiceId: targetVoice,
          });
          if (retry.ok || retry.modelUnavailable) {
            lastRes = retry;
            break;
          }
        }
      }
      return NextResponse.json(lastRes);
    }
  }

  // Fallback: uji pool gabungan
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
      const sharedGeminiProviders = await loadSharedGeminiKeySummaries(user.id);
      updatedSummary = toTtsAccountSummary(nextConfig, {
        hasSharedGeminiKey: sharedGeminiProviders.length > 0,
        sharedGeminiProviders,
      });
    }
  }

  return NextResponse.json({
    ...probe,
    promoted,
    ...(updatedSummary ? { tts: updatedSummary } : {}),
  });
}
