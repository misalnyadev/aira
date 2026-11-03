import { speakableText } from "./voiceRules";

/**
 * Aturan & pembangkit visual gelombang suara murni untuk Gelembung Voice Note (VN).
 * Bebas dari ketergantungan DOM/DB sehingga dapat diuji unit secara langsung.
 */

export type VoiceNoteReplyMode = "auto" | "occasional" | "always" | "off";

const VALID_VN_MODES = new Set<VoiceNoteReplyMode>([
  "auto",
  "occasional",
  "always",
  "off",
]);

export function normalizeVoiceNoteMode(
  input: unknown,
  fallback: VoiceNoteReplyMode = "auto"
): VoiceNoteReplyMode {
  if (typeof input === "string" && VALID_VN_MODES.has(input as VoiceNoteReplyMode)) {
    return input as VoiceNoteReplyMode;
  }
  return fallback;
}

/**
 * Tentukan apakah balasan karakter pada giliran ini dikirim sebagai Gelembung Voice Note.
 */
export function shouldReplyWithVoiceNote(params: {
  mode?: VoiceNoteReplyMode | null;
  userSentVoiceNote?: boolean;
  userText?: string;
  hasImage?: boolean;
  callMode?: "video" | "audio" | null;
  randomValue?: number;
}): boolean {
  if (params.callMode) return false;

  const mode = normalizeVoiceNoteMode(params.mode, "auto");
  if (mode === "off") return false;
  if (mode === "always") return true;
  if (params.userSentVoiceNote) return true;
  if (mode === "auto") return false;

  // Mode `occasional`: hindari VN bila pengguna sedang mengirim link/kode teknis panjang.
  const text = (params.userText ?? "").trim();
  if (/```|https?:\/\//i.test(text) || text.length > 260) {
    return false;
  }
  const roll =
    typeof params.randomValue === "number" ? params.randomValue : Math.random();
  return roll < 0.32;
}

/**
 * Estimasi durasi lisan alami (detik) dari teks Bahasa Indonesia (~2.3 kata/detik).
 */
export function estimateVoiceNoteSeconds(text: string): number {
  const clean = speakableText(text);
  if (!clean) return 2;
  const words = clean.split(/\s+/).filter(Boolean).length;
  const chars = clean.length;
  const byWords = words / 2.25;
  const byChars = chars / 14.5;
  const raw = Math.round((byWords * 0.65 + byChars * 0.35) + 0.6);
  return Math.max(2, Math.min(120, raw));
}

export function formatVoiceNoteDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function formatVoiceNotePreview(text: string): string {
  const secs = estimateVoiceNoteSeconds(text);
  return `🎙️ Pesan suara (${formatVoiceNoteDuration(secs)})`;
}

/**
 * Hasilkan deretan tinggi batang gelombang suara (`0.22` .. `1.0`) yang deterministik
 * dari isi pesan agar setiap Voice Note memiliki pola ritme unik seperti rekaman asli.
 */
export function buildWaveformBars(seedText: string, barCount = 26): number[] {
  const count = Math.max(8, Math.min(48, Math.floor(barCount)));
  const str = seedText || "vn";
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }

  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h ^= (i + 1) * 2654435761;
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0;
    const rand = (h & 0xffff) / 0xffff; // 0..1
    // Envelope lembut di awal & akhir rekaman
    const pos = count > 1 ? i / (count - 1) : 0.5;
    const edgeEnvelope = Math.sin(Math.PI * Math.min(1, Math.max(0.08, pos)));
    const phraseWave = 0.55 + 0.45 * Math.abs(Math.sin(pos * Math.PI * 3.2 + (h & 7)));
    const combined = 0.22 + 0.78 * (rand * 0.58 + phraseWave * 0.42) * (0.45 + 0.55 * edgeEnvelope);
    out.push(Number(Math.min(1, Math.max(0.22, combined)).toFixed(3)));
  }
  return out;
}
