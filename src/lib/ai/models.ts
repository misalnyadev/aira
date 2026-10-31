import type { ProviderType } from "@/db/schema";
import { PROVIDER_META, RECOMMENDED_MODELS } from "./providerDefaults";
import { AiProviderError } from "./types";

export type ModelOption = { id: string; label?: string };

/** Model non-chat (audio/TTS/embedding/safety guard/image gen/robotics) yang disaring dari pemilih model chat. */
const NON_CHAT =
  /(embedding|embed-|aqa|imagen|veo|tts|whisper|playai|orpheus|moderation|rerank|dall-e|stable-diffusion|sdxl|guard|image-generation|-image\b|computer-use|robotics|learnlm|bisect)/i;

/** Model kuno Gemini generasi 1.x / 2.x yang sudah dipensiunkan pada akun modern. */
const RETIRED_GEMINI_RE = /^gemini-[12](?:\.|-|$)/i;

export type ListedModelsResult = {
  models: ModelOption[];
  usedKeyIndex: number;
};

function dedupeModels(list: ModelOption[]): ModelOption[] {
  const seen = new Set<string>();
  const out: ModelOption[] = [];
  for (const item of list) {
    const id = item.id.trim();
    if (!id || seen.has(id) || NON_CHAT.test(id)) continue;
    seen.add(id);
    out.push({ id, label: item.label?.trim() || undefined });
  }
  return out;
}

/** Skor angka versi dari nama model supaya generasi terbaru muncul di atas. */
export function versionScore(id: string): number[] {
  return (id.match(/\d+/g) ?? []).slice(0, 3).map(Number);
}

function compareVersionDesc(aId: string, bId: string): number {
  const va = versionScore(aId);
  const vb = versionScore(bId);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const diff = (vb[i] ?? 0) - (va[i] ?? 0);
    if (diff) return diff;
  }
  // Utamakan alias bersih (mis. `gemini-3.5-flash-lite`) dibanding snapshot tanggal panjang (`...-001`).
  if (aId.length !== bId.length) return aId.length - bId.length;
  return aId.localeCompare(bId);
}

/**
 * Pilih daftar model rekomendasi secara DINAMIS dari model yang benar-benar
 * terdeteksi aktif di API key pengguna saat ini (bukan daftar statis yang bisa kedaluwarsa).
 */
export function pickDynamicRecommendedModels(
  models: readonly ModelOption[],
  type: ProviderType,
  maxCount = 4
): string[] {
  if (!models.length) return [];

  if (type === "gemini") {
    const geminiChat = models
      .map((m) => m.id)
      .filter((id) => /^gemini-/i.test(id) && !/latest$/i.test(id));
    const modernPool = geminiChat.filter((id) => !RETIRED_GEMINI_RE.test(id));
    const pool = modernPool.length > 0 ? modernPool : geminiChat.length > 0 ? geminiChat : models.map((m) => m.id);

    const stableFirst = (candidates: string[]) => {
      const nonExp = candidates.filter((id) => !/(exp|experimental)/i.test(id));
      const base = nonExp.length > 0 ? nonExp : candidates;
      const nonDated = base.filter((id) => !/-\d{3,}$/.test(id));
      return (nonDated.length > 0 ? nonDated : base).sort(compareVersionDesc);
    };

    const flashLite = stableFirst(pool.filter((id) => /flash-lite/i.test(id)));
    const flash = stableFirst(pool.filter((id) => /flash/i.test(id) && !/lite/i.test(id)));
    const pro = stableFirst(pool.filter((id) => /\bpro\b|-pro(?:-|$)/i.test(id)));
    const others = stableFirst(pool);

    const picked: string[] = [];
    for (const group of [flashLite, flash, pro, others]) {
      for (const id of group) {
        if (!picked.includes(id)) {
          picked.push(id);
          break;
        }
      }
      if (picked.length >= maxCount) break;
    }

    for (const id of others) {
      if (picked.length >= maxCount) break;
      if (!picked.includes(id)) picked.push(id);
    }

    return picked.slice(0, maxCount);
  }

  const availableSet = new Set(models.map((m) => m.id));
  const preferredStatic = (RECOMMENDED_MODELS[type] ?? []).filter((id) => availableSet.has(id));
  const picked = [...preferredStatic];

  const sortedRemaining = models
    .map((m) => m.id)
    .filter((id) => !picked.includes(id) && !/whisper|guard|vision-preview/i.test(id))
    .sort(compareVersionDesc);

  for (const id of sortedRemaining) {
    if (picked.length >= maxCount) break;
    picked.push(id);
  }

  return picked.slice(0, maxCount);
}

/**
 * Pilih satu model terbaik yang pasti tersedia di daftar model live:
 * - Mempertahankan `preferredCurrent` bila memang masih ada di daftar model aktif.
 * - Mengganti otomatis ke model aktif terbaik (mis. `gemini-3.5-flash-lite`) bila
 *   kosong atau model lama sudah tidak tersedia / dipensiunkan.
 */
export function pickBestAvailableModel(
  models: readonly ModelOption[],
  type: ProviderType,
  preferredCurrent?: string | null
): string {
  const cleanPref = preferredCurrent?.trim().replace(/^models\//, "") ?? "";
  if (cleanPref && models.some((m) => m.id === cleanPref)) {
    return cleanPref;
  }
  const dynamicRecs = pickDynamicRecommendedModels(models, type, 1);
  if (dynamicRecs.length > 0) return dynamicRecs[0];
  return models[0]?.id ?? cleanPref ?? PROVIDER_META[type]?.defaultModel ?? "";
}

export function sortModels(list: ModelOption[], recommended: string[]): ModelOption[] {
  return [...list].sort((a, b) => {
    const ra = recommended.indexOf(a.id);
    const rb = recommended.indexOf(b.id);
    if (ra !== rb) return (ra < 0 ? 999 : ra) - (rb < 0 ? 999 : rb);
    return compareVersionDesc(a.id, b.id);
  });
}

/** Daftar model Gemini yang mendukung `generateContent`. */
async function listGeminiModels(apiKey: string, timeoutMs = 8_000): Promise<ModelOption[]> {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    {
      headers: { "x-goog-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    }
  );

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    const message =
      res.status === 400 && /API key not valid/i.test(raw)
        ? "API key Gemini tidak valid."
        : res.status === 401 || res.status === 403
          ? "API key Gemini ditolak."
          : res.status === 429
            ? "Kuota Gemini untuk key ini tercapai (429)."
            : `Gemini menolak permintaan daftar model (${res.status}).`;
    throw new AiProviderError(message, { status: res.status });
  }

  const data = (await res.json()) as {
    models?: {
      name?: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }[];
  };

  return dedupeModels(
    (data.models ?? [])
      .filter((m) =>
        Array.isArray(m.supportedGenerationMethods)
          ? m.supportedGenerationMethods.includes("generateContent")
          : Boolean(m.name)
      )
      .map((m) => ({
        id: String(m.name ?? "").replace(/^models\//, ""),
        label: m.displayName,
      }))
  );
}

/** Daftar model dari endpoint OpenAI-compatible (Groq, OpenRouter, Custom, Grok). */
async function listOpenAiModels(
  baseUrl: string,
  providerLabel: string,
  apiKey: string,
  timeoutMs = 8_000
): Promise<ModelOption[]> {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const message =
      res.status === 401 || res.status === 403
        ? `${providerLabel}: API key ditolak saat memuat model (${res.status}).`
        : res.status === 429
          ? `${providerLabel}: limit key ini tercapai (429).`
          : `${providerLabel}: gagal memuat daftar model (${res.status}).`;
    throw new AiProviderError(message, { status: res.status });
  }

  const data = (await res.json()) as {
    data?: ({ id?: string; name?: string } | string)[];
    models?: ({ id?: string; name?: string } | string)[];
  };

  const rows = Array.isArray(data.data)
    ? data.data
    : Array.isArray(data.models)
      ? data.models
      : [];

  return dedupeModels(
    rows.map((row) =>
      typeof row === "string"
        ? { id: row }
        : { id: String(row.id ?? row.name ?? ""), label: row.name }
    )
  );
}

/**
 * Muat daftar model yang benar-benar aktif untuk key tertentu.
 * Key cadangan ikut dicoba bila key utama ditolak atau kena limit.
 */
export async function listProviderModels(
  type: ProviderType,
  keys: string[],
  baseUrl?: string | null,
  timeoutMs = 8_000
): Promise<ListedModelsResult> {
  const attempts = keys.length ? keys : [""];
  let lastError: unknown = null;

  for (let i = 0; i < attempts.length; i++) {
    try {
      const models =
        type === "gemini"
          ? await listGeminiModels(attempts[i], timeoutMs)
          : await listOpenAiModels(
              baseUrl || PROVIDER_META[type]?.baseUrl || "",
              PROVIDER_META[type]?.name || type,
              attempts[i],
              timeoutMs
            );
      if (!models.length) {
        throw new AiProviderError("Tidak ada model chat yang tersedia untuk key ini.");
      }
      return { models, usedKeyIndex: i };
    } catch (err) {
      lastError = err;
      const status = err instanceof AiProviderError ? err.status : undefined;
      const rotatable = status === 401 || status === 403 || status === 429 || status === undefined;
      if (!rotatable || i === attempts.length - 1) break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new AiProviderError("Gagal memuat daftar model.");
}

/**
 * Verifikasi & pilih model yang benar-benar tersedia di API key saat menyimpan provider.
 * Jika pemeriksaan jaringan gagal sementara, tetap fallback aman tanpa menggagalkan simpan.
 */
export async function resolveValidProviderModel({
  type,
  keys,
  baseUrl,
  requestedModel,
}: {
  type: ProviderType;
  keys: string[];
  baseUrl?: string | null;
  requestedModel?: string | null;
}): Promise<{ model: string; autoReplacedFrom: string | null }> {
  const cleanRequested = requestedModel?.trim() || "";
  const cleanKeys = keys.map((k) => k.trim()).filter(Boolean);

  if (cleanKeys.length > 0 || type === "custom") {
    try {
      const { models } = await listProviderModels(type, cleanKeys, baseUrl, 4_500);
      const best = pickBestAvailableModel(models, type, cleanRequested);
      if (best) {
        const replaced = cleanRequested && cleanRequested !== best ? cleanRequested : null;
        return { model: best, autoReplacedFrom: replaced };
      }
    } catch {
      /* fallback ke model yang diminta / default bila cek live sedang timeout */
    }
  }

  return {
    model: cleanRequested || PROVIDER_META[type]?.defaultModel || "",
    autoReplacedFrom: null,
  };
}
