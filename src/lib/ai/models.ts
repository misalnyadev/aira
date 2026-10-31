import type { ProviderType } from "@/db/schema";
import { PROVIDER_META } from "./providerDefaults";
import { AiProviderError } from "./types";

export type ModelOption = { id: string; label?: string };

/** Model non-chat (audio/TTS/embedding/safety guard/image gen) yang disaring dari pemilih model chat. */
const NON_CHAT =
  /(embedding|embed-|aqa|imagen|veo|tts|whisper|playai|orpheus|moderation|rerank|dall-e|stable-diffusion|sdxl|guard)/i;

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
function versionScore(id: string): number[] {
  return (id.match(/\d+/g) ?? []).slice(0, 3).map(Number);
}

export function sortModels(list: ModelOption[], recommended: string[]): ModelOption[] {
  return [...list].sort((a, b) => {
    const ra = recommended.indexOf(a.id);
    const rb = recommended.indexOf(b.id);
    if (ra !== rb) return (ra < 0 ? 999 : ra) - (rb < 0 ? 999 : rb);
    const va = versionScore(a.id);
    const vb = versionScore(b.id);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const diff = (vb[i] ?? 0) - (va[i] ?? 0);
      if (diff) return diff;
    }
    return a.id.localeCompare(b.id);
  });
}

/** Daftar model Gemini yang mendukung `generateContent`. */
async function listGeminiModels(apiKey: string): Promise<ModelOption[]> {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    { headers: { "x-goog-api-key": apiKey }, cache: "no-store" }
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
  apiKey: string
): Promise<ModelOption[]> {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, { headers, cache: "no-store" });
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
  baseUrl?: string | null
): Promise<ListedModelsResult> {
  const attempts = keys.length ? keys : [""];
  let lastError: unknown = null;

  for (let i = 0; i < attempts.length; i++) {
    try {
      const models =
        type === "gemini"
          ? await listGeminiModels(attempts[i])
          : await listOpenAiModels(
              baseUrl || PROVIDER_META[type]?.baseUrl || "",
              PROVIDER_META[type]?.name || type,
              attempts[i]
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
