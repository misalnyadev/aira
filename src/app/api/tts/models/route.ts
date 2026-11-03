import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  cleanTtsModelId,
  normalizeHdProvider,
  parseTtsConfig,
  pickBestAvailableTtsModel,
  pickDynamicRecommendedTtsModels,
} from "@/lib/hdVoice";
import {
  collectTtsKeyPoolForUser,
  listAvailableTtsModels,
} from "@/lib/ttsModelsServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Muat daftar model Suara HD yang benar-benar tersedia dari API key aktif
 * (mendukung key baru di form, key tersimpan di Suara, maupun key Gemini dari Setelan).
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
    currentModel,
  } = (body ?? {}) as {
    provider?: unknown;
    apiKey?: unknown;
    backupKeys?: unknown;
    clearStoredPrimary?: unknown;
    keepBackupIndexes?: unknown;
    currentModel?: unknown;
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

  if (poolResult.items.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          provider === "gemini"
            ? "Isi API key Gemini dulu (di menu Suara atau di menu Setelan)."
            : "Isi API key ElevenLabs dulu.",
      },
      { status: 400 }
    );
  }

  try {
    const keys = poolResult.items.map((item) => item.key);
    const { models, usedKeyIndex } = await listAvailableTtsModels(provider, keys);
    const recommended = pickDynamicRecommendedTtsModels(models, provider);
    const cleanCurrent = cleanTtsModelId(currentModel);
    const bestModel = pickBestAvailableTtsModel(
      models,
      provider,
      cleanCurrent || null
    );
    const currentAvailable = cleanCurrent
      ? models.some((m) => m.id === cleanCurrent)
      : true;
    const usedEntry = poolResult.items[usedKeyIndex];

    return NextResponse.json({
      ok: true,
      models,
      recommended,
      bestModel,
      currentAvailable,
      usedKeyIndex,
      usedKeyNumber: usedKeyIndex + 1,
      totalKeys: poolResult.items.length,
      usedSource: usedEntry?.source ?? "dedicated",
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error:
        err instanceof Error && err.message
          ? err.message
          : "Gagal memuat daftar model suara.",
    });
  }
}
