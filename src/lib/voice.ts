import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  speakableHdText,
  type ResolvedVoiceTarget,
} from "./hdVoice";
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
 * Mesin suara hibrida Aisherly:
 * 1. Suara Lokal Perangkat (Web Speech API) — gratis, tanpa API key.
 * 2. Suara HD (ElevenLabs) — MP3 jernih dengan prefetch saat "sedang mengetik...",
 *    cache memori LRU agar putar ulang 0 kredit, serta fallback otomatis ke
 *    suara perangkat bila kuota ElevenLabs habis.
 */

const subscribeNothing = () => () => {};

export function isSpeechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

export function isAudioElementSupported(): boolean {
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}

/** Aman terhadap SSR: bernilai false di server lalu menyesuaikan di browser. */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(subscribeNothing, isSpeechSupported, () => false);
}

/* ------------------------------------------------------------------ */
/* Membuka mesin suara & elemen <audio> di iOS Safari                  */
/* ------------------------------------------------------------------ */

/** WAV 1 sampel hening (44 byte) untuk membuka izin autoplay <audio> di iOS. */
const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let speechUnlocked = false;
let audioUnlocked = false;
let sharedAudio: HTMLAudioElement | null = null;
let activeAudioFinish: (() => void) | null = null;

export type SpeakOptions = {
  append?: boolean;
  target?: ResolvedVoiceTarget;
  /** Bila `false` (mis. tombol Tes HD), jangan jatuh ke suara robot perangkat saat HD gagal. */
  allowDeviceFallback?: boolean;
  onFallback?: (reason: string) => void;
};

let blockedSpeech: {
  text: string;
  settings: VoiceSettings;
  target?: ResolvedVoiceTarget;
  at: number;
} | null = null;
const BLOCKED_TTL_MS = 20_000;

function getSharedAudio(): HTMLAudioElement | null {
  if (!isAudioElementSupported()) return null;
  if (!sharedAudio) {
    const el = new Audio();
    el.preload = "auto";
    el.setAttribute("playsinline", "true");
    sharedAudio = el;
  }
  return sharedAudio;
}

function stopSharedAudio() {
  if (activeAudioFinish) {
    const finish = activeAudioFinish;
    activeAudioFinish = null;
    finish();
  }
  if (sharedAudio) {
    try {
      sharedAudio.pause();
    } catch {
      // Diabaikan.
    }
  }
}

export function unlockSpeech() {
  // 1. Buka izin HTMLAudioElement untuk pemutaran MP3 HD sesudah await fetch.
  if (!audioUnlocked) {
    const el = getSharedAudio();
    if (el && (el.paused || el.ended) && !activeAudioFinish) {
      try {
        el.muted = true;
        el.src = SILENT_WAV_DATA_URI;
        const p = el.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            audioUnlocked = true;
            el.pause();
            el.muted = false;
          }).catch(() => {
            el.muted = false;
          });
        }
      } catch {
        el.muted = false;
      }
    }
  }

  // 2. Buka izin Web Speech API perangkat.
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
  if (!blockedSpeech) return false;
  const pending = blockedSpeech;
  if (Date.now() - pending.at > BLOCKED_TTL_MS) {
    blockedSpeech = null;
    return false;
  }
  if (speaking) return false;
  blockedSpeech = null;
  return speak(pending.text, pending.settings, {
    append: true,
    target: pending.target,
  });
}

/**
 * Pasang sekali di akar aplikasi: sentuhan pertama membuka izin suara di iOS,
 * dan kembali dari latar belakang membangunkan lagi mesin suara yang terjeda.
 */
export function useSpeechUnlock() {
  useEffect(() => {
    const onGesture = () => {
      if (speechUnlocked && audioUnlocked) {
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
      audioUnlocked = false;
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
/* Cache Memori LRU & Prefetch Suara HD (ElevenLabs)                   */
/* ------------------------------------------------------------------ */

const MAX_AUDIO_CACHE = 40;
let cacheEpoch = 0;
const audioBlobCache = new Map<string, Blob>();
const inflightAudio = new Map<string, Promise<Blob>>();

function hdCacheKey(
  target: Extract<ResolvedVoiceTarget, { kind: "hd" }>,
  cleanedText: string
): string {
  return `${cacheEpoch}|${target.customProvider ?? ""}|${target.slot}|${target.customVoiceId ?? ""}|${cleanedText}`;
}

function storeCachedBlob(key: string, blob: Blob) {
  if (audioBlobCache.has(key)) {
    audioBlobCache.delete(key);
  }
  audioBlobCache.set(key, blob);
  if (audioBlobCache.size > MAX_AUDIO_CACHE) {
    const oldest = audioBlobCache.keys().next().value;
    if (oldest !== undefined) audioBlobCache.delete(oldest);
  }
}

/** Bersihkan cache klip HD ketika pengguna mengganti Voice ID atau model di menu Suara. */
export function invalidateHdAudioCache() {
  cacheEpoch += 1;
  audioBlobCache.clear();
  inflightAudio.clear();
}

async function fetchHdBlob(
  text: string,
  target: Extract<ResolvedVoiceTarget, { kind: "hd" }>
): Promise<Blob> {
  const cleaned = speakableHdText(text);
  if (!cleaned) {
    throw new Error("Tidak ada teks yang perlu dibacakan.");
  }

  const key = hdCacheKey(target, cleaned);
  const hit = audioBlobCache.get(key);
  if (hit) {
    // Segarkan posisi LRU.
    storeCachedBlob(key, hit);
    return hit;
  }

  const pending = inflightAudio.get(key);
  if (pending) return pending;

  const task = (async () => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: cleaned,
        slot: target.slot,
        provider: target.customProvider,
        customVoiceId: target.customVoiceId,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        typeof data?.error === "string" && data.error
          ? data.error
          : `Gagal memuat suara HD (HTTP ${res.status}).`
      );
    }

    const blob = await res.blob();
    if (!blob.size) {
      throw new Error("Data audio kosong dari server.");
    }
    storeCachedBlob(key, blob);
    return blob;
  })();

  inflightAudio.set(key, task);
  try {
    return await task;
  } finally {
    inflightAudio.delete(key);
  }
}

/**
 * Unduh lebih awal klip MP3 selagi indikator "sedang mengetik..." tampil,
 * sehingga begitu gelembung pesan muncul suara langsung terdengar tanpa jeda.
 */
export function prefetchSpeech(text: string, target?: ResolvedVoiceTarget): void {
  if (typeof window === "undefined" || !target || target.kind !== "hd") return;
  void fetchHdBlob(text, target).catch(() => undefined);
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
/* Antrean pemutaran hibrida                                           */
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

function speakOneDevice(utterance: SpeechSynthesisUtterance): Promise<void> {
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

async function playDeviceChunks(
  cleanText: string,
  settings: VoiceSettings,
  currentGeneration: number
): Promise<void> {
  if (!isSpeechSupported()) return;
  const chunks = splitSentences(cleanText);
  const synth = window.speechSynthesis;
  try {
    synth.resume();
  } catch {
    // Diabaikan.
  }
  for (let i = 0; i < chunks.length; i++) {
    if (currentGeneration !== generation) return;
    await speakOneDevice(buildUtterance(chunks[i], settings));
    if (currentGeneration !== generation) return;
    if (i < chunks.length - 1) await sleep(Math.max(0, settings.pause ?? 150));
  }
}

function playBlobOnSharedAudio(
  blob: Blob,
  settings: VoiceSettings,
  rawTextForBlockedRetry: string,
  target: ResolvedVoiceTarget
): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = getSharedAudio();
    if (!el) {
      reject(new Error("Pemutar audio tidak tersedia di browser ini."));
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    let settled = false;
    let safetyTimer = 0;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (activeAudioFinish === finishOk) {
        activeAudioFinish = null;
      }
      window.clearTimeout(safetyTimer);
      el.onended = null;
      el.onerror = null;
      URL.revokeObjectURL(objectUrl);
    };

    const finishOk = () => {
      cleanup();
      resolve();
    };

    activeAudioFinish = finishOk;
    safetyTimer = window.setTimeout(finishOk, 90_000);

    el.muted = false;
    el.volume = Math.min(1, Math.max(0, settings.volume ?? 1));
    el.onended = finishOk;
    el.onerror = () => {
      cleanup();
      reject(new Error("Gagal memutar audio HD."));
    };
    el.src = objectUrl;

    const playPromise = el.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          audioUnlocked = true;
          blockedSpeech = null;
        })
        .catch((err: unknown) => {
          cleanup();
          const name = err instanceof Error ? err.name : "";
          if (name === "NotAllowedError") {
            blockedSpeech = {
              text: rawTextForBlockedRetry,
              settings,
              target,
              at: Date.now(),
            };
            // Di iOS bila ketukan belum sempat membuka <audio>, tunda ke sentuhan berikutnya
            // tanpa dianggap error kuota ElevenLabs.
            resolve();
            return;
          }
          reject(err instanceof Error ? err : new Error("Gagal memulai audio HD."));
        });
    } else {
      audioUnlocked = true;
    }
  });
}

/**
 * Bacakan teks memakai mesin yang dipilih (`target`):
 * - `target.kind === "hd"` -> MP3 ElevenLabs (otomatis jatuh ke suara perangkat bila gagal).
 * - `target.kind === "device"` (default) -> Web Speech API perangkat.
 * - `append: true` -> antrekan setelah bacaan yang sedang berjalan (untuk multi-bubble).
 */
export function speak(
  text: string,
  settings: VoiceSettings,
  options: SpeakOptions = {}
): boolean {
  const target: ResolvedVoiceTarget = options.target ?? { kind: "device" };
  const useHd = target.kind === "hd" && isAudioElementSupported();

  if (!useHd && !isSpeechSupported()) return false;

  const clean = useHd ? speakableHdText(text) : speakableText(text);
  if (!clean) return false;

  setSpeakingState(true);

  if (!useHd && !speechUnlocked) {
    blockedSpeech = { text, settings, target, at: Date.now() };
  }

  if (!options.append) {
    generation += 1;
    pendingSpeech = 0;
    stopSharedAudio();
    let wasSynthBusy = false;
    if (isSpeechSupported()) {
      const synth = window.speechSynthesis;
      wasSynthBusy = synth.speaking || synth.pending;
      // Hindari cancel() saat diam: di iOS justru bisa membuat mesin suara "tertidur".
      if (wasSynthBusy) synth.cancel();
    }
    chain = wasSynthBusy ? sleep(140) : Promise.resolve();
  }

  pendingSpeech += 1;
  const currentGeneration = generation;

  chain = chain.then(async () => {
    try {
      if (currentGeneration !== generation) return;

      if (useHd && target.kind === "hd") {
        try {
          const blob = await fetchHdBlob(text, target);
          if (currentGeneration !== generation) return;
          await playBlobOnSharedAudio(blob, settings, text, target);
          if (currentGeneration !== generation) return;
          if (pendingSpeech > 1 && settings.pause > 0) {
            await sleep(Math.max(0, settings.pause));
          }
          return;
        } catch (err) {
          if (currentGeneration !== generation) return;
          const reason =
            err instanceof Error && err.message
              ? err.message
              : "Suara HD sedang tidak tersedia.";
          options.onFallback?.(reason);
          if (options.allowDeviceFallback === false) {
            return;
          }
          // Jatuh mulus ke suara perangkat agar karakter tidak mendadak bisu di ruang chat.
          const fallbackClean = speakableText(text);
          if (fallbackClean && isSpeechSupported()) {
            await playDeviceChunks(fallbackClean, settings, currentGeneration);
          }
          return;
        }
      }

      await playDeviceChunks(clean, settings, currentGeneration);
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
  generation += 1;
  chain = Promise.resolve();
  stopSharedAudio();
  if (!isSpeechSupported()) return;
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
