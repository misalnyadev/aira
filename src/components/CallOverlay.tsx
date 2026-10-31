"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { CharacterSummary } from "@/types/chat";
import { ensureMediaUrl, useMediaUrl } from "@/lib/mediaClient";
import { resetStatusBarColor, setStatusBarColor } from "@/lib/theme";
import { speak, stopSpeaking, useIsSpeaking, type VoiceSettings } from "@/lib/voice";
import { Avatar } from "./Avatar";
import { ChatVideoBackground } from "./ChatVideo";
import { CallEndIcon, SpeakerIcon, SpeakerOffIcon } from "./icons";

const CONNECT_DELAY = 1400;

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

/**
 * Layar panggilan suara & video call penuh ala WhatsApp.
 * - `video`: jeda "Memanggil..." → tersambung → memutar klip video call karakter
 *   dengan suara video aktif & perbesaran zoom yang diatur di profil karakter.
 * - `audio`: memutar rekaman suara telepon karakter dari R2 (bila ada), atau
 *   menyapa memakai suara perangkat bawaan (TTS).
 */
export function CallOverlay({
  character,
  mode,
  voice,
  onClose,
}: {
  character: CharacterSummary;
  mode: "video" | "audio";
  voice: VoiceSettings;
  onClose: () => void;
}) {
  const isClient = useIsClient();
  const [connected, setConnected] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const speaking = useIsSpeaking();
  const audioRef = useRef<HTMLAudioElement>(null);

  const media = character.media;
  const video = media?.callVideoKey
    ? { videoKey: media.callVideoKey, posterUrl: media.callVideoPosterUrl }
    : media?.chatVideoKey
      ? { videoKey: media.chatVideoKey, posterUrl: media.chatVideoPosterUrl }
      : null;

  const audioKey = media?.callAudioKey ?? null;
  const audioUrl = useMediaUrl(audioKey);
  const voiceCall = mode === "audio";
  const hasRecording = Boolean(audioKey) && voiceCall;
  const zoom = Math.min(2, Math.max(1, (media?.callVideoZoom ?? 100) / 100));

  const greeting = (character.greeting?.trim() || `Halo, ini ${character.name}.`).slice(0, 220);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Gelapkan area status bar & latar halaman agar layar panggilan penuh sampai poni atas.
  useEffect(() => {
    setStatusBarColor("#0a0a0c");
    const previousHtml = document.documentElement.style.backgroundColor;
    const previousBody = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = "#0a0a0c";
    document.body.style.backgroundColor = "#0a0a0c";
    stopSpeaking();
    return () => {
      resetStatusBarColor();
      document.documentElement.style.backgroundColor = previousHtml;
      document.body.style.backgroundColor = previousBody;
    };
  }, []);

  useEffect(() => {
    if (audioKey && voiceCall) ensureMediaUrl(audioKey);
  }, [audioKey, voiceCall]);

  const videoKey = video?.videoKey ?? null;

  // Siapkan URL video lebih awal saat masih "Memanggil..." supaya begitu tersambung langsung mulus.
  useEffect(() => {
    if (videoKey && mode === "video") ensureMediaUrl(videoKey);
  }, [videoKey, mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setConnected(true);
      if (voiceCall && !hasRecording) {
        speak(greeting, voice);
      }
    }, CONNECT_DELAY);
    return () => window.clearTimeout(timer);
  }, [greeting, voice, hasRecording, voiceCall]);

  useEffect(() => {
    const el = audioRef.current;
    if (!connected || !audioUrl || !el || !voiceCall) return;
    el.muted = muted;
    void el.play().catch(() => setAudioBlocked(true));
  }, [connected, audioUrl, muted, voiceCall]);

  useEffect(() => {
    if (!connected) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [connected]);

  useEffect(() => () => stopSpeaking(), []);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setAudioBlocked(false);
    const el = audioRef.current;
    if (el) {
      el.muted = next;
      if (!next) void el.play().catch(() => setAudioBlocked(true));
    }
    if (next) stopSpeaking();
  }

  function endCall() {
    stopSpeaking();
    const el = audioRef.current;
    if (el) el.pause();
    onClose();
  }

  const showWave = connected && !muted && (speaking || (hasRecording && mode === "audio"));

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${mode === "video" ? "Video call" : "Panggilan suara"} dengan ${character.name}`}
      className="fade-in fixed inset-0 z-[80] w-full overflow-hidden bg-[#0a0a0c] text-white"
    >
      <div className="absolute inset-0 isolate overflow-hidden">
        {video && mode === "video" && connected ? (
          <ChatVideoBackground
            videoKey={video.videoKey}
            posterUrl={video.posterUrl}
            dim={0.08}
            talkingVideoKey={media?.callVideoKey ? undefined : media?.chatVideoKey}
            talking={speaking}
            sound={!muted}
            zoom={zoom}
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_28%,#1d1d24,#0a0a0c_72%)]" />
        )}
      </div>

      <div className="relative flex h-full flex-col justify-between px-5 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)-0.25rem))] pt-[max(1.5rem,var(--safe-top))]">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
            {mode === "video" ? "Video call" : "Panggilan suara"}
          </p>
          <h2 className="mt-1 text-lg font-semibold drop-shadow">{character.name}</h2>
          <p className="mt-0.5 text-[13px] text-white/65">
            {connected ? `Tersambung · ${formatDuration(seconds)}` : "Memanggil..."}
          </p>
          {audioBlocked && (
            <p className="mt-1 text-[12px] text-white/55">
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
              <Avatar name={character.name} src={character.avatarUrl} size={140} />
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
            {(!video || !connected) && (
              <div className="relative">
                {!connected && (
                  <span className="absolute inset-0 -m-5 animate-ping rounded-full border border-white/15" />
                )}
                <Avatar name={character.name} src={character.avatarUrl} size={140} />
              </div>
            )}
          </div>
        )}

        <div className="flex items-start justify-center gap-8">
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? "Nyalakan suara panggilan" : "Bisukan panggilan"}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 active:scale-95"
            >
              {muted ? <SpeakerOffIcon className="h-6 w-6" /> : <SpeakerIcon className="h-6 w-6" />}
            </button>
            <span className="text-[11px] text-white/60">{muted ? "Nyalakan" : "Bisukan"}</span>
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              onClick={endCall}
              aria-label="Akhiri panggilan"
              className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg transition hover:bg-rose-600 active:scale-95"
            >
              <CallEndIcon className="h-6 w-6" />
            </button>
            <span className="text-[11px] text-white/60">Akhiri</span>
          </div>
        </div>
      </div>

      {audioUrl && voiceCall && (
        <audio ref={audioRef} src={audioUrl} preload="auto" className="hidden" />
      )}
    </div>
  );

  if (!isClient) return null;
  return createPortal(content, document.body);
}
