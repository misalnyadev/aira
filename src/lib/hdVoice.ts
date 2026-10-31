import { cleanBackupKeys, maskKey } from "./providerPool";
import { speakableText } from "./voiceRules";

/**
 * Pengaturan & aturan murni untuk Suara HD (ElevenLabs).
 *
 * Bebas dari `window`, React, maupun koneksi database supaya bisa diuji
 * langsung di Node dan dipakai bersama oleh server maupun klien.
 */

export type VoiceEngineChoice = "device" | "hd_female" | "hd_male";

export type CharacterVoiceMode =
  | "inherit"
  | "device"
  | "hd_female"
  | "hd_male"
  | "hd_custom";

export type CharacterVoiceConfig = {
  mode: CharacterVoiceMode;
  customVoiceId?: string;
};

export type HdTtsModelId = "eleven_flash_v2_5" | "eleven_multilingual_v2";

export const HD_TTS_MODELS: {
  id: HdTtsModelId;
  label: string;
  hint: string;
}[] = [
  {
    id: "eleven_flash_v2_5",
    label: "Flash v2.5",
    hint: "Super cepat (~0,5 dtk) & hemat 50% kredit",
  },
  {
    id: "eleven_multilingual_v2",
    label: "Multilingual v2",
    hint: "Intonasi paling ekspresif (1 kredit/huruf)",
  },
];

/**
 * Suara premade resmi ElevenLabs yang langsung tersedia bahkan di akun Free
 * tanpa perlu berlangganan. Pengguna tetap bebas menempel Voice ID mana saja.
 */
export const FEMALE_VOICE_PRESETS: { id: string; label: string; hint: string }[] = [
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah", hint: "Lembut & hangat" },
  { id: "cgSgspJ2msm6clMCkdW9", label: "Jessica", hint: "Ceria & ekspresif" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", hint: "Tenang & jernih" },
];

export const MALE_VOICE_PRESETS: { id: string; label: string; hint: string }[] = [
  { id: "nPczCjzI2devNBz1zQrb", label: "Brian", hint: "Hangat & santai" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", label: "Liam", hint: "Muda & akrab" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel", hint: "Tenang & jelas" },
];

export const DEFAULT_FEMALE_VOICE_ID = FEMALE_VOICE_PRESETS[0].id;
export const DEFAULT_MALE_VOICE_ID = MALE_VOICE_PRESETS[0].id;
export const DEFAULT_HD_MODEL_ID: HdTtsModelId = "eleven_flash_v2_5";

/** Batas aman panjang teks sekali kirim ke ElevenLabs agar kuota terjaga. */
export const MAX_HD_TEXT_CHARS = 900;

/** Data utuh yang disimpan di kolom `users.tts_config` (hanya di sisi server). */
export type TtsAccountConfig = {
  apiKey: string;
  backupKeys: string[];
  modelId: HdTtsModelId;
  femaleVoiceId: string;
  maleVoiceId: string;
  stability: number;
  similarityBoost: number;
};

/** Ringkasan aman yang dikirim ke browser (API key asli tidak pernah ikut keluar). */
export type TtsAccountSummary = {
  hasKey: boolean;
  maskedKey: string;
  backupCount: number;
  maskedBackupKeys: string[];
  modelId: HdTtsModelId;
  femaleVoiceId: string;
  maleVoiceId: string;
  stability: number;
  similarityBoost: number;
};

export const DEFAULT_TTS_ACCOUNT_CONFIG: TtsAccountConfig = {
  apiKey: "",
  backupKeys: [],
  modelId: DEFAULT_HD_MODEL_ID,
  femaleVoiceId: DEFAULT_FEMALE_VOICE_ID,
  maleVoiceId: DEFAULT_MALE_VOICE_ID,
  stability: 0.45,
  similarityBoost: 0.78,
};

export const DEFAULT_TTS_ACCOUNT_SUMMARY: TtsAccountSummary = {
  hasKey: false,
  maskedKey: "",
  backupCount: 0,
  maskedBackupKeys: [],
  modelId: DEFAULT_HD_MODEL_ID,
  femaleVoiceId: DEFAULT_FEMALE_VOICE_ID,
  maleVoiceId: DEFAULT_MALE_VOICE_ID,
  stability: 0.45,
  similarityBoost: 0.78,
};

const SAFE_VOICE_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function cleanVoiceId(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return SAFE_VOICE_ID.test(trimmed) ? trimmed : fallback;
}

function clampUnit(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(Math.min(1, Math.max(0, num)) * 100) / 100;
}

export function normalizeHdModelId(value: unknown): HdTtsModelId {
  return value === "eleven_multilingual_v2" ? "eleven_multilingual_v2" : "eleven_flash_v2_5";
}

/**
 * Hanya model keluarga Flash/Turbo v2.5 yang menerima parameter `language_code`.
 * `eleven_multilingual_v2` akan menolak request 400 bila diberi `language_code`.
 */
export function supportsLanguageCode(modelId: HdTtsModelId): boolean {
  return modelId === "eleven_flash_v2_5";
}

export function normalizeTtsConfig(input: unknown): TtsAccountConfig {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_TTS_ACCOUNT_CONFIG, backupKeys: [] };
  }
  const raw = input as Record<string, unknown>;
  let apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
  let backupKeys = cleanBackupKeys(raw.backupKeys, apiKey);
  if (!apiKey && backupKeys.length > 0) {
    apiKey = backupKeys[0];
    backupKeys = backupKeys.slice(1);
  }

  return {
    apiKey,
    backupKeys,
    modelId: normalizeHdModelId(raw.modelId),
    femaleVoiceId: cleanVoiceId(raw.femaleVoiceId, DEFAULT_FEMALE_VOICE_ID),
    maleVoiceId: cleanVoiceId(raw.maleVoiceId, DEFAULT_MALE_VOICE_ID),
    stability: clampUnit(raw.stability, DEFAULT_TTS_ACCOUNT_CONFIG.stability),
    similarityBoost: clampUnit(raw.similarityBoost, DEFAULT_TTS_ACCOUNT_CONFIG.similarityBoost),
  };
}

export function parseTtsConfig(json: string | null | undefined): TtsAccountConfig {
  if (!json) return { ...DEFAULT_TTS_ACCOUNT_CONFIG, backupKeys: [] };
  try {
    return normalizeTtsConfig(JSON.parse(json));
  } catch {
    return { ...DEFAULT_TTS_ACCOUNT_CONFIG, backupKeys: [] };
  }
}

export function toTtsAccountSummary(config: TtsAccountConfig): TtsAccountSummary {
  return {
    hasKey: Boolean(config.apiKey.trim()),
    maskedKey: maskKey(config.apiKey),
    backupCount: config.backupKeys.length,
    maskedBackupKeys: config.backupKeys.map(maskKey),
    modelId: config.modelId,
    femaleVoiceId: config.femaleVoiceId,
    maleVoiceId: config.maleVoiceId,
    stability: config.stability,
    similarityBoost: config.similarityBoost,
  };
}

const VALID_CHAR_MODES = new Set<CharacterVoiceMode>([
  "inherit",
  "device",
  "hd_female",
  "hd_male",
  "hd_custom",
]);

export function normalizeCharacterVoice(input: unknown): CharacterVoiceConfig | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const modeRaw = typeof raw.mode === "string" ? (raw.mode as CharacterVoiceMode) : "inherit";
  if (!VALID_CHAR_MODES.has(modeRaw) || modeRaw === "inherit") {
    return null;
  }
  if (modeRaw === "hd_custom") {
    const customVoiceId = cleanVoiceId(raw.customVoiceId, "");
    if (!customVoiceId) return null;
    return { mode: "hd_custom", customVoiceId };
  }
  return { mode: modeRaw };
}

export function parseCharacterVoice(json: string | null | undefined): CharacterVoiceConfig | null {
  if (!json) return null;
  try {
    return normalizeCharacterVoice(JSON.parse(json));
  } catch {
    return null;
  }
}

export type ResolvedVoiceTarget =
  | { kind: "device" }
  | { kind: "hd"; slot: "female" | "male" | "custom"; customVoiceId?: string };

/**
 * Tentukan mesin suara akhir yang dipakai untuk satu karakter.
 * Bila API key ElevenLabs belum diisi di akun, otomatis kembali ke `device`
 * supaya karakter tidak pernah bisu.
 */
export function resolveVoiceTarget(
  characterVoice: CharacterVoiceConfig | null | undefined,
  accountEngine: VoiceEngineChoice,
  hasHdKey: boolean
): ResolvedVoiceTarget {
  const effectiveMode: CharacterVoiceMode = characterVoice?.mode ?? accountEngine;
  if (effectiveMode === "device" || effectiveMode === "inherit" || !hasHdKey) {
    return { kind: "device" };
  }
  if (effectiveMode === "hd_female") {
    return { kind: "hd", slot: "female" };
  }
  if (effectiveMode === "hd_male") {
    return { kind: "hd", slot: "male" };
  }
  if (effectiveMode === "hd_custom" && characterVoice?.customVoiceId) {
    return { kind: "hd", slot: "custom", customVoiceId: characterVoice.customVoiceId };
  }
  return { kind: "device" };
}

/**
 * Rapikan teks chat santai Indonesia sebelum dikirim ke ElevenLabs agar tidak
 * dieja huruf per huruf (mis. "wkwkwk" → "haha", "bangetttt" → "banget").
 */
export function speakableHdText(input: string): string {
  const base = speakableText(input);
  if (!base) return "";

  const natural = base
    // Tawa ketikan khas chat Indonesia: "wkwk", "wkwkwk", "wkawkawka" -> "haha"
    .replace(/\b(?:w+k+){2,}w*\b/gi, "haha")
    .replace(/\b(?:ha){3,}h?\b/gi, "haha")
    .replace(/\b(?:he){3,}h?\b/gi, "hehe")
    .replace(/\b(?:hi){3,}h?\b/gi, "hihi")
    // Huruf berulang panjang ("iyaaaa" -> "iyaa", "hmmmm" -> "hmm", "bangettt" -> "banget")
    .replace(/([aiueom])\1{2,}/gi, "$1$1")
    .replace(/([bcdfghjklnpqrstvwxyz])\1{2,}/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (natural.length <= MAX_HD_TEXT_CHARS) return natural;
  return natural.slice(0, MAX_HD_TEXT_CHARS).trim();
}

/** Status HTTP ElevenLabs yang layak dicoba ulang memakai API key cadangan. */
export function isRotatableTtsStatus(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 429;
}
