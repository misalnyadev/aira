import { cleanBackupKeys, maskKey } from "./providerPool";
import { normalizeVoiceNoteMode, type VoiceNoteReplyMode } from "./voiceNote";
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
  /** Penyedia khusus untuk `hd_custom` (`gemini` atau `elevenlabs`); kosong = ikut penyedia akun. */
  customProvider?: HdTtsProvider;
  customVoiceId?: string;
  /** Gaya bicara khas karakter ini untuk TTS (opsional, max 180). Kosong = ikut gaya slot global. */
  customStyle?: string;
  /** Gaya balasan Gelembung Voice Note karakter (`auto` bawaan). */
  voiceNoteMode?: VoiceNoteReplyMode;
};

/* ------------------------------------------------------------------ */
/* Gemini TTS (utama — logat Indonesia natural seperti WaiChat)        */
/* ------------------------------------------------------------------ */

export type GeminiTtsModelId = string;

export type TtsModelOption = {
  id: string;
  label?: string;
  hint?: string;
};

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
export const MAX_GEMINI_STYLE_PER_SLOT_CHARS = 180;

/* ------------------------------------------------------------------ */
/* ElevenLabs TTS (opsional — cocok bila punya Voice Clone sendiri)    */
/* ------------------------------------------------------------------ */

export type HdTtsModelId = string;

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
  /** Style global per slot — pisah agar tiap karakter bisa punya suara khas. Fallback ke geminiStyle lama. */
  geminiStyle: string;
  geminiFemaleStyle: string;
  geminiMaleStyle: string;
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
export type SharedGeminiKeySummary = {
  id: string;
  label: string;
  maskedKey: string;
  backupCount: number;
};

export type TtsAccountSummary = {
  provider: HdTtsProvider;
  /** Apakah penyedia yang sedang dipilih siap dipakai (punya key sendiri atau ikut Setelan). */
  hasActiveKey: boolean;
  // Gemini TTS
  hasGeminiKey: boolean;
  hasSharedGeminiKey: boolean;
  sharedGeminiProviders?: SharedGeminiKeySummary[];
  maskedGeminiKey: string;
  geminiBackupCount: number;
  maskedGeminiBackupKeys: string[];
  geminiModelId: GeminiTtsModelId;
  geminiFemaleVoice: string;
  geminiMaleVoice: string;
  geminiStyle: string;
  geminiFemaleStyle: string;
  geminiMaleStyle: string;
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
  geminiFemaleStyle: "",
  geminiMaleStyle: "",
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
  geminiFemaleStyle: "",
  geminiMaleStyle: "",
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

const SAFE_TTS_MODEL_ID = /^[A-Za-z0-9._:-]{3,96}$/;

/** Bersihkan ID model suara manual (menanggalkan awalan `models/` bila ditempel dari dokumentasi). */
export function cleanTtsModelId(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/^models\//i, "");
  return SAFE_TTS_MODEL_ID.test(trimmed) ? trimmed : "";
}

export function normalizeGeminiModelId(value: unknown): GeminiTtsModelId {
  return cleanTtsModelId(value) || DEFAULT_GEMINI_MODEL_ID;
}

/**
 * Gemini TTS generasi >= 3.8 memakai skema modern `{ voice: voiceName }` & `speech_metadata`.
 * Generasi sebelumnya (`2.5`, `3.1`) memakai `{ prebuiltVoiceConfig: { voiceName } }`.
 */
export function isModernGeminiTtsModel(modelId: string): boolean {
  const clean = modelId.trim().replace(/^models\//i, "");
  const match = /^gemini-(\d+)(?:\.(\d+))?/i.exec(clean);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = match[2] !== undefined ? Number(match[2]) : 0;
  return major > 3 || (major === 3 && minor >= 8);
}

export function normalizeHdModelId(value: unknown): HdTtsModelId {
  return cleanTtsModelId(value) || DEFAULT_HD_MODEL_ID;
}

/**
 * Model keluarga Flash/Turbo/v3 di ElevenLabs menerima parameter `language_code`.
 * `eleven_multilingual_v2` / `eleven_monolingual_v1` menolak request 400 bila diberi `language_code`.
 */
export function supportsLanguageCode(modelId: HdTtsModelId): boolean {
  return /flash|turbo|_v3\b/i.test(modelId);
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
    geminiFemaleStyle: cleanStyleText(raw.geminiFemaleStyle ?? raw.geminiStyle),
    geminiMaleStyle: cleanStyleText(raw.geminiMaleStyle ?? raw.geminiStyle),
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
  options: {
    hasSharedGeminiKey?: boolean;
    sharedGeminiProviders?: SharedGeminiKeySummary[];
  } = {}
): TtsAccountSummary {
  const hasGeminiKey = Boolean(config.geminiApiKey.trim());
  const sharedList = options.sharedGeminiProviders ?? [];
  const hasSharedGeminiKey = Boolean(
    options.hasSharedGeminiKey || sharedList.length > 0
  );
  const hasElevenKey = Boolean(config.apiKey.trim());
  const hasActiveKey =
    config.provider === "gemini" ? hasGeminiKey || hasSharedGeminiKey : hasElevenKey;

  return {
    provider: config.provider,
    hasActiveKey,
    hasGeminiKey,
    hasSharedGeminiKey,
    ...(sharedList.length > 0 ? { sharedGeminiProviders: sharedList } : {}),
    maskedGeminiKey: maskKey(config.geminiApiKey),
    geminiBackupCount: config.geminiBackupKeys.length,
    maskedGeminiBackupKeys: config.geminiBackupKeys.map(maskKey),
    geminiModelId: config.geminiModelId,
    geminiFemaleVoice: config.geminiFemaleVoice,
    geminiMaleVoice: config.geminiMaleVoice,
    geminiStyle: config.geminiStyle,
    geminiFemaleStyle: config.geminiFemaleStyle || config.geminiStyle,
    geminiMaleStyle: config.geminiMaleStyle || config.geminiStyle,
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

export function getGeminiStyleForSlot(config: TtsAccountConfig, slot: "female" | "male" | "custom", fallbackVoice?: string): string {
  if (slot === "male") return (config.geminiMaleStyle || config.geminiStyle || "").trim();
  if (slot === "female") return (config.geminiFemaleStyle || config.geminiStyle || "").trim();
  if (fallbackVoice) {
    const isMale = ["Puck","Charon","Fenrir","Orus","Iapetus","Enceladus","Umbriel"].some(v => v.toLowerCase()===fallbackVoice.toLowerCase());
    if (isMale) return (config.geminiMaleStyle || config.geminiStyle || "").trim();
  }
  return (config.geminiFemaleStyle || config.geminiStyle || "").trim();
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
  const vnMode =
    raw.voiceNoteMode !== undefined
      ? normalizeVoiceNoteMode(raw.voiceNoteMode, "auto")
      : undefined;
  const vnField = vnMode && vnMode !== "auto" ? { voiceNoteMode: vnMode } : {};

  if (!VALID_CHAR_MODES.has(modeRaw) || modeRaw === "inherit") {
    return vnField.voiceNoteMode ? { mode: "inherit", ...vnField } : null;
  }
  const customStyle = cleanStyleText(raw.customStyle ?? raw.customTtsStyle);
  const styleField = customStyle ? { customStyle } : {};
  if (modeRaw === "hd_custom") {
    const customVoiceId = cleanVoiceId(raw.customVoiceId, "");
    if (!customVoiceId) {
      return vnField.voiceNoteMode ? { mode: "inherit", ...vnField, ...styleField } : (styleField.customStyle ? { mode: "inherit", ...styleField, ...vnField } as any : null);
    }
    const customProvider =
      raw.customProvider === "gemini" || raw.customProvider === "elevenlabs"
        ? raw.customProvider
        : undefined;
    return customProvider
      ? { mode: "hd_custom", customProvider, customVoiceId, ...styleField, ...vnField }
      : { mode: "hd_custom", customVoiceId, ...styleField, ...vnField };
  }
  if (styleField.customStyle) return { mode: modeRaw, ...styleField, ...vnField };
  return { mode: modeRaw, ...vnField };
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
  | {
      kind: "hd";
      slot: "female" | "male" | "custom";
      customProvider?: HdTtsProvider;
      customVoiceId?: string;
      customStyle?: string;
    };

/**
 * Tentukan target mesin suara untuk satu karakter.
 *
 * Sengaja tetap mengembalikan `{ kind: "hd", ... }` walau API key sedang kosong
 * agar rekaman yang sudah pernah tersimpan di perangkat (IndexedDB) maupun di
 * Cloudflare R2 tetap bisa diputar lokal tanpa API key; bila klip belum ada di
 * cache dan API gagal, pemutar akan otomatis jatuh ke suara perangkat.
 */
export function resolveVoiceTarget(
  characterVoice: CharacterVoiceConfig | null | undefined,
  accountEngine: VoiceEngineChoice,
  _hasActiveHdKey = true
): ResolvedVoiceTarget {
  void _hasActiveHdKey;
  const effectiveMode: CharacterVoiceMode = characterVoice?.mode ?? accountEngine;
  if (effectiveMode === "device" || effectiveMode === "inherit") {
    return { kind: "device" };
  }
  if (effectiveMode === "hd_female") {
    return { kind: "hd", slot: "female" };
  }
  if (effectiveMode === "hd_male") {
    return { kind: "hd", slot: "male" };
  }
  if (effectiveMode === "hd_custom" && characterVoice?.customVoiceId) {
    return {
      kind: "hd",
      slot: "custom",
      customProvider: characterVoice.customProvider,
      customVoiceId: characterVoice.customVoiceId,
      ...(characterVoice.customStyle ? { customStyle: characterVoice.customStyle } : {}),
    };
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

/* ------------------------------------------------------------------ */
/* Pemecahan klausa & kunci cache deterministik (IndexedDB + R2)       */
/* ------------------------------------------------------------------ */

const MIN_CLAUSE_CHARS = 12;
const MAX_CLAUSE_CHARS = 190;

/**
 * Pecah teks balasan menjadi klausa/kalimat alami (12–190 huruf):
 * - Utamakan batas akhir kalimat (`.`, `!`, `?`, `…`, baris baru) supaya setiap
 *   kalimat pendek seperti "Aku kangen kamu." berdiri utuh dan mudah kena cache
 *   di R2 maupun IndexedDB lintas percakapan.
 * - Kalimat yang terlalu panjang baru dipecah di tanda baca jeda (`,`, `;`, `:`)
 *   lalu di batas kata agar intonasi tetap mulus.
 */
export function splitTtsClauses(input: string): string[] {
  const clean = speakableHdText(input);
  if (!clean) return [];

  const sentences = clean
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);

  const subParts: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= MAX_CLAUSE_CHARS) {
      subParts.push(sentence);
      continue;
    }
    const byComma = sentence
      .split(/(?<=[,;:])\s+/u)
      .map((p) => p.trim())
      .filter(Boolean);
    subParts.push(...byComma);
  }

  const merged: string[] = [];
  let buffer = "";
  for (const part of subParts) {
    const next = buffer ? `${buffer} ${part}` : part;
    if (next.length > MAX_CLAUSE_CHARS && buffer) {
      merged.push(buffer);
      buffer = part;
    } else if (buffer && buffer.length < MIN_CLAUSE_CHARS) {
      buffer = next;
    } else {
      if (buffer) merged.push(buffer);
      buffer = part;
    }
  }
  if (buffer) merged.push(buffer);

  const safe: string[] = [];
  for (const part of merged) {
    if (part.length <= MAX_CLAUSE_CHARS) {
      safe.push(part);
      continue;
    }
    let current = "";
    for (const word of part.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > MAX_CLAUSE_CHARS && current) {
        safe.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) safe.push(current);
  }
  return safe;
}

/**
 * Hitung hash deterministik pendek (identik di Browser maupun Node Server)
 * sebagai kunci klip di IndexedDB lokal dan Cloudflare R2 (`tts/{userId}/{hash}`).
 *
 * Sengaja tidak menyertakan versi minor model agar rekaman lama (mis. dari Kore)
 * tetap terpakai walau pengguna berganti model atau menghapus API key.
 */
export function ttsClipHash(params: {
  provider: HdTtsProvider;
  voice: string;
  style?: string;
  text: string;
}): string {
  const normStyle =
    params.provider === "gemini" ? (params.style ?? "").trim().toLowerCase() : "";
  const normText = params.text.trim().replace(/\s+/g, " ").toLowerCase();
  const payload = `${params.provider}|${params.voice.trim()}|${normStyle}|${normText}`;

  let h1 = 0x811c9dc5;
  let h2 = 5381;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (Math.imul(h2, 33) ^ c) >>> 0;
  }
  return `${h1.toString(36)}_${h2.toString(36)}_${normText.length.toString(36)}`;
}

/** 12 frasa obrolan sehari-hari untuk disiapkan lebih dulu ke Bank Rekaman. */
export const COMMON_VOICE_PHRASES = [
  "Hai!",
  "Halo.",
  "Iya.",
  "Hmm...",
  "Hehe.",
  "Apa kabar?",
  "Kamu lagi apa?",
  "Aku kangen kamu.",
  "Nanti aku kabari lagi ya.",
  "Maaf ya.",
  "Makasih.",
  "Sampai nanti.",
];

/* ------------------------------------------------------------------ */
/* Perankingan & Pemilihan Dinamis Model Suara HD (Jangka Panjang)     */
/* ------------------------------------------------------------------ */

function ttsVersionScore(id: string): number[] {
  return (id.match(/\d+/g) ?? []).slice(0, 3).map(Number);
}

function compareTtsVersionDesc(aId: string, bId: string): number {
  const va = ttsVersionScore(aId);
  const vb = ttsVersionScore(bId);
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const diff = (vb[i] ?? 0) - (va[i] ?? 0);
    if (diff) return diff;
  }
  if (aId.length !== bId.length) return aId.length - bId.length;
  return aId.localeCompare(bId);
}

/**
 * Pilih daftar rekomendasi model TTS secara DINAMIS dari model yang benar-benar
 * terdeteksi aktif di API key pengguna (otomatis beradaptasi bila generasi baru rilis).
 */
export function pickDynamicRecommendedTtsModels(
  models: readonly TtsModelOption[],
  provider: HdTtsProvider,
  maxCount = 4
): string[] {
  if (!models.length) return [];
  const ids = models.map((m) => m.id);

  if (provider === "gemini") {
    const modernPool = ids.filter((id) => {
      const m = /^gemini-(\d+)/i.exec(id);
      return m ? Number(m[1]) >= 3 : false;
    });
    const basePool = modernPool.length > 0 ? modernPool : ids;

    const cleanSort = (list: string[]) => {
      const nonExp = list.filter((id) => !/(exp|experimental)/i.test(id));
      const target = nonExp.length > 0 ? nonExp : list;
      return [...target].sort(compareTtsVersionDesc);
    };

    const flashMain = cleanSort(
      basePool.filter((id) => /flash/i.test(id) && !/lite/i.test(id))
    );
    const flashLite = cleanSort(basePool.filter((id) => /flash-lite|lite/i.test(id)));
    const pro = cleanSort(basePool.filter((id) => /\bpro\b|-pro(?:-|$)/i.test(id)));
    const fallbackLegacy = cleanSort(ids.filter((id) => !basePool.includes(id)));
    const others = cleanSort(ids);

    const picked: string[] = [];
    for (const group of [flashMain, flashLite, pro, fallbackLegacy, others]) {
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

  const flash = ids.filter((id) => /flash/i.test(id)).sort(compareTtsVersionDesc);
  const multilingual = ids
    .filter((id) => /multilingual/i.test(id))
    .sort(compareTtsVersionDesc);
  const turboOrV3 = ids
    .filter((id) => /turbo|_v[3-9]/i.test(id))
    .sort(compareTtsVersionDesc);
  const rest = ids
    .filter((id) => !/monolingual_v1/i.test(id))
    .sort(compareTtsVersionDesc);

  const picked: string[] = [];
  for (const group of [flash, multilingual, turboOrV3, rest, ids]) {
    for (const id of group) {
      if (!picked.includes(id)) {
        picked.push(id);
        break;
      }
    }
    if (picked.length >= maxCount) break;
  }
  for (const id of rest) {
    if (picked.length >= maxCount) break;
    if (!picked.includes(id)) picked.push(id);
  }
  return picked.slice(0, maxCount);
}

/**
 * Pilih satu model TTS terbaik yang pasti tersedia di daftar model live:
 * - Mempertahankan `preferredCurrent` bila memang masih ada di daftar aktif.
 * - Mengganti otomatis ke model aktif terbaik bila model lama sudah dipensiunkan.
 */
export function pickBestAvailableTtsModel(
  models: readonly TtsModelOption[],
  provider: HdTtsProvider,
  preferredCurrent?: string | null
): string {
  const cleanPref = cleanTtsModelId(preferredCurrent);
  if (cleanPref && models.some((m) => m.id === cleanPref)) {
    return cleanPref;
  }
  const recs = pickDynamicRecommendedTtsModels(models, provider, 1);
  if (recs.length > 0) return recs[0];
  return (
    models[0]?.id ||
    cleanPref ||
    (provider === "gemini" ? DEFAULT_GEMINI_MODEL_ID : DEFAULT_HD_MODEL_ID)
  );
}

export function sortTtsModels(
  list: readonly TtsModelOption[],
  recommended: readonly string[]
): TtsModelOption[] {
  return [...list].sort((a, b) => {
    const ra = recommended.indexOf(a.id);
    const rb = recommended.indexOf(b.id);
    if (ra !== rb) return (ra < 0 ? 999 : ra) - (rb < 0 ? 999 : rb);
    return compareTtsVersionDesc(a.id, b.id);
  });
}


