import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_VOICE_SETTINGS,
  VOICE_PRESETS,
  VOICE_TEST_TEXT,
  isNaturalVoice,
  isPresetActive,
  normalizeVoiceSettings,
  pickVoice,
   sortVoices,
  speakableText,
  splitSentences,
  voiceStorageKey,
  type VoiceSettings,
} from "./voiceRules";

export {
  DEFAULT_VOICE_SETTINGS,
  VOICE_PRESETS,
  VOICE_TEST_TEXT,
  isNaturalVoice,
  isPresetActive,
  normalizeVoiceSettings,
  sortVoices,
  speakableText,
  type VoiceSettings,
};

/**
 * Suara memakai Web Speech API bawaan browser — gratis, tanpa API key, dan
 * teksnya tidak dikirim ke server mana pun. Kualitas & daftar suara mengikuti
 * perangkat (iOS Safari punya "Damayanti" untuk bahasa Indonesia; Android &
 * desktop memakai mesin TTS sistem/browser).
 */

const subscribeNothing = () => () => {};

export function isSpeechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

/** Aman terhadap SSR: bernilai false di server lalu menyesuaikan di browser. */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(subscribeNothing, isSpeechSupported, () => false);
}

/* ------------------------------------------------------------------ */
/* Membuka mesin suara di iOS                                          */
/* ------------------------------------------------------------------ */

/**
 * iOS hanya mengizinkan `speechSynthesis.speak()` PERTAMA dijalankan dari dalam
 * gestur pengguna (ketuk / klik / tombol). Setelah satu ucapan benar-benar
 * mulai, panggilan berikutnya — termasuk yang datang beberapa detik kemudian
 * sesudah balasan AI tiba — ikut diizinkan.
 *
 * Kalau auto-baca sempat terblokir karena mesin belum terbuka, bacaan itu
 * disimpan sebentar lalu diputar ulang pada sentuhan berikutnya.
 */
let speechUnlocked = false;
let blockedSpeech: { text: string; settings: VoiceSettings; at: number } | null = null;
const BLOCKED_TTL_MS = 20_000;

export function unlockSpeech() {
  if (!isSpeechSupported() || speechUnlocked) return;
  const synth = window.speechSynthesis;
  try {
    if (synth.speaking || synth.pending) {
      speechUnlocked = true;
      return;
    }
    const utterance = new SpeechSynthesisUtterance(".");
    utterance.lang = "id-ID";
    utterance.rate = 3;
    utterance.volume = 0.02;
    const mark = () => {
      speechUnlocked = true;
    };
    utterance.onstart = mark;
    utterance.onend = mark;
    synth.speak(utterance);
  } catch {
    // Mesin belum siap — dicoba lagi pada sentuhan berikutnya.
  }
}

export function flushBlockedSpeech(): boolean {
  if (!blockedSpeech || !isSpeechSupported()) return false;
  const pending = blockedSpeech;
  if (Date.now() - pending.at > BLOCKED_TTL_MS) {
    blockedSpeech = null;
    return false;
  }
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) return false;
  blockedSpeech = null;
  return speak(pending.text, pending.settings, { append: true });
}

/**
 * Pasang sekali di akar aplikasi: sentuhan pertama membuka izin suara di iOS,
 * dan kembali dari latar belakang membangunkan lagi mesin suara yang terjeda.
 */
export function useSpeechUnlock() {
  useEffect(() => {
    const onGesture = () => {
      if (speechUnlocked) {
        flushBlockedSpeech();
        return;
      }
      unlockSpeech();
      window.setTimeout(() => flushBlockedSpeech(), 400);
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (isSpeechSupported()) {
        try {
          window.speechSynthesis.resume();
        } catch {
          // Diabaikan.
        }
      }
      // Setelah lama di latar belakang, izin iOS bisa hangus lagi.
      speechUnlocked = false;
    };

    document.addEventListener("touchend", onGesture, true);
    document.addEventListener("click", onGesture, true);
    document.addEventListener("keydown", onGesture, true);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("touchend", onGesture, true);
      document.removeEventListener("click", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}

/* ------------------------------------------------------------------ */
/* Daftar suara perangkat (stabil untuk useSyncExternalStore)          */
/* ------------------------------------------------------------------ */

const EMPTY_VOICES: SpeechSynthesisVoice[] = [];
let voiceCache: SpeechSynthesisVoice[] = EMPTY_VOICES;
let voiceCacheKey = "";

export function getVoicesSnapshot(): SpeechSynthesisVoice[] {
  if (!isSpeechSupported()) return EMPTY_VOICES;
  const list = window.speechSynthesis.getVoices();
  const key = list.map((v) => v.voiceURI).join("|");
  if (key !== voiceCacheKey) {
    voiceCacheKey = key;
    voiceCache = list.length ? list : EMPTY_VOICES;
  }
  return voiceCache;
}

export function subscribeVoices(onChange: () => void): () => void {
  if (!isSpeechSupported()) return () => {};
  const synth = window.speechSynthesis;
  synth.addEventListener("voiceschanged", onChange);
  return () => synth.removeEventListener("voiceschanged", onChange);
}

export function useVoices(): SpeechSynthesisVoice[] {
  return useSyncExternalStore(subscribeVoices, getVoicesSnapshot, () => EMPTY_VOICES);
}

/* ------------------------------------------------------------------ */
/* Antrean pemutaran                                                   */
/* ------------------------------------------------------------------ */

let generation = 0;
let chain: Promise<void> = Promise.resolve();
let pendingSpeech = 0;

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function buildUtterance(text: string, settings: VoiceSettings): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(window.speechSynthesis.getVoices(), settings.voiceURI);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = "id-ID";
  }
  utterance.rate = Math.min(1.6, Math.max(0.5, settings.rate || 1));
  utterance.pitch = Math.min(1.6, Math.max(0.5, settings.pitch || 1));
  utterance.volume = Math.min(1, Math.max(0, settings.volume ?? 1));
  return utterance;
}

function speakOne(utterance: SpeechSynthesisUtterance): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    let started = false;
    let settled = false;
    let kickTimer = 0;
    let giveUpTimer = 0;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(kickTimer);
      window.clearTimeout(giveUpTimer);
      resolve();
    };

    // 1,2 detik belum mulai -> bangunkan mesin sekali; 4 detik -> lewati agar antrean tidak macet.
    kickTimer = window.setTimeout(() => {
      if (started) return;
      try {
        synth.resume();
      } catch {
        // Diabaikan.
      }
    }, 1200);

    giveUpTimer = window.setTimeout(() => {
      if (started) return;
      try {
        synth.cancel();
      } catch {
        // Diabaikan.
      }
      finish();
    }, 4000);

    utterance.onstart = () => {
      started = true;
      speechUnlocked = true;
      blockedSpeech = null;
      window.clearTimeout(kickTimer);
      window.clearTimeout(giveUpTimer);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);
  });
}

/**
 * Bacakan teks.
 * - `append: true`  -> antrekan setelah bacaan yang sedang berjalan (untuk multi-bubble).
 * - `append: false` -> hentikan bacaan sebelumnya lalu mulai dari awal.
 */
export function speak(
  text: string,
  settings: VoiceSettings,
  options: { append?: boolean } = {}
): boolean {
  if (!isSpeechSupported()) return false;
  const clean = speakableText(text);
  if (!clean) return false;

  setSpeakingState(true);

  if (!speechUnlocked) {
    blockedSpeech = { text, settings, at: Date.now() };
  }

  const chunks = splitSentences(clean);
  const synth = window.speechSynthesis;

  if (!options.append) {
    generation += 1;
    pendingSpeech = 0;
    const wasBusy = synth.speaking || synth.pending;
    // Hindari cancel() saat diam: di iOS justru bisa membuat mesin suara "tertidur".
    if (wasBusy) synth.cancel();
    chain = wasBusy ? sleep(140) : Promise.resolve();
  }

  pendingSpeech += 1;
  const currentGeneration = generation;
  chain = chain.then(async () => {
    try {
      try {
        synth.resume();
      } catch {
        // Diabaikan.
      }
      for (let i = 0; i < chunks.length; i++) {
        if (currentGeneration !== generation) return;
        await speakOne(buildUtterance(chunks[i], settings));
        if (currentGeneration !== generation) return;
        if (i < chunks.length - 1) await sleep(Math.max(0, settings.pause ?? 150));
      }
    } finally {
      if (currentGeneration === generation) {
        pendingSpeech = Math.max(0, pendingSpeech - 1);
        if (pendingSpeech === 0) setSpeakingState(false);
      }
    }
  });

  return true;
}

export function stopSpeaking() {
  pendingSpeech = 0;
  blockedSpeech = null;
  setSpeakingState(false);
  if (!isSpeechSupported()) return;
  generation += 1;
  chain = Promise.resolve();
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Diabaikan.
  }
}

/* ------------------------------------------------------------------ */
/* Status "sedang berbicara"                                           */
/* ------------------------------------------------------------------ */

let speaking = false;
const speakingListeners = new Set<() => void>();

function setSpeakingState(next: boolean) {
  if (speaking === next) return;
  speaking = next;
  for (const listener of speakingListeners) listener();
}

export function subscribeSpeaking(listener: () => void): () => void {
  speakingListeners.add(listener);
  return () => {
    speakingListeners.delete(listener);
  };
}

export function getSpeakingSnapshot(): boolean {
  return speaking;
}

export function useIsSpeaking(): boolean {
  return useSyncExternalStore(subscribeSpeaking, getSpeakingSnapshot, () => false);
}

/* ------------------------------------------------------------------ */
/* Penyimpanan setelan per akun di browser                             */
/* ------------------------------------------------------------------ */

const settingsCache = new Map<string, { raw: string | null; value: VoiceSettings }>();
const settingsListeners = new Set<() => void>();

function notifySettingsListeners() {
  for (const listener of settingsListeners) listener();
}

export function loadVoiceSettings(userId: string): VoiceSettings {
  if (typeof window === "undefined") return DEFAULT_VOICE_SETTINGS;
  const key = voiceStorageKey(userId);
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return settingsCache.get(key)?.value ?? DEFAULT_VOICE_SETTINGS;
  }

  const cached = settingsCache.get(key);
  if (cached && cached.raw === raw) return cached.value;

  let value = DEFAULT_VOICE_SETTINGS;
  if (raw) {
    try {
      value = normalizeVoiceSettings(JSON.parse(raw));
    } catch {
      value = DEFAULT_VOICE_SETTINGS;
    }
  }
  settingsCache.set(key, { raw, value });
  return value;
}

export function saveVoiceSettings(userId: string, next: VoiceSettings): VoiceSettings {
  const normalized = normalizeVoiceSettings(next);
  const key = voiceStorageKey(userId);
  const serialized = JSON.stringify(normalized);
  settingsCache.set(key, { raw: serialized, value: normalized });

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key, serialized);
    } catch {
      // Mode privat yang memblokir localStorage: tetap jalan lewat cache memori.
    }
  }
  notifySettingsListeners();
  return normalized;
}

function subscribeVoiceSettings(onChange: () => void): () => void {
  settingsListeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith("aisherly:voice:")) onChange();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    settingsListeners.delete(onChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function useVoiceSettings(
  userId: string
): [VoiceSettings, (next: VoiceSettings | ((prev: VoiceSettings) => VoiceSettings)) => void] {
  const getSnapshot = useCallback(() => loadVoiceSettings(userId), [userId]);
  const settings = useSyncExternalStore(
    subscribeVoiceSettings,
    getSnapshot,
    () => DEFAULT_VOICE_SETTINGS
  );

  const update = useCallback(
    (next: VoiceSettings | ((prev: VoiceSettings) => VoiceSettings)) => {
      const current = loadVoiceSettings(userId);
      const resolved = typeof next === "function" ? next(current) : next;
      saveVoiceSettings(userId, resolved);
    },
    [userId]
  );

  return [settings, update];
}
