import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_TTS_ACCOUNT_SUMMARY,
  speakableHdText,
  splitTtsClauses,
  ttsClipHash,
  type HdTtsProvider,
  type ResolvedVoiceTarget,
  type TtsAccountSummary,
} from "./hdVoice";
import { getLocalTtsBlob, putLocalTtsBlob } from "./ttsCache";
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
 * Mesin suara hibrida 3-lapis Aisherly:
 * 1. Lokal Perangkat (IndexedDB) — putar 0 ms tanpa internet & tanpa API key.
 * 2. Cloud Cloudflare R2 — sinkron otomatis antara PC & iPhone tanpa API key.
 * 3. API Suara HD (Gemini TTS / ElevenLabs) — hasil baru otomatis disimpan ke R2 & IndexedDB.
 * 4. Fallback Suara Perangkat (Web Speech API) — cadangan instan bila belum terekam & kuota habis.
 */

const subscribeNothing = () => () => {};

let activeUserId = "anon";
let activeTtsSummary: TtsAccountSummary = DEFAULT_TTS_ACCOUNT_SUMMARY;

/** Sinkronkan konteks akun aktif agar kunci IndexedDB lokal cocok 1:1 dengan R2. */
export function syncVoiceAccountContext(userId: string, summary: TtsAccountSummary) {
  activeUserId = userId || "anon";
  activeTtsSummary = summary;
}

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
  /** Dipanggil saat giliran ucapan selesai (`completed = true` bila tuntas tanpa dipotong). */
  onEnd?: (completed: boolean) => void;
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
  // 1. Buka izin HTMLAudioElement untuk pemutaran audio HD sesudah await.
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

export function useSpeechUnlock() {
  useEffect(() => {
    const onGesture = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
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
/* Cache Memori + IndexedDB Lokal + Sinkron R2                         */
/* ------------------------------------------------------------------ */

const MAX_RAM_AUDIO_CACHE = 60;
const audioBlobCache = new Map<string, Blob>();
const inflightAudio = new Map<string, Promise<Blob>>();

function storeRamBlob(key: string, blob: Blob) {
  if (audioBlobCache.has(key)) {
    audioBlobCache.delete(key);
  }
  audioBlobCache.set(key, blob);
  if (audioBlobCache.size > MAX_RAM_AUDIO_CACHE) {
    const oldest = audioBlobCache.keys().next().value;
    if (oldest !== undefined) audioBlobCache.delete(oldest);
  }
}

/** Bersihkan cache RAM sementara ketika setelan suara diubah. */
export function invalidateHdAudioCache() {
  audioBlobCache.clear();
  inflightAudio.clear();
}

function resolveClientClipHash(
  cleanedClause: string,
  target: Extract<ResolvedVoiceTarget, { kind: "hd" }>
): string {
  const provider: HdTtsProvider = target.customProvider ?? activeTtsSummary.provider;
  let voice = "";
  let style = "";

  if (provider === "gemini") {
    style = activeTtsSummary.geminiStyle;
    if (target.slot === "male") voice = activeTtsSummary.geminiMaleVoice;
    else if (target.slot === "custom") voice = target.customVoiceId ?? "";
    else voice = activeTtsSummary.geminiFemaleVoice;
  } else {
    if (target.slot === "male") voice = activeTtsSummary.maleVoiceId;
    else if (target.slot === "custom") voice = target.customVoiceId ?? "";
    else voice = activeTtsSummary.femaleVoiceId;
  }

  return ttsClipHash({
    provider,
    voice: voice || "default",
    style,
    text: cleanedClause,
  });
}

async function fetchHdClauseBlob(
  clauseText: string,
  target: Extract<ResolvedVoiceTarget, { kind: "hd" }>,
  options: { forceSyncR2?: boolean } = {}
): Promise<Blob> {
  const cleaned = speakableHdText(clauseText);
  if (!cleaned) {
    throw new Error("Tidak ada teks yang perlu dibacakan.");
  }

  const clipHash = resolveClientClipHash(cleaned, target);
  const ramKey = `${activeUserId}:${clipHash}`;

  if (!options.forceSyncR2) {
    const ramHit = audioBlobCache.get(ramKey);
    if (ramHit) {
      storeRamBlob(ramKey, ramHit);
      return ramHit;
    }

    const idbHit = await getLocalTtsBlob(activeUserId, clipHash);
    if (idbHit) {
      storeRamBlob(ramKey, idbHit);
      return idbHit;
    }
  }

  const inflightKey = options.forceSyncR2 ? `sync:${ramKey}` : ramKey;
  const pending = inflightAudio.get(inflightKey);
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

    const finalHash = res.headers.get("X-Tts-Hash") || clipHash;
    storeRamBlob(`${activeUserId}:${finalHash}`, blob);
    void putLocalTtsBlob(activeUserId, finalHash, blob);
    return blob;
  })();

  inflightAudio.set(inflightKey, task);
  try {
    return await task;
  } finally {
    inflightAudio.delete(inflightKey);
  }
}

/**
 * Unduh lebih awal klausa pembuka selagi indikator "sedang mengetik..." tampil,
 * sehingga begitu gelembung pesan muncul suara langsung terdengar tanpa jeda.
 */
export function prefetchSpeech(text: string, target?: ResolvedVoiceTarget): void {
  if (typeof window === "undefined" || !target || target.kind !== "hd") return;
  const clauses = splitTtsClauses(text).slice(0, 2);
  for (const clause of clauses) {
    void fetchHdClauseBlob(clause, target).catch(() => undefined);
  }
}

export type PrewarmSummary = {
  total: number;
  ready: number;
  failed: number;
  quotaHit: boolean;
  lastError: string | null;
};

/**
 * Siapkan daftar frasa umum ke Cloudflare R2 + IndexedDB lokal perangkat.
 * Memakai `forceSyncR2: true` agar frasa yang tadinya baru ada di lokal ikut
 * dipastikan masuk ke R2 sehingga langsung tersedia di perangkat lain (PC/HP).
 */
export async function prewarmVoicePhrases(
  phrases: readonly string[],
  target: Extract<ResolvedVoiceTarget, { kind: "hd" }>,
  onProgress?: (done: number, total: number) => void
): Promise<PrewarmSummary> {
  const summary: PrewarmSummary = {
    total: phrases.length,
    ready: 0,
    failed: 0,
    quotaHit: false,
    lastError: null,
  };

  for (let i = 0; i < phrases.length; i++) {
    try {
      await fetchHdClauseBlob(phrases[i], target, { forceSyncR2: true });
      summary.ready += 1;
    } catch (err) {
      summary.failed += 1;
      const msg = err instanceof Error ? err.message : "Gagal menyiapkan frasa.";
      summary.lastError = msg;
      if (/kuota|429/i.test(msg)) {
        summary.quotaHit = true;
        onProgress?.(i + 1, phrases.length);
        break;
      }
    }
    onProgress?.(i + 1, phrases.length);
  }

  return summary;
}

/**
 * Putar satu rekaman dari Bank Rekaman (ambil dari IndexedDB lokal dulu; bila
 * belum ada di perangkat ini, unduh dari R2 lalu simpan ke IndexedDB lokal).
 */
export async function playSavedBankClip(
  clip: { id: string; clipHash: string },
  volume = 1
): Promise<boolean> {
  stopSpeaking();
  const currentGen = ++generation;
  pendingSpeech = 1;
  setSpeakingState(true);

  const run = async (): Promise<boolean> => {
    try {
      const ramKey = `${activeUserId}:${clip.clipHash}`;
      let blob: Blob | null = audioBlobCache.get(ramKey) ?? null;
      if (!blob) {
        blob = await getLocalTtsBlob(activeUserId, clip.clipHash);
      }
      if (!blob) {
        const res = await fetch(`/api/tts/clips/${encodeURIComponent(clip.id)}`);
        if (!res.ok) return false;
        const fetched = await res.blob();
        if (!fetched.size) return false;
        blob = fetched;
        void putLocalTtsBlob(activeUserId, clip.clipHash, fetched);
      }
      storeRamBlob(ramKey, blob);
      if (currentGen !== generation) return false;

      await playBlobOnSharedAudio(
        blob,
        { ...DEFAULT_VOICE_SETTINGS, volume },
        "",
        { kind: "device" }
      );
      return true;
    } catch {
      return false;
    } finally {
      if (currentGen === generation) {
        pendingSpeech = 0;
        setSpeakingState(false);
      }
    }
  };

  const p = chain.then(run, run);
  chain = p.then(
    () => undefined,
    () => undefined
  );
  return p;
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
            if (rawTextForBlockedRetry) {
              blockedSpeech = {
                text: rawTextForBlockedRetry,
                settings,
                target,
                at: Date.now(),
              };
            }
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
 * - `target.kind === "hd"` -> per klausa cek IndexedDB -> R2 -> API -> fallback perangkat.
 * - `target.kind === "device"` (default) -> Web Speech API perangkat.
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
        const clauses = splitTtsClauses(text);
        if (clauses.length === 0) return;

        const tasks: (Promise<Blob> | null)[] = new Array(clauses.length).fill(null);
        const ensure = (idx: number): Promise<Blob> => {
          if (!tasks[idx]) {
            tasks[idx] = fetchHdClauseBlob(clauses[idx], target);
            // Redam unhandled rejection pada prefetch klausa berikutnya.
            tasks[idx]!.catch(() => undefined);
          }
          return tasks[idx]!;
        };

        ensure(0);
        if (clauses.length > 1) ensure(1);

        let notifiedFallback = false;

        for (let i = 0; i < clauses.length; i++) {
          if (currentGeneration !== generation) return;
          if (i + 2 < clauses.length) ensure(i + 2);

          try {
            const blob = await ensure(i);
            if (currentGeneration !== generation) return;
            await playBlobOnSharedAudio(blob, settings, text, target);
          } catch (err) {
            if (currentGeneration !== generation) return;
            const reason =
              err instanceof Error && err.message
                ? err.message
                : "Suara HD sedang tidak tersedia.";
            if (!notifiedFallback) {
              notifiedFallback = true;
              options.onFallback?.(reason);
            }
            if (options.allowDeviceFallback === false) {
              return;
            }
            const fallbackClause = speakableText(clauses[i]);
            if (fallbackClause && isSpeechSupported()) {
              await playDeviceChunks(fallbackClause, settings, currentGeneration);
            }
          }

          if (currentGeneration !== generation) return;
          if (i < clauses.length - 1 || pendingSpeech > 1) {
            await sleep(Math.max(0, settings.pause ?? 140));
          }
        }
        return;
      }

      await playDeviceChunks(clean, settings, currentGeneration);
    } finally {
      const completed = currentGeneration === generation;
      if (completed) {
        pendingSpeech = Math.max(0, pendingSpeech - 1);
        if (pendingSpeech === 0) setSpeakingState(false);
      }
      options.onEnd?.(completed);
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
