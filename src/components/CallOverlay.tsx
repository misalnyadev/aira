"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { CharacterSummary } from "@/types/chat";
import type { CallEmotion } from "@/lib/callEmotion";
import {
  listUniqueCallClips,
  resolveActiveCallClip,
  type CallVisualPhase,
} from "@/lib/characterMedia";
import { useDictation } from "@/lib/dictation";
import type { ResolvedVoiceTarget } from "@/lib/hdVoice";
import {
  ensureMediaUrl,
  fallbackMediaToStream,
  useMediaUrl,
} from "@/lib/mediaClient";
import { resetStatusBarColor, setStatusBarColor } from "@/lib/theme";
import {
  speak,
  stopSpeaking,
  unlockSpeech,
  useIsSpeaking,
  type VoiceSettings,
} from "@/lib/voice";
import { Avatar } from "./Avatar";
import { CallVideoStage } from "./ChatVideo";
import {
  CallEndIcon,
  ChatsIcon,
  MicIcon,
  SendIcon,
  SpeakerIcon,
  SpeakerOffIcon,
  XIcon,
} from "./icons";

const CONNECT_DELAY = 1400;
/** Jeda hening setelah berhenti bicara sebelum kalimat otomatis dikirim (mode Otomatis). */
const SILENCE_SEND_MS = 1600;
/** Jeda singkat seusai karakter bicara sebelum mikrofon dibuka lagi agar gema speaker habis. */
const POST_SPEECH_LISTEN_DELAY_MS = 450;
const AUTO_MIC_STORAGE_KEY = "aira:call-auto-mic";

const subscribeNothing = () => () => {};

function useIsClient() {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );
}

function readInitialAutoMic(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const saved = window.localStorage.getItem(AUTO_MIC_STORAGE_KEY);
    return saved === null ? true : saved === "1";
  } catch {
    return true;
  }
}

function formatDuration(total: number) {
  const minutes = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export type CallTurnReply = {
  text: string;
  emotion?: CallEmotion;
};

/**
 * Layar panggilan suara & video call interaktif 2 arah ala WhatsApp:
 * - Pengguna bisa langsung berbicara lewat mikrofon (mode Otomatis kirim saat
 *   berhenti bicara ~1,6 detik, maupun mode Manual tekan tombol Mic/Kirim)
 *   atau mengetik singkat dari dalam layar panggilan.
 * - Setiap percakapan tersimpan ke ruang chat & ingatan karakter, dan dijawab
 *   langsung memakai Suara HD karakter (Gemini TTS / ElevenLabs / suara perangkat).
 * - Panggung video memakai paket klip khusus Video Call (diam, menyimak, mikir,
 *   bicara, ketawa, malu, cemberut) tanpa pernah melompat ke video latar ruang chat.
 */
export function CallOverlay({
  character,
  mode,
  voice,
  voiceTarget,
  onSendTurn,
  onClose,
}: {
  character: CharacterSummary;
  mode: "video" | "audio";
  voice: VoiceSettings;
  voiceTarget?: ResolvedVoiceTarget;
  /** Kirim 1 giliran ucapan panggilan ke server & kembalikan balasan + ekspresi karakter. */
  onSendTurn?: (
    spokenText: string,
    mode: "video" | "audio"
  ) => Promise<CallTurnReply | null>;
  onClose: () => void;
}) {
  const isClient = useIsClient();
  const [connected, setConnected] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [autoMic, setAutoMic] = useState<boolean>(readInitialAutoMic);
  const [thinking, setThinking] = useState(false);
  const [replyEmotion, setReplyEmotion] = useState<CallEmotion>("normal");
  const [silentExpressing, setSilentExpressing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [lastUserLine, setLastUserLine] = useState("");
  const [lastAssistantLine, setLastAssistantLine] = useState("");
  const [micHint, setMicHint] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [typedDraft, setTypedDraft] = useState("");

  const speaking = useIsSpeaking();
  const audioRef = useRef<HTMLAudioElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const mountedRef = useRef(true);
  const connectedRef = useRef(false);
  const mutedRef = useRef(false);
  const autoMicRef = useRef(autoMic);
  const thinkingRef = useRef(false);
  const showTextInputRef = useRef(false);
  const voiceRef = useRef(voice);
  const voiceTargetRef = useRef(voiceTarget);
  const onSendTurnRef = useRef(onSendTurn);

  const transcriptRef = useRef("");
  const ignoreDictationRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const autoListenTimerRef = useRef<number | null>(null);
  const silentExprTimerRef = useRef<number | null>(null);
  const turnSeqRef = useRef(0);
  const submitSpokenRef = useRef<() => void>(() => {});

  const interactive = Boolean(onSendTurn);
  const media = character.media;
  const allCallClips = useMemo(() => listUniqueCallClips(media), [media]);
  const hasCallVideo = allCallClips.length > 0;

  const audioKey = media?.callAudioKey ?? null;
  const audioUrl = useMediaUrl(audioKey);
  const voiceCall = mode === "audio";
  const hasRecording = Boolean(audioKey) && voiceCall;
  const zoom = Math.min(2, Math.max(1, (media?.callVideoZoom ?? 100) / 100));

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    autoMicRef.current = autoMic;
  }, [autoMic]);

  useEffect(() => {
    thinkingRef.current = thinking;
  }, [thinking]);

  useEffect(() => {
    showTextInputRef.current = showTextInput;
  }, [showTextInput]);

  useEffect(() => {
    voiceRef.current = voice;
    voiceTargetRef.current = voiceTarget;
    onSendTurnRef.current = onSendTurn;
  }, [voice, voiceTarget, onSendTurn]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearAutoListenTimer = useCallback(() => {
    if (autoListenTimerRef.current !== null) {
      window.clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }
  }, []);

  const clearSilentExprTimer = useCallback(() => {
    if (silentExprTimerRef.current !== null) {
      window.clearTimeout(silentExprTimerRef.current);
      silentExprTimerRef.current = null;
    }
  }, []);

  const handleDictationText = useCallback(
    (spoken: string) => {
      if (ignoreDictationRef.current) return;
      const clean = spoken.trim();
      transcriptRef.current = clean;
      setLiveTranscript(clean);
      setMicHint(null);

      clearSilenceTimer();
      if (autoMicRef.current && clean.length > 0) {
        silenceTimerRef.current = window.setTimeout(() => {
          submitSpokenRef.current();
        }, SILENCE_SEND_MS);
      }
    },
    [clearSilenceTimer]
  );

  const handleDictationError = useCallback(
    (message: string) => {
      clearSilenceTimer();
      setMicHint(message);
    },
    [clearSilenceTimer]
  );

  const dictation = useDictation({
    onText: handleDictationText,
    onError: handleDictationError,
  });

  const dictationRef = useRef(dictation);
  useEffect(() => {
    dictationRef.current = dictation;
  }, [dictation]);

  const startListeningTurn = useCallback(() => {
    if (!mountedRef.current || !connectedRef.current) return;
    if (thinkingRef.current || showTextInputRef.current) return;
    if (!dictationRef.current.supported) return;

    clearAutoListenTimer();
    clearSilenceTimer();
    clearSilentExprTimer();
    setSilentExpressing(false);
    stopSpeaking();
    transcriptRef.current = "";
    ignoreDictationRef.current = false;
    setLiveTranscript("");
    setMicHint(null);
    dictationRef.current.start();
  }, [clearAutoListenTimer, clearSilenceTimer, clearSilentExprTimer]);

  const scheduleAutoListen = useCallback(
    (delayMs = POST_SPEECH_LISTEN_DELAY_MS) => {
      clearAutoListenTimer();
      if (!autoMicRef.current || !dictationRef.current.supported) return;
      autoListenTimerRef.current = window.setTimeout(() => {
        if (
          mountedRef.current &&
          connectedRef.current &&
          autoMicRef.current &&
          !thinkingRef.current &&
          !showTextInputRef.current
        ) {
          startListeningTurn();
        }
      }, delayMs);
    },
    [clearAutoListenTimer, startListeningTurn]
  );

  const sendUtterance = useCallback(
    async (rawText: string) => {
      const clean = rawText.trim();
      const sender = onSendTurnRef.current;
      if (!clean || !sender || thinkingRef.current) return;

      clearSilenceTimer();
      clearAutoListenTimer();
      clearSilentExprTimer();
      setSilentExpressing(false);
      ignoreDictationRef.current = true;
      transcriptRef.current = "";
      if (dictationRef.current.listening) {
        dictationRef.current.stop();
      }
      stopSpeaking();
      const recEl = audioRef.current;
      if (recEl && !recEl.paused) recEl.pause();

      const myTurn = ++turnSeqRef.current;
      setLiveTranscript("");
      setLastUserLine(clean);
      setLastAssistantLine("");
      setMicHint(null);
      setThinking(true);
      thinkingRef.current = true;

      const reply = await sender(clean, mode);
      if (!mountedRef.current || turnSeqRef.current !== myTurn) return;

      setThinking(false);
      thinkingRef.current = false;

      if (!reply || !reply.text) {
        scheduleAutoListen(500);
        return;
      }

      const nextEmotion: CallEmotion = reply.emotion ?? "normal";
      setReplyEmotion(nextEmotion);
      setLastAssistantLine(reply.text);

      if (mutedRef.current) {
        setSilentExpressing(true);
        silentExprTimerRef.current = window.setTimeout(() => {
          setSilentExpressing(false);
          scheduleAutoListen(250);
        }, 2800);
        return;
      }

      const started = speak(reply.text, voiceRef.current, {
        target: voiceTargetRef.current,
        onEnd: (completed) => {
          if (!mountedRef.current || turnSeqRef.current !== myTurn) return;
          if (completed) {
            scheduleAutoListen(POST_SPEECH_LISTEN_DELAY_MS);
          }
        },
      });

      if (!started) {
        setSilentExpressing(true);
        silentExprTimerRef.current = window.setTimeout(() => {
          setSilentExpressing(false);
          scheduleAutoListen(250);
        }, 2400);
      }
    },
    [
      clearAutoListenTimer,
      clearSilenceTimer,
      clearSilentExprTimer,
      mode,
      scheduleAutoListen,
    ]
  );

  useEffect(() => {
    submitSpokenRef.current = () => {
      const spoken = transcriptRef.current.trim();
      if (spoken) {
        void sendUtterance(spoken);
      }
    };
  }, [sendUtterance]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Gelapkan area status bar & latar halaman agar layar panggilan penuh sampai poni atas.
  useEffect(() => {
    mountedRef.current = true;
    unlockSpeech();
    setStatusBarColor("#0a0a0c");
    const previousHtml = document.documentElement.style.backgroundColor;
    const previousBody = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = "#0a0a0c";
    document.body.style.backgroundColor = "#0a0a0c";
    stopSpeaking();
    return () => {
      mountedRef.current = false;
      connectedRef.current = false;
      turnSeqRef.current += 1;
      clearSilenceTimer();
      clearAutoListenTimer();
      clearSilentExprTimer();
      stopSpeaking();
      resetStatusBarColor();
      document.documentElement.style.backgroundColor = previousHtml;
      document.body.style.backgroundColor = previousBody;
    };
  }, [clearAutoListenTimer, clearSilenceTimer, clearSilentExprTimer]);

  useEffect(() => {
    if (audioKey && voiceCall) ensureMediaUrl(audioKey);
  }, [audioKey, voiceCall]);

  // Siapkan seluruh klip ekspresi Video Call sejak detik pertama "Memanggil...".
  useEffect(() => {
    if (mode !== "video") return;
    for (const clip of allCallClips) {
      ensureMediaUrl(clip.key);
    }
  }, [allCallClips, mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      connectedRef.current = true;
      setConnected(true);
      if (interactive && !hasRecording) {
        scheduleAutoListen(220);
      }
    }, CONNECT_DELAY);
    return () => window.clearTimeout(timer);
  }, [hasRecording, interactive, scheduleAutoListen]);

  useEffect(() => {
    const el = audioRef.current;
    if (!connected || !audioUrl || !el || !voiceCall) return;
    el.muted = muted;
    void el.play().catch(() => {
      setAudioBlocked(true);
      if (interactive) scheduleAutoListen(300);
    });
  }, [connected, audioUrl, interactive, muted, scheduleAutoListen, voiceCall]);

  useEffect(() => {
    if (!connected) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [connected]);

  function toggleAutoMic() {
    const next = !autoMic;
    setAutoMic(next);
    autoMicRef.current = next;
    try {
      window.localStorage.setItem(AUTO_MIC_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Diabaikan bila mode privat menolak localStorage.
    }
    if (!next) {
      clearSilenceTimer();
      clearAutoListenTimer();
    } else if (
      connected &&
      !thinking &&
      !speaking &&
      !dictation.listening &&
      !showTextInput
    ) {
      startListeningTurn();
    }
  }

  function handleMicPress() {
    unlockSpeech();
    if (!connected || thinking) return;

    if (showTextInput) {
      setShowTextInput(false);
      showTextInputRef.current = false;
    }

    if (dictation.listening) {
      const spoken = transcriptRef.current.trim();
      if (spoken) {
        void sendUtterance(spoken);
      } else {
        clearSilenceTimer();
        ignoreDictationRef.current = true;
        dictation.stop();
      }
      return;
    }

    if (speaking) {
      turnSeqRef.current += 1;
      stopSpeaking();
    }
    clearSilentExprTimer();
    setSilentExpressing(false);
    const recEl = audioRef.current;
    if (recEl && !recEl.paused) recEl.pause();

    startListeningTurn();
  }

  function toggleTextInput() {
    unlockSpeech();
    const next = !showTextInput;
    setShowTextInput(next);
    showTextInputRef.current = next;
    if (next) {
      clearSilenceTimer();
      clearAutoListenTimer();
      ignoreDictationRef.current = true;
      if (dictation.listening) dictation.stop();
      window.setTimeout(() => textInputRef.current?.focus(), 40);
    } else if (connected && autoMic && !thinking && !speaking) {
      scheduleAutoListen(250);
    }
  }

  function handleTypedSubmit() {
    unlockSpeech();
    const trimmed = typedDraft.trim();
    if (!trimmed || thinking) return;
    setTypedDraft("");
    setShowTextInput(false);
    showTextInputRef.current = false;
    void sendUtterance(trimmed);
  }

  function toggleMute() {
    unlockSpeech();
    const next = !muted;
    setMuted(next);
    mutedRef.current = next;
    setAudioBlocked(false);
    const el = audioRef.current;
    if (el) {
      el.muted = next;
      if (!next && voiceCall && hasRecording) {
        void el.play().catch(() => setAudioBlocked(true));
      }
    }
    if (next) {
      stopSpeaking();
    }
  }

  function endCall() {
    turnSeqRef.current += 1;
    clearSilenceTimer();
    clearAutoListenTimer();
    clearSilentExprTimer();
    ignoreDictationRef.current = true;
    if (dictation.listening) dictation.stop();
    stopSpeaking();
    const el = audioRef.current;
    if (el) el.pause();
    onClose();
  }

  const visualPhase: CallVisualPhase = thinking
    ? { kind: "thinking" }
    : speaking || silentExpressing
      ? { kind: "speaking", emotion: replyEmotion }
      : dictation.listening
        ? { kind: "listening" }
        : { kind: "idle" };

  const activeClip = resolveActiveCallClip(media, visualPhase);

  const showWave =
    connected &&
    !muted &&
    (speaking || dictation.listening || (hasRecording && mode === "audio"));

  const statusDetail = !connected
    ? "Memanggil..."
    : thinking
      ? `Tersambung · ${formatDuration(seconds)} · Menjawab...`
      : speaking
        ? `Tersambung · ${formatDuration(seconds)} · Berbicara`
        : dictation.listening
          ? `Tersambung · ${formatDuration(seconds)} · Mendengarkan`
          : `Tersambung · ${formatDuration(seconds)}`;

  const hasSpokenDraft = dictation.listening && liveTranscript.trim().length > 0;

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${mode === "video" ? "Video call" : "Panggilan suara"} dengan ${character.name}`}
      className="fade-in fixed inset-0 z-[80] w-full overflow-hidden bg-[#0a0a0c] text-white"
    >
      <div className="absolute inset-0 isolate overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,#1d1d24,#0a0a0c_72%)]" />
        {hasCallVideo && mode === "video" && (
          <div
            className={`absolute inset-0 z-10 isolate transition-opacity duration-300 ${
              connected ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <CallVideoStage
              clips={allCallClips}
              activeKey={activeClip?.key ?? null}
              playing={connected}
              dim={0.12}
              zoom={zoom}
            />
          </div>
        )}
      </div>

      <div className="relative flex h-full flex-col justify-between px-4 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)-0.25rem))] pt-[max(1.35rem,var(--safe-top))]">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
            {mode === "video" ? "Video call" : "Panggilan suara"}
          </p>
          <h2 className="mt-1 text-lg font-semibold drop-shadow">{character.name}</h2>
          <p className="mt-0.5 text-[13px] text-white/75">{statusDetail}</p>
          {audioBlocked && (
            <p className="mt-1 text-[12px] text-white/60">
              Ketuk ikon suara di bawah untuk menyalakan audio.
            </p>
          )}
        </div>

        {mode === "audio" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5">
            <div className="relative">
              {!connected && (
                <span className="absolute inset-0 -m-5 animate-ping rounded-full border border-white/15" />
              )}
              <Avatar name={character.name} src={character.avatarUrl} size={136} />
            </div>
            {showWave && (
              <div className="flex items-end gap-1" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="w-1 animate-pulse rounded-full bg-white/70"
                    style={{ height: 6 + (i % 3) * 6, animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            {(!hasCallVideo || !connected) && (
              <div className="relative">
                {!connected && (
                  <span className="absolute inset-0 -m-5 animate-ping rounded-full border border-white/15" />
                )}
                <Avatar name={character.name} src={character.avatarUrl} size={136} />
              </div>
            )}
          </div>
        )}

        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-2.5">
          {/* Kapsul teks percakapan langsung (subtitle ucapanmu & balasan karakter) */}
          {interactive && connected && (
            <div className="w-full">
              {(liveTranscript ||
                thinking ||
                lastAssistantLine ||
                dictation.listening ||
                micHint) && (
                <div className="mx-auto max-h-28 overflow-y-auto rounded-2xl bg-black/50 px-3.5 py-2 text-center text-[13.5px] leading-snug text-white/95 ring-1 ring-white/15 backdrop-blur-md">
                  {thinking ? (
                    <p className="text-white/85">
                      <span className="text-white/55">Kamu:</span> “{lastUserLine}”
                      <span className="mt-1 block text-[12px] text-white/65">
                        {character.name} sedang menjawab…
                      </span>
                    </p>
                  ) : dictation.listening && liveTranscript ? (
                    <p>
                      <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400 align-middle" />
                      “{liveTranscript}”
                    </p>
                  ) : speaking && lastAssistantLine ? (
                    <p>{lastAssistantLine}</p>
                  ) : dictation.listening ? (
                    <p className="text-[12.5px] text-white/75">
                      <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400 align-middle" />
                      {autoMic
                        ? "Silakan bicara… otomatis terkirim saat jeda"
                        : "Silakan bicara… ketuk Kirim saat selesai"}
                    </p>
                  ) : micHint ? (
                    <p className="text-[12px] text-amber-200/90">{micHint}</p>
                  ) : lastAssistantLine ? (
                    <p className="text-white/85">{lastAssistantLine}</p>
                  ) : null}
                </div>
              )}
            </div>
          )}

          {/* Kolom ketik cepat di dalam panggilan bila lagi tidak enak bersuara */}
          {interactive && connected && showTextInput && (
            <div className="flex w-full items-center gap-1.5 rounded-full bg-black/60 p-1 pl-3.5 ring-1 ring-white/20 backdrop-blur-md">
              <input
                ref={textInputRef}
                type="text"
                value={typedDraft}
                onChange={(e) => setTypedDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleTypedSubmit();
                  }
                }}
                placeholder={`Ketik ke ${character.name}…`}
                autoComplete="off"
                enterKeyHint="send"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-[14px] text-white placeholder:text-white/45"
              />
              <button
                type="button"
                onClick={toggleTextInput}
                aria-label="Tutup kolom ketik"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/65 transition hover:text-white"
              >
                <XIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleTypedSubmit}
                disabled={!typedDraft.trim() || thinking}
                aria-label="Kirim pesan panggilan"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-zinc-950 transition active:scale-95 disabled:opacity-40"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Pil sakelar Otomatis vs Manual untuk mikrofon panggilan */}
          {interactive && connected && dictation.supported && (
            <button
              type="button"
              onClick={toggleAutoMic}
              aria-pressed={autoMic}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-[11.5px] font-medium text-white/80 ring-1 ring-white/15 backdrop-blur-md transition hover:bg-black/60 active:scale-95"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  autoMic ? "bg-emerald-400" : "bg-white/45"
                }`}
              />
              {autoMic ? "Mic Otomatis · Ketuk ke Manual" : "Mic Manual · Ketuk ke Otomatis"}
            </button>
          )}

          <div className="flex items-start justify-center gap-5 sm:gap-7">
            {interactive && dictation.supported && (
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleMicPress}
                  disabled={!connected || thinking}
                  aria-pressed={dictation.listening}
                  aria-label={
                    hasSpokenDraft
                      ? "Kirim ucapan sekarang"
                      : dictation.listening
                        ? "Jeda mikrofon"
                        : "Mulai bicara"
                  }
                  className={`relative flex h-13 w-13 items-center justify-center rounded-full backdrop-blur transition active:scale-95 disabled:opacity-45 ${
                    dictation.listening
                      ? "bg-white text-zinc-950 shadow-lg ring-4 ring-white/25"
                      : "bg-white/15 text-white hover:bg-white/25"
                  }`}
                >
                  {hasSpokenDraft ? (
                    <SendIcon className="h-5 w-5" />
                  ) : (
                    <MicIcon className="h-6 w-6" />
                  )}
                </button>
                <span className="text-[11px] text-white/70">
                  {hasSpokenDraft
                    ? "Kirim"
                    : dictation.listening
                      ? "Mendengar"
                      : "Bicara"}
                </span>
              </div>
            )}

            {interactive && (
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleTextInput}
                  disabled={!connected || thinking}
                  aria-pressed={showTextInput}
                  aria-label="Ketik pesan di dalam panggilan"
                  className={`flex h-13 w-13 items-center justify-center rounded-full backdrop-blur transition active:scale-95 disabled:opacity-45 ${
                    showTextInput
                      ? "bg-white text-zinc-950 shadow-lg"
                      : "bg-white/15 text-white hover:bg-white/25"
                  }`}
                >
                  <ChatsIcon className="h-5 w-5" />
                </button>
                <span className="text-[11px] text-white/70">Ketik</span>
              </div>
            )}

            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                aria-label={muted ? "Nyalakan suara panggilan" : "Bisukan panggilan"}
                className="flex h-13 w-13 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 active:scale-95"
              >
                {muted ? <SpeakerOffIcon className="h-6 w-6" /> : <SpeakerIcon className="h-6 w-6" />}
              </button>
              <span className="text-[11px] text-white/70">{muted ? "Nyalakan" : "Bisukan"}</span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={endCall}
                aria-label="Akhiri panggilan"
                className="flex h-13 w-13 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-600 active:scale-95"
              >
                <CallEndIcon className="h-6 w-6" />
              </button>
              <span className="text-[11px] text-white/70">Akhiri</span>
            </div>
          </div>
        </div>
      </div>

      {audioUrl && voiceCall && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          onEnded={() => {
            if (interactive) scheduleAutoListen(350);
          }}
          onError={() => {
            fallbackMediaToStream(audioKey);
          }}
          className="hidden"
        />
      )}
    </div>
  );

  if (!isClient) return null;
  return createPortal(content, document.body);
}
