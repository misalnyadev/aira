import { cleanBackupKeys, maskKey } from "./providerPool";
import { speakableText } from "./voiceRules";

/**
 * Pengaturan & aturan murni untuk Suara HD (Gemini TTS & ElevenLabs).
 *
 * Bebas dari `window`, React, maupun koneksi database supaya bisa diuji
 * langsung di Node dan dipakai bersama oleh server maupun klien.
 */

export type VoiceEngineChoice = "device" | "hd_female" | "hd_male";

export type HdTtsProvider = "gemini" | "elevenlabs";

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

/* ------------------------------------------------------------------ */
/* Gemini TTS (utama — logat Indonesia natural seperti WaiChat)        */
/* ------------------------------------------------------------------ */

export type GeminiTtsModelId =
  | "gemini-3.8-flash-tts"
  | "gemini-3.8-flash-lite-tts"
  | "gemini-3.1-flash-tts-preview"
  | "gemini-2.5-flash-preview-tts"
  | "gemini-2.5-pro-preview-tts";

export const GEMINI_TTS_MODELS: {
  id: GeminiTtsModelId;
  label: string;
  hint: string;
}[] = [
  {
    id: "gemini-3.8-flash-tts",
    label: "3.8 Flash",
    hint: "Logat Indonesia paling natural (seperti WaiChat)",
  },
  {
    id: "gemini-3.8-flash-lite-tts",
    label: "3.8 Lite",
    hint: "Paling cepat & hemat kuota harian",
  },
  {
    id: "gemini-2.5-flash-preview-tts",
    label: "2.5 Flash",
    hint: "Kompatibilitas luas di semua key gratis",
  },
];

export const GEMINI_FEMALE_PRESETS: { id: string; label: string; hint: string }[] = [
  { id: "Kore", label: "Kore", hint: "Tegas & hangat" },
  { id: "Aoede", label: "Aoede", hint: "Ringan & santai" },
  { id: "Leda", label: "Leda", hint: "Muda & ceria" },
  { id: "Zephyr", label: "Zephyr", hint: "Cerah & semangat" },
  { id: "Sulafat", label: "Sulafat", hint: "Lembut & ramah" },
  { id: "Callirrhoe", label: "Callirrhoe", hint: "Kalem & mengalir" },
  { id: "Despina", label: "Despina", hint: "Halus & akrab" },
];

export const GEMINI_MALE_PRESETS: { id: string; label: string; hint: string }[] = [
  { id: "Puck", label: "Puck", hint: "Riang & akrab" },
  { id: "Charon", label: "Charon", hint: "Tenang & dalam" },
  { id: "Fenrir", label: "Fenrir", hint: "Tegas & semangat" },
  { id: "Orus", label: "Orus", hint: "Mantap & hangat" },
  { id: "Iapetus", label: "Iapetus", hint: "Jernih & santai" },
  { id: "Enceladus", label: "Enceladus", hint: "Lembut & dekat" },
  { id: "Umbriel", label: "Umbriel", hint: "Kalem & tenang" },
];

export const DEFAULT_GEMINI_MODEL_ID: GeminiTtsModelId = "gemini-3.8-flash-tts";
export const DEFAULT_GEMINI_FEMALE_VOICE = "Kore";
export const DEFAULT_GEMINI_MALE_VOICE = "Puck";
export const MAX_GEMINI_STYLE_CHARS = 180;

/* ------------------------------------------------------------------ */
/* ElevenLabs TTS (opsional — cocok bila punya Voice Clone sendiri)    */
/* ------------------------------------------------------------------ */

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

export const FEMALE_VOICE_PRESETS: { id: string; label: string; hint: string }[] = [
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah", hint: "Lembut & hangat" },
  { id: "cgSgspJ2msm6clMCkdW9", label: "Jessica", hint: "Ceria & ekspresif" },
  { id: "hpp4J3VqNfWAUOO0d1Us", label: "Bella", hint: "Cerah & ramah" },
  { id: "pFZP5JQG7iQjIQuC4Bku", label: "Lily", hint: "Halus & anggun" },
  { id: "FGY2WhTYpPnrIDTdsKH5", label: "Laura", hint: "Antusias & santai" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", label: "Alice", hint: "Jernih & tenang" },
  { id: "XrExE9yKIg1WjnnlVkGX", label: "Matilda", hint: "Dewasa & kalem" },
];

export const MALE_VOICE_PRESETS: { id: string; label: string; hint: string }[] = [
  { id: "nPczCjzI2devNBz1zQrb", label: "Brian", hint: "Dalam & hangat" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", label: "Liam", hint: "Muda & akrab" },
  { id: "iP95p4xoKVk53GoZ742B", label: "Chris", hint: "Santai & ramah" },
  { id: "bIHbv24MWmeRgasZH58o", label: "Will", hint: "Tenang & optimis" },
  { id: "cjVigY5qzO86Huf0OWal", label: "Eric", hint: "Halus & mantap" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel", hint: "Jelas & berwibawa" },
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George", hint: "Hangat & bercerita" },
  { id: "IKne3meq5aSn9XLyUdCD", label: "Charlie", hint: "Tegas & bertenaga" },
];

export const DEFAULT_FEMALE_VOICE_ID = FEMALE_VOICE_PRESETS[0].id;
export const DEFAULT_MALE_VOICE_ID = MALE_VOICE_PRESETS[0].id;
export const DEFAULT_HD_MODEL_ID: HdTtsModelId = "eleven_flash_v2_5";

/** ID suara v1 lama yang sudah dipensiunkan ElevenLabs -> dipetakan otomatis ke penerusnya. */
const RETIRED_VOICE_MAP: Record<string, string> = {
  "21m00Tcm4TlvDq8ikWAM": "hpp4J3VqNfWAUOO0d1Us", // Rachel (v1 retired) -> Bella
};

/** Batas aman panjang teks sekali kirim ke mesin TTS agar kuota terjaga. */
export const MAX_HD_TEXT_CHARS = 900;

/** Data utuh yang disimpan di kolom `users.tts_config` (hanya di sisi server). */
export type TtsAccountConfig = {
  provider: HdTtsProvider;
  // Gemini TTS
  geminiApiKey: string;
  geminiBackupKeys: string[];
  geminiModelId: GeminiTtsModelId;
  geminiFemaleVoice: string;
  geminiMaleVoice: string;
  geminiStyle: string;
  // ElevenLabs TTS
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
  provider: HdTtsProvider;
  /** Apakah penyedia yang sedang dipilih siap dipakai (punya key sendiri atau ikut Setelan). */
  hasActiveKey: boolean;
  // Gemini TTS
  hasGeminiKey: boolean;
  hasSharedGeminiKey: boolean;
  maskedGeminiKey: string;
  geminiBackupCount: number;
  maskedGeminiBackupKeys: string[];
  geminiModelId: GeminiTtsModelId;
  geminiFemaleVoice: string;
  geminiMaleVoice: string;
  geminiStyle: string;
  // ElevenLabs TTS
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
  provider: "gemini",
  geminiApiKey: "",
  geminiBackupKeys: [],
  geminiModelId: DEFAULT_GEMINI_MODEL_ID,
  geminiFemaleVoice: DEFAULT_GEMINI_FEMALE_VOICE,
  geminiMaleVoice: DEFAULT_GEMINI_MALE_VOICE,
  geminiStyle: "",
  apiKey: "",
  backupKeys: [],
  modelId: DEFAULT_HD_MODEL_ID,
  femaleVoiceId: DEFAULT_FEMALE_VOICE_ID,
  maleVoiceId: DEFAULT_MALE_VOICE_ID,
  stability: 0.45,
  similarityBoost: 0.78,
};

export const DEFAULT_TTS_ACCOUNT_SUMMARY: TtsAccountSummary = {
  provider: "gemini",
  hasActiveKey: false,
  hasGeminiKey: false,
  hasSharedGeminiKey: false,
  maskedGeminiKey: "",
  geminiBackupCount: 0,
  maskedGeminiBackupKeys: [],
  geminiModelId: DEFAULT_GEMINI_MODEL_ID,
  geminiFemaleVoice: DEFAULT_GEMINI_FEMALE_VOICE,
  geminiMaleVoice: DEFAULT_GEMINI_MALE_VOICE,
  geminiStyle: "",
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

/** Mendukung nama suara Gemini (mis. "Kore", "Puck") maupun Voice ID ElevenLabs. */
const SAFE_VOICE_ID = /^[A-Za-z0-9_-]{2,64}$/;

export function cleanVoiceId(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!SAFE_VOICE_ID.test(trimmed)) return fallback;
  return RETIRED_VOICE_MAP[trimmed] ?? trimmed;
}

function clampUnit(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(Math.min(1, Math.max(0, num)) * 100) / 100;
}

export function normalizeHdProvider(value: unknown): HdTtsProvider {
  return value === "elevenlabs" ? "elevenlabs" : "gemini";
}

const VALID_GEMINI_MODELS = new Set<GeminiTtsModelId>([
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
]);

export function normalizeGeminiModelId(value: unknown): GeminiTtsModelId {
  return typeof value === "string" && VALID_GEMINI_MODELS.has(value as GeminiTtsModelId)
    ? (value as GeminiTtsModelId)
    : DEFAULT_GEMINI_MODEL_ID;
}

export function isModernGeminiTtsModel(modelId: string): boolean {
  return modelId === "gemini-3.8-flash-tts" || modelId === "gemini-3.8-flash-lite-tts";
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

export function cleanStyleText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_GEMINI_STYLE_CHARS);
}

export function normalizeTtsConfig(input: unknown): TtsAccountConfig {
  if (!input || typeof input !== "object") {
    return {
      ...DEFAULT_TTS_ACCOUNT_CONFIG,
      geminiBackupKeys: [],
      backupKeys: [],
    };
  }
  const raw = input as Record<string, unknown>;

  let geminiApiKey = typeof raw.geminiApiKey === "string" ? raw.geminiApiKey.trim() : "";
  let geminiBackupKeys = cleanBackupKeys(raw.geminiBackupKeys, geminiApiKey);
  if (!geminiApiKey && geminiBackupKeys.length > 0) {
    geminiApiKey = geminiBackupKeys[0];
    geminiBackupKeys = geminiBackupKeys.slice(1);
  }

  let apiKey = typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
  let backupKeys = cleanBackupKeys(raw.backupKeys, apiKey);
  if (!apiKey && backupKeys.length > 0) {
    apiKey = backupKeys[0];
    backupKeys = backupKeys.slice(1);
  }

  return {
    provider: normalizeHdProvider(raw.provider),
    geminiApiKey,
    geminiBackupKeys,
    geminiModelId: normalizeGeminiModelId(raw.geminiModelId),
    geminiFemaleVoice: cleanVoiceId(raw.geminiFemaleVoice, DEFAULT_GEMINI_FEMALE_VOICE),
    geminiMaleVoice: cleanVoiceId(raw.geminiMaleVoice, DEFAULT_GEMINI_MALE_VOICE),
    geminiStyle: cleanStyleText(raw.geminiStyle),
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
  if (!json) {
    return {
      ...DEFAULT_TTS_ACCOUNT_CONFIG,
      geminiBackupKeys: [],
      backupKeys: [],
    };
  }
  try {
    return normalizeTtsConfig(JSON.parse(json));
  } catch {
    return {
      ...DEFAULT_TTS_ACCOUNT_CONFIG,
      geminiBackupKeys: [],
      backupKeys: [],
    };
  }
}

export function toTtsAccountSummary(
  config: TtsAccountConfig,
  options: { hasSharedGeminiKey?: boolean } = {}
): TtsAccountSummary {
  const hasGeminiKey = Boolean(config.geminiApiKey.trim());
  const hasSharedGeminiKey = Boolean(options.hasSharedGeminiKey);
  const hasElevenKey = Boolean(config.apiKey.trim());
  const hasActiveKey =
    config.provider === "gemini" ? hasGeminiKey || hasSharedGeminiKey : hasElevenKey;

  return {
    provider: config.provider,
    hasActiveKey,
    hasGeminiKey,
    hasSharedGeminiKey,
    maskedGeminiKey: maskKey(config.geminiApiKey),
    geminiBackupCount: config.geminiBackupKeys.length,
    maskedGeminiBackupKeys: config.geminiBackupKeys.map(maskKey),
    geminiModelId: config.geminiModelId,
    geminiFemaleVoice: config.geminiFemaleVoice,
    geminiMaleVoice: config.geminiMaleVoice,
    geminiStyle: config.geminiStyle,
    hasKey: hasElevenKey,
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
 * Bila penyedia Suara HD yang aktif belum punya API key, otomatis kembali ke
 * `device` supaya karakter tidak pernah bisu.
 */
export function resolveVoiceTarget(
  characterVoice: CharacterVoiceConfig | null | undefined,
  accountEngine: VoiceEngineChoice,
  hasActiveHdKey: boolean
): ResolvedVoiceTarget {
  const effectiveMode: CharacterVoiceMode = characterVoice?.mode ?? accountEngine;
  if (effectiveMode === "device" || effectiveMode === "inherit" || !hasActiveHdKey) {
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
 * Rapikan teks chat santai Indonesia sebelum dikirim ke mesin Suara HD agar
 * tidak dieja huruf per huruf (mis. "wkwkwk" → "haha", "bangetttt" → "banget").
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

/** Status HTTP mesin TTS yang layak dicoba ulang memakai API key cadangan. */
export function isRotatableTtsStatus(status: number, body = ""): boolean {
  if (status === 401 || status === 402 || status === 403 || status === 429) return true;
  if (status === 400 && /api key not valid|api_key_invalid/i.test(body)) return true;
  return false;
}

/** Bungkus PCM 16-bit mono menjadi berkas WAV yang siap diputar di <audio>. */
export function pcmToWav(pcm: Uint8Array, sampleRate = 24_000): Uint8Array {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) header[offset + i] = text.charCodeAt(i);
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  view.setUint32(40, pcm.byteLength, true);

  const out = new Uint8Array(header.byteLength + pcm.byteLength);
  out.set(header, 0);
  out.set(pcm, header.byteLength);
  return out;
}

/** Ambil sample rate dari mimeType Gemini, mis. "audio/L16;codec=pcm;rate=24000". */
export function sampleRateFromMime(mimeType: string | undefined): number {
  const match = mimeType?.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24_000;
}
