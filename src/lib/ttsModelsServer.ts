import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders } from "@/db/schema";
import {
  cleanTtsModelId,
  DEFAULT_FEMALE_VOICE_ID,
  DEFAULT_GEMINI_FEMALE_VOICE,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_HD_MODEL_ID,
  isModernGeminiTtsModel,
  isRotatableTtsStatus,
  pickBestAvailableTtsModel,
  supportsLanguageCode,
  type HdTtsProvider,
  type TtsAccountConfig,
  type TtsModelOption,
} from "./hdVoice";
import { buildKeyAttempts, parseBackupKeys } from "./providerPool";

const GEMINI_MODELS_URL =
  "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";
const GEMINI_GENERATE_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ELEVEN_BASE = "https://api.elevenlabs.io/v1";

export class TtsUpstreamError extends Error {
  status: number;
  rotatable: boolean;

  constructor(message: string, status: number, rawBody = "") {
    super(message);
    this.status = status;
    this.rotatable = isRotatableTtsStatus(status, rawBody);
  }
}

function dedupeTtsModels(list: TtsModelOption[]): TtsModelOption[] {
  const seen = new Set<string>();
  const out: TtsModelOption[] = [];
  for (const item of list) {
    const id = cleanTtsModelId(item.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: item.label?.trim() || undefined,
      hint: item.hint?.trim() || undefined,
    });
  }
  return out;
}

export async function listGeminiTtsModelsForKey(
  apiKey: string,
  timeoutMs = 8_000
): Promise<TtsModelOption[]> {
  const res = await fetch(GEMINI_MODELS_URL, {
    headers: { "x-goog-api-key": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    const msg =
      res.status === 400 && /api key not valid|api_key_invalid/i.test(raw)
        ? "API key Gemini tidak valid."
        : res.status === 401 || res.status === 403
          ? "API key Gemini ditolak."
          : res.status === 429
            ? "Kuota API key Gemini ini sedang habis (429)."
            : `Gemini menolak permintaan daftar model suara (HTTP ${res.status}).`;
    throw new TtsUpstreamError(msg, res.status, raw);
  }

  const data = (await res.json().catch(() => ({}))) as {
    models?: {
      name?: string;
      displayName?: string;
      description?: string;
      supportedGenerationMethods?: string[];
    }[];
  };

  return dedupeTtsModels(
    (data.models ?? [])
      .filter((m) => {
        const id = (m.name ?? "").replace(/^models\//, "");
        const methods = m.supportedGenerationMethods;
        if (Array.isArray(methods) && !methods.includes("generateContent")) {
          return false;
        }
        return (
          /tts/i.test(id) ||
          /\btts\b|text-to-speech/i.test(m.displayName ?? "") ||
          /text-to-speech/i.test(m.description ?? "")
        );
      })
      .map((m) => ({
        id: (m.name ?? "").replace(/^models\//, ""),
        label: m.displayName,
      }))
  );
}

export async function listElevenLabsTtsModelsForKey(
  apiKey: string,
  timeoutMs = 8_000
): Promise<TtsModelOption[]> {
  const res = await fetch(`${ELEVEN_BASE}/models`, {
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    const msg =
      res.status === 401 || res.status === 403
        ? "API key ElevenLabs ditolak atau belum memiliki izin baca model (models_read)."
        : res.status === 429
          ? "Batas laju ElevenLabs tercapai (429)."
          : `ElevenLabs menolak permintaan daftar model (HTTP ${res.status}).`;
    throw new TtsUpstreamError(msg, res.status, raw);
  }

  const data = (await res.json().catch(() => [])) as unknown;
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

  return dedupeTtsModels(
    rows
      .filter((m) => m.can_do_text_to_speech !== false)
      .map((m) => ({
        id: typeof m.model_id === "string" ? m.model_id : "",
        label: typeof m.name === "string" ? m.name : undefined,
      }))
  );
}

export async function listAvailableTtsModels(
  provider: HdTtsProvider,
  keys: string[],
  timeoutMs = 8_000
): Promise<{ models: TtsModelOption[]; usedKeyIndex: number }> {
  let lastErr: unknown = null;

  for (let idx = 0; idx < keys.length; idx++) {
    try {
      const models =
        provider === "gemini"
          ? await listGeminiTtsModelsForKey(keys[idx], timeoutMs)
          : await listElevenLabsTtsModelsForKey(keys[idx], timeoutMs);
      return { models, usedKeyIndex: idx };
    } catch (err) {
      lastErr = err;
      if (err instanceof TtsUpstreamError && err.rotatable && idx < keys.length - 1) {
        continue;
      }
      break;
    }
  }

  if (lastErr instanceof Error) throw lastErr;
  throw new TtsUpstreamError("Gagal memuat daftar model suara.", 502);
}

export type TtsKeyPoolSource = "typed" | "dedicated" | "shared";

export type TtsKeyPoolItem = {
  key: string;
  source: TtsKeyPoolSource;
  /** Indeks di pool dedicated `tts_config` bila berasal dari simpanan menu Suara (`0` = utama, `>=1` = cadangan). */
  dedicatedIndex?: number;
};

/**
 * Susun urutan API key suara yang akan diuji / dipakai mendeteksi model:
 * 1. Key yang baru diketik pengguna di form (jika sedang mengisi key baru sebelum klik Simpan).
 * 2. Key khusus suara yang sudah tersimpan di `users.tts_config` (menghormati hapus/edit di layar).
 * 3. Khusus Gemini: key Gemini bersama dari menu Setelan (`api_providers`).
 */
export async function collectTtsKeyPoolForUser(params: {
  userId: string;
  provider: HdTtsProvider;
  config: TtsAccountConfig;
  typedPrimaryKey?: string;
  typedBackupKeys?: string[];
  clearStoredPrimary?: boolean;
  keepBackupIndexes?: number[];
}): Promise<{
  items: TtsKeyPoolItem[];
  hasUnsavedTypedKeys: boolean;
  storedDedicatedPrimary: string;
  storedDedicatedBackups: string[];
}> {
  const {
    userId,
    provider,
    config,
    typedPrimaryKey = "",
    typedBackupKeys = [],
    clearStoredPrimary = false,
    keepBackupIndexes,
  } = params;

  const cleanTypedPrimary = typedPrimaryKey.trim();
  const cleanTypedBackups = typedBackupKeys.map((k) => k.trim()).filter(Boolean);
  const hasUnsavedTypedKeys =
    Boolean(cleanTypedPrimary) ||
    cleanTypedBackups.length > 0 ||
    clearStoredPrimary ||
    (Array.isArray(keepBackupIndexes) &&
      keepBackupIndexes.length !==
        (provider === "gemini"
          ? config.geminiBackupKeys.length
          : config.backupKeys.length));

  const rawStoredPrimary =
    provider === "gemini" ? config.geminiApiKey : config.apiKey;
  const rawStoredBackups =
    provider === "gemini" ? config.geminiBackupKeys : config.backupKeys;

  const effectiveStoredPrimary = clearStoredPrimary ? "" : rawStoredPrimary;
  const effectiveStoredBackups = Array.isArray(keepBackupIndexes)
    ? keepBackupIndexes
        .filter(
          (idx) =>
            Number.isInteger(idx) && idx >= 0 && idx < rawStoredBackups.length
        )
        .map((idx) => rawStoredBackups[idx])
    : rawStoredBackups;

  const dedicatedAttempts = buildKeyAttempts(
    provider,
    effectiveStoredPrimary,
    effectiveStoredBackups
  );

  const seen = new Set<string>();
  const items: TtsKeyPoolItem[] = [];

  const pushKey = (item: TtsKeyPoolItem) => {
    const trimmed = item.key.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    items.push({ ...item, key: trimmed });
  };

  if (cleanTypedPrimary) {
    pushKey({ key: cleanTypedPrimary, source: "typed" });
  }
  for (const bk of cleanTypedBackups) {
    pushKey({ key: bk, source: "typed" });
  }

  for (let i = 0; i < dedicatedAttempts.length; i++) {
    pushKey({
      key: dedicatedAttempts[i],
      source: "dedicated",
      dedicatedIndex: i,
    });
  }

  if (provider === "gemini") {
    const providerRows = await db
      .select({
        apiKey: apiProviders.apiKey,
        backupKeys: apiProviders.backupKeys,
        isDefault: apiProviders.isDefault,
      })
      .from(apiProviders)
      .where(and(eq(apiProviders.userId, userId), eq(apiProviders.type, "gemini")))
      .orderBy(desc(apiProviders.isDefault));

    for (const row of providerRows) {
      if (row.apiKey?.trim()) {
        pushKey({ key: row.apiKey, source: "shared" });
      }
      for (const bk of parseBackupKeys(row.backupKeys, row.apiKey)) {
        pushKey({ key: bk, source: "shared" });
      }
    }
  }

  return {
    items: items.slice(0, 10),
    hasUnsavedTypedKeys,
    storedDedicatedPrimary: rawStoredPrimary,
    storedDedicatedBackups: rawStoredBackups,
  };
}

async function runSingleGeminiSynthProbe(params: {
  apiKey: string;
  modelId: string;
  voiceName: string;
  timeoutMs?: number;
}): Promise<{ ok: true } | { ok: false; status: number; rawBody: string }> {
  const { apiKey, modelId, voiceName, timeoutMs = 12_000 } = params;
  const url = `${GEMINI_GENERATE_BASE}/${encodeURIComponent(modelId)}:generateContent`;

  const tryFormat = async (modern: boolean) => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Siap." }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: modern
              ? { voice: voiceName }
              : { prebuiltVoiceConfig: { voiceName } },
          },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const rawBody = await res.text().catch(() => "");
      return { ok: false as const, status: res.status, rawBody };
    }

    const data = (await res.json().catch(() => null)) as {
      candidates?: {
        content?: { parts?: { inlineData?: { data?: string } }[] };
      }[];
    } | null;
    const hasAudio = Boolean(
      data?.candidates?.[0]?.content?.parts?.some((p) => Boolean(p.inlineData?.data))
    );
    if (!hasAudio) {
      return {
        ok: false as const,
        status: 502,
        rawBody: "Model tidak mengembalikan data audio.",
      };
    }
    return { ok: true as const };
  };

  const preferModern = isModernGeminiTtsModel(modelId);
  const first = await tryFormat(preferModern);
  if (first.ok) return first;

  // Jika model generasi baru mengubah skema voiceConfig, otomatis coba skema alternatif.
  if (
    first.status === 400 &&
    /voice_config|voiceConfig|prebuiltVoiceConfig|speech_metadata|unknown name/i.test(
      first.rawBody
    )
  ) {
    const second = await tryFormat(!preferModern);
    if (second.ok) return second;
  }

  return first;
}

export type TtsConnectionTestResult =
  | {
      ok: true;
      usedKeyIndex: number;
      usedKeyNumber: number;
      totalKeys: number;
      usedSource: TtsKeyPoolSource;
      usedDedicatedIndex?: number;
      activeModel: string;
      healedFrom: string | null;
      quotaNote?: string;
    }
  | {
      ok: false;
      error: string;
      keysTried: number;
    };

export async function testTtsConnection(params: {
  provider: HdTtsProvider;
  pool: TtsKeyPoolItem[];
  modelId: string;
  voiceId?: string;
}): Promise<TtsConnectionTestResult> {
  const { provider, pool } = params;
  if (pool.length === 0) {
    return {
      ok: false,
      error:
        provider === "gemini"
          ? "API key Gemini belum diisi. Isi key Gemini di atas atau tambahkan di menu Setelan."
          : "API key ElevenLabs belum diisi.",
      keysTried: 0,
    };
  }

  let activeModel =
    cleanTtsModelId(params.modelId) ||
    (provider === "gemini" ? DEFAULT_GEMINI_MODEL_ID : DEFAULT_HD_MODEL_ID);
  let healedFrom: string | null = null;
  let triedHeal = false;
  const failures: string[] = [];

  if (provider === "gemini") {
    const voiceName = params.voiceId?.trim() || DEFAULT_GEMINI_FEMALE_VOICE;

    for (let i = 0; i < pool.length; i++) {
      const entry = pool[i];
      try {
        const probe = await runSingleGeminiSynthProbe({
          apiKey: entry.key,
          modelId: activeModel,
          voiceName,
        });

        if (probe.ok) {
          return {
            ok: true,
            usedKeyIndex: i,
            usedKeyNumber: i + 1,
            totalKeys: pool.length,
            usedSource: entry.source,
            usedDedicatedIndex: entry.dedicatedIndex,
            activeModel,
            healedFrom,
          };
        }

        if (!triedHeal && probe.status === 404) {
          triedHeal = true;
          try {
            const models = await listGeminiTtsModelsForKey(entry.key, 6_000);
            const nextModel = pickBestAvailableTtsModel(models, "gemini", null);
            if (nextModel && nextModel !== activeModel) {
              healedFrom = activeModel;
              activeModel = nextModel;
              i -= 1;
              continue;
            }
          } catch {
            // Lanjutkan ke pesan error di bawah.
          }
        }

        const msg =
          probe.status === 429 || /resource_exhausted|quota/i.test(probe.rawBody)
            ? "Kuota Gemini TTS pada key ini sedang habis (429)."
            : probe.status === 400 &&
                /api key not valid|api_key_invalid/i.test(probe.rawBody)
              ? "API key Gemini tidak valid."
              : probe.status === 401 || probe.status === 403
                ? "API key Gemini ditolak atau belum diizinkan untuk TTS."
                : probe.status === 404
                  ? `Model "${activeModel}" tidak tersedia di API key ini.`
                  : `Gemini TTS mengembalikan kendala (HTTP ${probe.status}).`;

        failures.push(msg);
        if (!isRotatableTtsStatus(probe.status, probe.rawBody)) break;
      } catch {
        failures.push("Koneksi ke server Gemini TTS melewati batas waktu.");
      }
    }

    return {
      ok: false,
      error: failures[failures.length - 1] || "Gagal terhubung ke Gemini TTS.",
      keysTried: failures.length,
    };
  }

  // ElevenLabs
  const voiceId = params.voiceId?.trim() || DEFAULT_FEMALE_VOICE_ID;

  for (let i = 0; i < pool.length; i++) {
    const entry = pool[i];
    try {
      let modelsChecked = false;
      try {
        const models = await listElevenLabsTtsModelsForKey(entry.key, 7_000);
        modelsChecked = true;
        if (models.length > 0 && !models.some((m) => m.id === activeModel)) {
          const replacement = pickBestAvailableTtsModel(models, "elevenlabs", null);
          if (replacement && replacement !== activeModel) {
            healedFrom = activeModel;
            activeModel = replacement;
          }
        }
      } catch (err) {
        if (err instanceof TtsUpstreamError) {
          // Jika key invalid umum (401 invalid_api_key), rotasi ke key berikutnya.
          // Namun jika scoped key hanya mematikan `models_read` (`missing_permissions`),
          // lanjutkan uji langsung ke endpoint TTS di bawah!
          if (err.status === 429 && i < pool.length - 1) {
            failures.push(err.message);
            continue;
          }
        }
      }

      // Cek sisa kuota karakter secara gratis (0 kredit) bila key punya izin user_read
      let quotaNote: string | undefined;
      try {
        const subRes = await fetch(`${ELEVEN_BASE}/user/subscription`, {
          headers: { "xi-api-key": entry.key },
          cache: "no-store",
          signal: AbortSignal.timeout(5_000),
        });
        if (subRes.ok) {
          const sub = (await subRes.json().catch(() => null)) as {
            character_count?: number;
            character_limit?: number;
          } | null;
          if (
            typeof sub?.character_count === "number" &&
            typeof sub?.character_limit === "number" &&
            sub.character_limit > 0
          ) {
            const remaining = Math.max(0, sub.character_limit - sub.character_count);
            quotaNote = `sisa ${remaining.toLocaleString("id-ID")}/${sub.character_limit.toLocaleString("id-ID")} karakter`;
            modelsChecked = true;
          }
        }
      } catch {
        // Opsional saja.
      }

      if (modelsChecked) {
        return {
          ok: true,
          usedKeyIndex: i,
          usedKeyNumber: i + 1,
          totalKeys: pool.length,
          usedSource: entry.source,
          usedDedicatedIndex: entry.dedicatedIndex,
          activeModel,
          healedFrom,
          quotaNote,
        };
      }

      // Fallback khusus scoped API key ketat yang hanya mengizinkan POST /v1/text-to-speech
      const payload: Record<string, unknown> = {
        text: "Tes.",
        model_id: activeModel,
      };
      if (supportsLanguageCode(activeModel)) {
        payload.language_code = "id";
      }

      const synthRes = await fetch(
        `${ELEVEN_BASE}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": entry.key,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (synthRes.ok) {
        await synthRes.arrayBuffer().catch(() => undefined);
        return {
          ok: true,
          usedKeyIndex: i,
          usedKeyNumber: i + 1,
          totalKeys: pool.length,
          usedSource: entry.source,
          usedDedicatedIndex: entry.dedicatedIndex,
          activeModel,
          healedFrom,
        };
      }

      const rawErr = await synthRes.text().catch(() => "");
      const msg =
        synthRes.status === 401 || synthRes.status === 403
          ? "API key ElevenLabs ditolak atau izin Text-to-Speech belum diaktifkan."
          : synthRes.status === 429 || /quota_exceeded/i.test(rawErr)
            ? "Kuota ElevenLabs pada key ini sudah habis."
            : synthRes.status === 404
              ? `Model atau Voice ID tidak ditemukan di ElevenLabs (${activeModel}).`
              : `ElevenLabs mengembalikan kendala (HTTP ${synthRes.status}).`;

      failures.push(msg);
      if (!isRotatableTtsStatus(synthRes.status, rawErr)) break;
    } catch {
      failures.push("Koneksi ke ElevenLabs melewati batas waktu.");
    }
  }

  return {
    ok: false,
    error: failures[failures.length - 1] || "Gagal terhubung ke ElevenLabs.",
    keysTried: failures.length,
  };
}
