import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, providerTypeValues, type ProviderType } from "@/db/schema";
import { toUserFacingError } from "@/lib/ai";
import {
  listProviderModels,
  pickBestAvailableModel,
  pickDynamicRecommendedModels,
} from "@/lib/ai/models";
import { PROVIDER_META } from "@/lib/ai/providerDefaults";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { buildKeyAttempts, parseBackupKeys } from "@/lib/providerPool";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Muat daftar model yang tersedia langsung dari API key provider:
 * - Saat menambah provider baru: memakai `apiKey` / `backupKeys` yang diketik di form.
 * - Saat mengedit provider tersimpan (`providerId`): memakai key baru bila diketik,
 *   lalu otomatis memakai key utama & key cadangan tersimpan di server tanpa perlu
 *   mengetik ulang API key.
 */
export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Kamu belum masuk." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { providerId, type, apiKey, backupKeys, baseUrl, currentModel } = (body ?? {}) as {
    providerId?: unknown;
    type?: unknown;
    apiKey?: unknown;
    backupKeys?: unknown;
    baseUrl?: unknown;
    currentModel?: unknown;
  };

  if (typeof type !== "string" || !providerTypeValues.includes(type as ProviderType)) {
    return NextResponse.json({ ok: false, error: "Tipe provider tidak valid." }, { status: 400 });
  }
  const providerType = type as ProviderType;

  const typedKeys = [
    ...(typeof apiKey === "string" ? [apiKey] : []),
    ...(Array.isArray(backupKeys)
      ? backupKeys.filter((k): k is string => typeof k === "string")
      : []),
  ]
    .map((k) => k.trim())
    .filter(Boolean);

  let storedKeys: string[] = [];
  let storedBaseUrl: string | null = null;

  if (typeof providerId === "string" && providerId.trim()) {
    const [existing] = await db
      .select()
      .from(apiProviders)
      .where(and(eq(apiProviders.id, providerId.trim()), eq(apiProviders.userId, user.id)))
      .limit(1);

    if (existing && existing.type === providerType) {
      const backups = parseBackupKeys(existing.backupKeys, existing.apiKey);
      storedKeys = buildKeyAttempts(providerType, existing.apiKey, backups).filter(Boolean);
      storedBaseUrl = existing.baseUrl;
    }
  }

  const keys = [...new Set([...typedKeys, ...storedKeys])];
  const cleanBaseUrl = typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : null;
  const resolvedBaseUrl =
    providerType === "custom"
      ? cleanBaseUrl || storedBaseUrl
      : cleanBaseUrl || PROVIDER_META[providerType]?.baseUrl || null;

  if (!keys.length && providerType !== "custom") {
    return NextResponse.json(
      {
        ok: false,
        error: `Isi API key ${PROVIDER_META[providerType]?.name ?? providerType} dulu.`,
      },
      { status: 400 }
    );
  }

  if (providerType === "custom" && !resolvedBaseUrl) {
    return NextResponse.json({ ok: false, error: "Base URL belum diisi." }, { status: 400 });
  }

  try {
    const { models, usedKeyIndex } = await listProviderModels(
      providerType,
      keys,
      resolvedBaseUrl
    );
    const recommended = pickDynamicRecommendedModels(models, providerType);
    const cleanCurrent = typeof currentModel === "string" ? currentModel.trim() : "";
    const bestModel = pickBestAvailableModel(models, providerType, cleanCurrent || null);
    const currentAvailable = cleanCurrent
      ? models.some((m) => m.id === cleanCurrent)
      : true;

    return NextResponse.json({
      ok: true,
      models,
      recommended,
      bestModel,
      currentAvailable,
      usedKeyIndex,
      usedKeyNumber: usedKeyIndex + 1,
      totalKeys: keys.length || 1,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: toUserFacingError(err, "Gagal memuat daftar model."),
    });
  }
}
