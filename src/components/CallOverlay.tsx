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
import {
  stripLeadingReactionCue,
  type CallEmotion,
} from "@/lib/callEmotion";
import {
  listUniqueCallAudioKeys,
  listUniqueCallClips,
  resolveActiveCallClip,
  resolveCallAudioAssetKey,
  type CallAudioSlot,
  type CallVisualPhase,
} from "@/lib/characterMedia";
import { useDictation } from "@/lib/dictation";
import type { ResolvedVoiceTarget } from "@/lib/hdVoice";
import {
  ensureMediaUrl,
  fallbackMediaToStream,
  getMediaUrl,
  preloadMediaBlob,
} from "@/lib/mediaClient";
import { resetStatusBarColor, setStatusBarColor } from "@/lib/theme";
import {
  getCueAudio,
  prefetchSpeech,
  speak,
  stopSpeaking,
  unlockSpeech,
  useIsAudibleSpeaking,
  useIsSpeaking,
  type VoiceSettings,
} from "@/lib/voice";
import { Avatar } from "./Avatar";
import { CallVideoStage } from "./ChatVideo";
import {
  CallEndIcon,
  ChatsIcon,
  MicIcon,
  MicOffIcon,
  SendIcon,
  SpeakerIcon,
  SpeakerOffIcon,
  XIcon,
} from "./icons";

const CONNECT_DELAY = 1400;
/** Jeda hening setelah berhenti bicara sebelum kalimat otomatis dikirim di balik layar. */
const SILENCE_SEND_MS = 1600;
/** Jeda singkat seusai karakter bicara sebelum mikrofon dibuka lagi agar gema speaker habis. */
const POST_SPEECH_LISTEN_DELAY_MS = 450;

const subscribeNothing = () => () => {};

function useIsClient() {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );
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
 * Layar panggilan suara & video call realistis tanpa teks/transkrip di layar:
 * - Seluruh pendengaran mikrofon otomatis, pengiriman ke AI, dan penyimpanan
 *   ke riwayat chat berlangsung murni di balik layar.
 * - Menggabungkan 7 klip ekspresi video + 5 asset audio instan (di-preload ke RAM)
 *   + sinkronisasi gelombang suara nyata (`useIsAudibleSpeaking`).
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
  const [micMuted, setMicMuted] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [preparingSpeech, setPreparingSpeech] = useState(false);
  const [cuePlayingSlot, setCuePlayingSlot] = useState<CallAudioSlot | null>(null);
  const [replyEmotion, setReplyEmotion] = useState<CallEmotion>("normal");
  const [silentExpressing, setSilentExpressing] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [typedDraft, setTypedDraft] = useState("");

  const speaking = useIsSpeaking();
  const audibleSpeaking = useIsAudibleSpeaking();
  const textInputRef = useRef<HTMLInputElement>(null);

  const mountedRef = useRef(true);
  const connectedRef = useRef(false);
  const mutedRef = useRef(false);
  const micMutedRef = useRef(false);
  const permissionDeniedRef = useRef(false);
  const thinkingRef = useRef(false);
  const showTextInputRef = useRef(false);
  const mediaRef = useRef(character.media);
  const voiceRef = useRef(voice);
  const voiceTargetRef = useRef(voiceTarget);
  const onSendTurnRef = useRef(onSendTurn);

  const transcriptRef = useRef("");
  const ignoreDictationRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const autoListenTimerRef = useRef<number | null>(null);
  const silentExprTimerRef = useRef<number | null>(null);
  const thinkingCueTimerRef = useRef<number | null>(null);
  const activeCueFinishRef = useRef<(() => void) | null>(null);
  const turnSeqRef = useRef(0);
  const submitSpokenRef = useRef<() => void>(() => {});

  const interactive = Boolean(onSendTurn);
  const media = character.media;
  const allCallClips = useMemo(() => listUniqueCallClips(media), [media]);
  const allCallAudioKeys = useMemo(() => listUniqueCallAudioKeys(media), [media]);
  const hasCallVideo = allCallClips.length > 0;
  const zoom = Math.min(2, Math.max(1, (media?.callVideoZoom ?? 100) / 100));

  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);

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

  const clearThinkingCueTimer = useCallback(() => {
    if (thinkingCueTimerRef.current !== null) {
      window.clearTimeout(thinkingCueTimerRef.current);
      thinkingCueTimerRef.current = null;
    }
  }, []);

  const stopCueAudio = useCallback(() => {
    clearThinkingCueTimer();
    if (activeCueFinishRef.current) {
      const done = activeCueFinishRef.current;
      activeCueFinishRef.current = null;
      done();
    }
    const el = getCueAudio();
    if (el && !el.paused) {
      try {
        el.pause();
      } catch {
        // Diabaikan.
      }
    }
    setCuePlayingSlot(null);
  }, [clearThinkingCueTimer]);

  /**
   * Putar klip asset audio pendek dari RAM (`0ms`) dan tunggu hingga selesai.
   */
  const playCueSlot = useCallback((slot: CallAudioSlot): Promise<boolean> => {
    const key = resolveCallAudioAssetKey(mediaRef.current, slot);
    const el = getCueAudio();
    if (!key || !el || mutedRef.current) return Promise.resolve(false);

    const initialUrl = getMediaUrl(key) ?? `/api/media/stream?key=${encodeURIComponent(key)}`;

    if (activeCueFinishRef.current) {
      const prevDone = activeCueFinishRef.current;
      activeCueFinishRef.current = null;
      prevDone();
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let retriedStream = false;
      let started = false;

      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(safetyId);
        if (activeCueFinishRef.current === forceCancel) {
          activeCueFinishRef.current = null;
        }
        el.onended = null;
        el.onerror = null;
        if (mountedRef.current) {
          setCuePlayingSlot((curr) => (curr === slot ? null : curr));
        }
        resolve(ok);
      };

      const forceCancel = () => finish(started);
      activeCueFinishRef.current = forceCancel;

      const safetyId = window.setTimeout(() => finish(started), 25_000);

      const tryPlayUrl = (srcUrl: string) => {
        el.muted = mutedRef.current;
        el.volume = Math.min(1, Math.max(0, voiceRef.current.volume ?? 1));
        el.onended = () => finish(true);
        el.onerror = () => {
          if (!retriedStream && fallbackMediaToStream(key)) {
            retriedStream = true;
            const fallbackUrl = getMediaUrl(key);
            if (fallbackUrl) {
              tryPlayUrl(fallbackUrl);
              return;
            }
          }
          finish(false);
        };
        el.src = srcUrl;
        const p = el.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            if (settled) return;
            started = true;
            if (mountedRef.current) {
              setCuePlayingSlot(slot);
            }
          }).catch(() => {
            finish(false);
          });
        } else {
          started = true;
          if (mountedRef.current) {
            setCuePlayingSlot(slot);
          }
        }
      };

      tryPlayUrl(initialUrl);
    });
  }, []);

  const handleDictationText = useCallback(
    (spoken: string) => {
      if (ignoreDictationRef.current) return;
      const clean = spoken.trim();
      transcriptRef.current = clean;
      setUserSpeaking(clean.length > 0);

      clearSilenceTimer();
      if (clean.length > 0) {
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
      setUserSpeaking(false);
      if (message.includes("Izin dikte ditolak")) {
        permissionDeniedRef.current = true;
      }
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
    if (micMutedRef.current || permissionDeniedRef.current) return;
    if (thinkingRef.current || showTextInputRef.current) return;
    if (!dictationRef.current.supported) return;

    clearAutoListenTimer();
    clearSilenceTimer();
    clearSilentExprTimer();
    stopCueAudio();
    setSilentExpressing(false);
    setPreparingSpeech(false);
    stopSpeaking();
    transcriptRef.current = "";
    ignoreDictationRef.current = false;
    setUserSpeaking(false);
    dictationRef.current.start();
  }, [clearAutoListenTimer, clearSilenceTimer, clearSilentExprTimer, stopCueAudio]);

  const scheduleAutoListen = useCallback(
    (delayMs = POST_SPEECH_LISTEN_DELAY_MS) => {
      clearAutoListenTimer();
      if (
        micMutedRef.current ||
        permissionDeniedRef.current ||
        !dictationRef.current.supported
      ) {
        return;
      }
      autoListenTimerRef.current = window.setTimeout(() => {
        if (
          mountedRef.current &&
          connectedRef.current &&
          !micMutedRef.current &&
          !permissionDeniedRef.current &&
          !thinkingRef.current &&
          !showTextInputRef.current
        ) {
          startListeningTurn();
        }
      }, delayMs);
    },
    [clearAutoListenTimer, startListeningTurn]
  );

  // Bila sesi dikte berhenti karena diam sangat lama (melewati batas restart), sambung lagi di balik layar.
  useEffect(() => {
    if (
      !interactive ||
      !connected ||
      micMuted ||
      thinking ||
      preparingSpeech ||
      speaking ||
      cuePlayingSlot !== null ||
      showTextInput ||
      dictation.listening
    ) {
      return;
    }
    const id = window.setTimeout(() => {
      if (
        mountedRef.current &&
        connectedRef.current &&
        !micMutedRef.current &&
        !permissionDeniedRef.current &&
        !thinkingRef.current &&
        !showTextInputRef.current &&
        !dictationRef.current.listening
      ) {
        startListeningTurn();
      }
    }, 1000);
    return () => window.clearTimeout(id);
  }, [
    connected,
    cuePlayingSlot,
    dictation.listening,
    interactive,
    micMuted,
    preparingSpeech,
    showTextInput,
    speaking,
    startListeningTurn,
    thinking,
  ]);

  const sendUtterance = useCallback(
    async (rawText: string) => {
      const clean = rawText.trim();
      const sender = onSendTurnRef.current;
      if (!clean || !sender || thinkingRef.current) return;

      clearSilenceTimer();
      clearAutoListenTimer();
      clearSilentExprTimer();
      stopCueAudio();
      setSilentExpressing(false);
      setPreparingSpeech(false);
      ignoreDictationRef.current = true;
      transcriptRef.current = "";
      setUserSpeaking(false);
      if (dictationRef.current.listening) {
        dictationRef.current.stop();
      }
      stopSpeaking();

      const myTurn = ++turnSeqRef.current;
      setThinking(true);
      thinkingRef.current = true;

      // Bila ada asset suara gumam mikir ("Hmm..."), bunyikan alami selagi menunggu server.
      if (!mutedRef.current && resolveCallAudioAssetKey(mediaRef.current, "thinking")) {
        thinkingCueTimerRef.current = window.setTimeout(() => {
          if (mountedRef.current && turnSeqRef.current === myTurn && thinkingRef.current) {
            void playCueSlot("thinking");
          }
        }, 260);
      }

      const reply = await sender(clean, mode);
      if (!mountedRef.current || turnSeqRef.current !== myTurn) return;

      clearThinkingCueTimer();
      setThinking(false);
      thinkingRef.current = false;

      if (!reply || !reply.text) {
        stopCueAudio();
        scheduleAutoListen(500);
        return;
      }

      const nextEmotion: CallEmotion = reply.emotion ?? "normal";
      setReplyEmotion(nextEmotion);

      if (mutedRef.current) {
        stopCueAudio();
        setSilentExpressing(true);
        silentExprTimerRef.current = window.setTimeout(() => {
          setSilentExpressing(false);
          scheduleAutoListen(250);
        }, 2800);
        return;
      }

      // Cek apakah emosi ini memiliki asset audio reaksi instan (laugh / shy / pout).
      const reactionSlot: CallAudioSlot | null =
        nextEmotion === "laugh" || nextEmotion === "shy" || nextEmotion === "pout"
          ? nextEmotion
          : null;
      const hasReactionAudio = Boolean(
        reactionSlot && resolveCallAudioAssetKey(mediaRef.current, reactionSlot)
      );

      let spokenBody = reply.text;
      if (hasReactionAudio && reactionSlot) {
        stopCueAudio();
        spokenBody = stripLeadingReactionCue(reply.text, nextEmotion);

        // Prefetch audio TTS kalimat lanjutan di latar belakang selagi klip reaksi asli berbunyi!
        if (spokenBody) {
          prefetchSpeech(spokenBody, voiceTargetRef.current);
        }

        await playCueSlot(reactionSlot);
        if (!mountedRef.current || turnSeqRef.current !== myTurn) return;

        // Bila seluruh balasan hanya berupa tawa/reaksi pendek, langsung lanjut giliran.
        if (!spokenBody) {
          scheduleAutoListen(POST_SPEECH_LISTEN_DELAY_MS);
          return;
        }
      }

      // Tahan visual tetap di ekspresi `Mikir` sampai gelombang suara TTS benar-benar keluar!
      setPreparingSpeech(true);

      const started = speak(spokenBody, voiceRef.current, {
        target: voiceTargetRef.current,
        onStart: () => {
          if (!mountedRef.current || turnSeqRef.current !== myTurn) return;
          stopCueAudio();
          setPreparingSpeech(false);
        },
        onEnd: (completed) => {
          if (!mountedRef.current || turnSeqRef.current !== myTurn) return;
          setPreparingSpeech(false);
          if (completed) {
            scheduleAutoListen(POST_SPEECH_LISTEN_DELAY_MS);
          }
        },
      });

      if (!started) {
        stopCueAudio();
        setPreparingSpeech(false);
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
      clearThinkingCueTimer,
      mode,
      playCueSlot,
      scheduleAutoListen,
      stopCueAudio,
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
      stopCueAudio();
      stopSpeaking();
      resetStatusBarColor();
      document.documentElement.style.backgroundColor = previousHtml;
      document.body.style.backgroundColor = previousBody;
    };
  }, [
    clearAutoListenTimer,
    clearSilenceTimer,
    clearSilentExprTimer,
    stopCueAudio,
  ]);

  // Preload seluruh klip video ekspresi & asset audio reaksi ke RAM sejak detik pertama berdering.
  useEffect(() => {
    if (mode === "video") {
      for (const clip of allCallClips) {
        ensureMediaUrl(clip.key);
      }
    }
    for (const audioKey of allCallAudioKeys) {
      preloadMediaBlob(audioKey);
    }
  }, [allCallAudioKeys, allCallClips, mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      connectedRef.current = true;
      setConnected(true);
      const greetingKey = resolveCallAudioAssetKey(mediaRef.current, "greeting");
      if (greetingKey && !mutedRef.current) {
        const greetTurn = ++turnSeqRef.current;
        void playCueSlot("greeting").then(() => {
          if (mountedRef.current && turnSeqRef.current === greetTurn && interactive) {
            scheduleAutoListen(250);
          }
        });
      } else if (interactive) {
        scheduleAutoListen(220);
      }
    }, CONNECT_DELAY);
    return () => window.clearTimeout(timer);
  }, [interactive, playCueSlot, scheduleAutoListen]);

  useEffect(() => {
    if (!connected) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [connected]);

  function handleMicPress() {
    unlockSpeech();
    if (!connected || thinking) return;

    if (showTextInput) {
      setShowTextInput(false);
      showTextInputRef.current = false;
    }

    // Bila karakter sedang bicara, ketukan Mic langsung menyela (barge-in) dan mengaktifkan mic.
    if (speaking || cuePlayingSlot !== null || preparingSpeech) {
      turnSeqRef.current += 1;
      stopCueAudio();
      setPreparingSpeech(false);
      stopSpeaking();
      clearSilentExprTimer();
      setSilentExpressing(false);
      permissionDeniedRef.current = false;
      setMicMuted(false);
      micMutedRef.current = false;
      startListeningTurn();
      return;
    }

    // Bila sedang ada kalimat yang baru diucapkan, ketukan Mic mengirimnya seketika.
    if (dictation.listening && transcriptRef.current.trim().length > 0) {
      void sendUtterance(transcriptRef.current);
      return;
    }

    // Selebihnya bekerja seperti tombol Bisukan / Nyalakan Mikrofon di panggilan nyata.
    const nextMuted = !micMuted;
    setMicMuted(nextMuted);
    micMutedRef.current = nextMuted;
    if (nextMuted) {
      clearSilenceTimer();
      clearAutoListenTimer();
      ignoreDictationRef.current = true;
      transcriptRef.current = "";
      setUserSpeaking(false);
      if (dictation.listening) dictation.stop();
    } else {
      permissionDeniedRef.current = false;
      startListeningTurn();
    }
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
      transcriptRef.current = "";
      setUserSpeaking(false);
      if (dictation.listening) dictation.stop();
      window.setTimeout(() => textInputRef.current?.focus(), 40);
    } else if (
      connected &&
      !micMuted &&
      !thinking &&
      !speaking &&
      cuePlayingSlot === null
    ) {
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
    const el = getCueAudio();
    if (el) el.muted = next;
    if (next) {
      stopCueAudio();
      setPreparingSpeech(false);
      stopSpeaking();
    }
  }

  function endCall() {
    turnSeqRef.current += 1;
    clearSilenceTimer();
    clearAutoListenTimer();
    clearSilentExprTimer();
    stopCueAudio();
    setPreparingSpeech(false);
    ignoreDictationRef.current = true;
    setUserSpeaking(false);
    if (dictation.listening) dictation.stop();
    stopSpeaking();
    onClose();
  }

  const activeCueEmotion: CallEmotion | null =
    cuePlayingSlot === "greeting"
      ? "normal"
      : cuePlayingSlot === "laugh" ||
          cuePlayingSlot === "shy" ||
          cuePlayingSlot === "pout"
        ? cuePlayingSlot
        : null;

  const visualPhase: CallVisualPhase =
    activeCueEmotion !== null
      ? { kind: "speaking", emotion: activeCueEmotion }
      : audibleSpeaking || silentExpressing
        ? { kind: "speaking", emotion: replyEmotion }
        : thinking || preparingSpeech || cuePlayingSlot === "thinking"
          ? { kind: "thinking" }
          : dictation.listening && userSpeaking
            ? { kind: "listening" }
            : { kind: "idle" };

  const activeClip = resolveActiveCallClip(media, visualPhase);
  const voiceActiveNow = audibleSpeaking || activeCueEmotion !== null;

  const showWave =
    connected &&
    !muted &&
    (voiceActiveNow || cuePlayingSlot === "thinking" || (dictation.listening && userSpeaking));

  const statusDetail = !connected ? "Memanggil..." : formatDuration(seconds);

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
              dim={0.08}
              zoom={zoom}
            />
          </div>
        )}
      </div>

      <div className="relative flex h-full flex-col justify-between px-4 pb-[max(1.4rem,calc(env(safe-area-inset-bottom)+0.25rem))] pt-[max(1.35rem,var(--safe-top))]">
        <div className="text-center">
          <h2 className="text-lg font-semibold drop-shadow">{character.name}</h2>
          <p className="mt-0.5 text-[13px] tabular-nums text-white/75 drop-shadow">
            {statusDetail}
          </p>
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

        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3">
          {/* Kolom ketik hanya muncul saat tombol Ketik ditekan; setelah dikirim langsung hilang bersih */}
          {interactive && connected && showTextInput && (
            <div className="flex w-full items-center gap-1.5 rounded-full bg-black/55 p-1 pl-3.5 ring-1 ring-white/20 backdrop-blur-md">
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

          <div className="flex items-center justify-center gap-5 sm:gap-6">
            {interactive && dictation.supported && (
              <button
                type="button"
                onClick={handleMicPress}
                disabled={!connected || thinking}
                aria-pressed={micMuted}
                aria-label={micMuted ? "Nyalakan mikrofon" : "Bisukan mikrofon"}
                className={`flex h-13 w-13 items-center justify-center rounded-full backdrop-blur-md transition active:scale-95 disabled:opacity-45 ${
                  micMuted
                    ? "bg-white text-zinc-950 shadow-lg"
                    : "bg-white/18 text-white hover:bg-white/25"
                }`}
              >
                {micMuted ? (
                  <MicOffIcon className="h-6 w-6" />
                ) : (
                  <MicIcon className="h-6 w-6" />
                )}
              </button>
            )}

            {interactive && (
              <button
                type="button"
                onClick={toggleTextInput}
                disabled={!connected || thinking}
                aria-pressed={showTextInput}
                aria-label="Ketik pesan di dalam panggilan"
                className={`flex h-13 w-13 items-center justify-center rounded-full backdrop-blur-md transition active:scale-95 disabled:opacity-45 ${
                  showTextInput
                    ? "bg-white text-zinc-950 shadow-lg"
                    : "bg-white/18 text-white hover:bg-white/25"
                }`}
              >
                <ChatsIcon className="h-5 w-5" />
              </button>
            )}

            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? "Nyalakan suara panggilan" : "Bisukan panggilan"}
              className={`flex h-13 w-13 items-center justify-center rounded-full backdrop-blur-md transition active:scale-95 ${
                muted
                  ? "bg-white text-zinc-950 shadow-lg"
                  : "bg-white/18 text-white hover:bg-white/25"
              }`}
            >
              {muted ? <SpeakerOffIcon className="h-6 w-6" /> : <SpeakerIcon className="h-6 w-6" />}
            </button>

            <button
              type="button"
              onClick={endCall}
              aria-label="Akhiri panggilan"
              className="flex h-13 w-13 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-600 active:scale-95"
            >
              <CallEndIcon className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!isClient) return null;
  return createPortal(content, document.body);
}
