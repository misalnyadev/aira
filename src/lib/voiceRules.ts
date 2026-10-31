/**
 * Aturan & pengolahan teks untuk suara lokal (Web Speech API).
 *
 * Sengaja bebas dari `window` dan React supaya seluruh perhitungannya —
 * pembersihan teks, pemecahan kalimat, pemilihan suara, dan validasi setelan —
 * bisa diuji langsung di Node.
 */

export type VoiceSettings = {
  /** Bacakan setiap balasan baru karakter secara otomatis. */
  enabled: boolean;
  /** URI suara pilihan di perangkat; kosong = pilih otomatis (utamakan Indonesia). */
  voiceURI: string;
  /** Kecepatan bicara (0.6–1.5). */
  rate: number;
  /** Tinggi-rendah nada suara (0.6–1.4). */
  pitch: number;
  /** Volume suara (0.2–1.0). */
  volume: number;
  /** Jeda napas antar kalimat dalam milidetik (0–500). */
  pause: number;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  voiceURI: "",
  rate: 0.95,
  pitch: 1.0,
  volume: 1,
  pause: 150,
};

export const VOICE_PRESETS: {
  id: string;
  label: string;
  hint: string;
  rate: number;
  pitch: number;
}[] = [
  { id: "natural", label: "Natural", hint: "paling seimbang", rate: 0.95, pitch: 1.0 },
  { id: "hangat", label: "Hangat", hint: "lebih pelan & rendah", rate: 0.88, pitch: 0.96 },
  { id: "santai", label: "Santai", hint: "mengalir seperti ngobrol", rate: 0.92, pitch: 1.04 },
  { id: "ceria", label: "Ceria", hint: "lebih cepat & tinggi", rate: 1.04, pitch: 1.1 },
  { id: "jelas", label: "Jelas", hint: "tempo normal", rate: 1.0, pitch: 1.0 },
];

export const VOICE_TEST_TEXT =
  "Hai, aku sudah siap menemani percakapanmu hari ini. Mau lanjut dari mana?";

/** Kunci penyimpanan lokal dipisah per akun supaya dua akun di satu perangkat tidak saling menimpa. */
export function voiceStorageKey(userId: string): string {
  return `aisherly:voice:${userId || "anon"}`;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/** Rapikan setelan suara dari sumber luar (mis. localStorage) agar selalu dalam batas aman. */
export function normalizeVoiceSettings(input: unknown): VoiceSettings {
  if (!input || typeof input !== "object") return { ...DEFAULT_VOICE_SETTINGS };
  const raw = input as Record<string, unknown>;

  const rate = Math.round(clampNumber(raw.rate, DEFAULT_VOICE_SETTINGS.rate, 0.6, 1.5) * 100) / 100;
  const pitch =
    Math.round(clampNumber(raw.pitch, DEFAULT_VOICE_SETTINGS.pitch, 0.6, 1.4) * 100) / 100;
  const volume =
    Math.round(clampNumber(raw.volume, DEFAULT_VOICE_SETTINGS.volume, 0.2, 1) * 100) / 100;
  const pause = Math.round(clampNumber(raw.pause, DEFAULT_VOICE_SETTINGS.pause, 0, 500));

  return {
    enabled: Boolean(raw.enabled),
    voiceURI: typeof raw.voiceURI === "string" ? raw.voiceURI : "",
    rate,
    pitch,
    volume,
    pause,
  };
}

export function isPresetActive(
  settings: Pick<VoiceSettings, "rate" | "pitch">,
  preset: { rate: number; pitch: number }
): boolean {
  return (
    Math.abs(settings.rate - preset.rate) < 0.01 &&
    Math.abs(settings.pitch - preset.pitch) < 0.01
  );
}

/** Bersihkan teks balasan agar enak dibacakan (tanpa penanda bubble, markdown, atau emoji). */
export function speakableText(input: string): string {
  return input
    .replace(/\[\[NEXT\]\]/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>~|]/g, "")
    .replace(/\s*—\s*/g, ", ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const MAX_CHUNK = 190; // batas aman agar kalimat panjang tidak terpotong di iOS Safari
const MIN_MERGE = 45; // kalimat super pendek digabung supaya tidak terdengar patah-patah

/** Pecah potongan yang terlalu panjang di batas kata (atau paksa potong bila ada satu kata raksasa). */
function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let current = "";

  for (const word of text.split(" ")) {
    if (!word) continue;
    if (word.length > max) {
      if (current) {
        out.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += max) {
        out.push(word.slice(i, i + max));
      }
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length > max) {
      if (current) out.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) out.push(current);
  return out;
}

/**
 * Pecah teks menjadi potongan kalimat siap baca.
 * Kalimat pendek digabung agar iramanya mengalir, sedangkan kalimat panjang
 * dipecah supaya intonasi wajar dan tidak dipotong diam-diam oleh iOS.
 */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const parts = trimmed
    .split(/\n+/)
    .flatMap((line) => line.replace(/([.!?…])\s+/g, "$1\u0000").split("\u0000"))
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => splitLong(part, MAX_CHUNK));

  const chunks: string[] = [];
  let buffer = "";
  for (const part of parts) {
    if (!buffer) {
      buffer = part;
      continue;
    }
    const combined = `${buffer} ${part}`;
    if (combined.length <= MIN_MERGE) {
      buffer = combined;
    } else {
      chunks.push(buffer);
      buffer = part;
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.length ? chunks : [trimmed];
}

export type MinimalVoice = {
  name: string;
  lang: string;
  voiceURI: string;
  localService?: boolean;
  default?: boolean;
};

/** Nama suara yang biasanya sudah kualitas tinggi / neural hasil unduhan. */
const NATURAL_VOICE = /(natural|neural|enhanced|premium|siri|wavenet|studio)/i;

export function isNaturalVoice(voice: Pick<MinimalVoice, "name">): boolean {
  return NATURAL_VOICE.test(voice.name ?? "");
}

/** Skor kualitas suara: makin tinggi makin diprioritaskan saat mode Otomatis. */
export function voiceScore(voice: MinimalVoice): number {
  let score = 0;
  if (isNaturalVoice(voice)) score += 4;
  if (voice.lang?.toLowerCase().startsWith("id")) score += 3;
  if (voice.localService) score += 1;
  if (voice.default) score += 1;
  return score;
}

/** Urutkan daftar suara: bahasa Indonesia & kualitas natural paling atas. */
export function sortVoices<T extends MinimalVoice>(voices: readonly T[]): T[] {
  return [...voices].sort(
    (a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name)
  );
}

/** Pilih suara: URI pilihan pengguna jika tersedia, kalau tidak jatuh ke skor tertinggi. */
export function pickVoice<T extends MinimalVoice>(
  voices: readonly T[],
  voiceURI: string
): T | null {
  if (!voices.length) return null;
  if (voiceURI) {
    const exact = voices.find((v) => v.voiceURI === voiceURI);
    if (exact) return exact;
  }
  return sortVoices(voices)[0] ?? null;
}
