"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ensureMediaUrl,
  fallbackMediaToStream,
  useMediaStatus,
  useMediaUrl,
} from "@/lib/mediaClient";
import { SpeakerIcon, SpeakerOffIcon } from "./icons";

type VideoBackgroundProps = {
  videoKey: string;
  posterUrl?: string;
  dim: number;
  /** Klip pengganti saat karakter "bicara". */
  talkingVideoKey?: string;
  talkingPosterUrl?: string;
  /** true saat karakter mengetik atau suaranya sedang dibacakan. */
  talking?: boolean;
  /** false = klip dijeda (dipakai latar chat ketika karakter selesai menjawab). */
  playing?: boolean;
  /** true = kembali ke bingkai pertama setiap kali mulai bergerak lagi. */
  restartOnPlay?: boolean;
  /** Izinkan suara asli video (aktif di layar video call). */
  sound?: boolean;
  /** Dipanggil bila browser desktop menahan suara otomatis agar tombol suara menyesuaikan. */
  onSoundBlocked?: () => void;
  /** Perbesaran video (1 = 100%). */
  zoom?: number;
};

function startElementPlayback(
  el: HTMLVideoElement,
  sound: boolean,
  onSoundBlocked?: () => void
) {
  el.defaultMuted = !sound;
  el.muted = !sound;
  const attempt = el.play();
  if (!attempt) return;
  void attempt.catch((err: unknown) => {
    // Jika hanya terpotong pergantian buffer/seek sesaat, biarkan event `canplay` melanjutkan.
    if (err instanceof DOMException && err.name === "AbortError") {
      return;
    }
    if (sound) {
      el.defaultMuted = true;
      el.muted = true;
      onSoundBlocked?.();
      void el.play().catch(() => {});
    }
  });
}

function useVideoPlayback(
  ref: RefObject<HTMLVideoElement | null>,
  videoKey: string | null,
  shouldPlay: boolean,
  sound = false,
  restartOnPlay = false,
  onSoundBlocked?: () => void
): string | null {
  const url = useMediaUrl(videoKey);
  const blockedCallbackRef = useRef(onSoundBlocked);

  useEffect(() => {
    blockedCallbackRef.current = onSoundBlocked;
  }, [onSoundBlocked]);

  useEffect(() => {
    if (videoKey) ensureMediaUrl(videoKey);
  }, [videoKey]);

  const wasPlaying = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !url) return;
    el.defaultMuted = !sound;
    el.muted = !sound;
    if (!shouldPlay) {
      el.pause();
      wasPlaying.current = false;
      return;
    }
    if (restartOnPlay && !wasPlaying.current) {
      try {
        el.currentTime = 0;
      } catch {
        // Sebagian browser menolak seek sebelum metadata siap.
      }
    }
    wasPlaying.current = true;
    startElementPlayback(el, sound, blockedCallbackRef.current);
  }, [ref, url, shouldPlay, sound, restartOnPlay]);

  // Pastikan di browser laptop/desktop video langsung berputar begitu frame siap,
  // dan lanjutkan lagi di iOS bila sempat dijeda saat audio TTS mulai berbunyi.
  useEffect(() => {
    const el = ref.current;
    if (!el || !url) return;

    function resumeIfNeeded() {
      const target = ref.current;
      if (!target || !shouldPlay || document.hidden) return;
      if (target.ended) return;
      if (target.paused) {
        startElementPlayback(target, sound, blockedCallbackRef.current);
      }
    }

    el.addEventListener("loadeddata", resumeIfNeeded);
    el.addEventListener("canplay", resumeIfNeeded);
    el.addEventListener("pause", resumeIfNeeded);
    return () => {
      el.removeEventListener("loadeddata", resumeIfNeeded);
      el.removeEventListener("canplay", resumeIfNeeded);
      el.removeEventListener("pause", resumeIfNeeded);
    };
  }, [ref, shouldPlay, sound, url]);

  useEffect(() => {
    function onVisibilityChange() {
      const el = ref.current;
      if (!el) return;
      if (document.hidden) {
        el.pause();
        wasPlaying.current = false;
      } else if (shouldPlay) {
        startElementPlayback(el, sound, blockedCallbackRef.current);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [ref, shouldPlay, sound]);

  return url;
}

/**
 * Latar penuh: video memenuhi area chat atau layar video call.
 * Tidak dikunci oleh `prefers-reduced-motion` OS karena di laptop Windows
 * mematikan animasi jendela sistem sering membuat `<video>` karakter & video call
 * membeku menjadi foto poster diam.
 */
export function ChatVideoBackground({
  videoKey,
  posterUrl,
  dim,
  talkingVideoKey,
  talkingPosterUrl,
  talking = false,
  playing = true,
  restartOnPlay = false,
  sound = false,
  onSoundBlocked,
  zoom = 1,
}: VideoBackgroundProps) {
  const baseRef = useRef<HTMLVideoElement>(null);
  const talkRef = useRef<HTMLVideoElement>(null);

  const talkingStatus = useMediaStatus(talkingVideoKey ?? null);
  const talkingActive = Boolean(
    talking && talkingVideoKey && talkingStatus !== "missing"
  );
  const basePlay = !talkingActive && playing;
  const baseUrl = useVideoPlayback(
    baseRef,
    videoKey,
    basePlay,
    sound,
    restartOnPlay,
    onSoundBlocked
  );
  const talkUrl = useVideoPlayback(
    talkRef,
    talkingVideoKey ?? null,
    talkingActive,
    sound,
    restartOnPlay,
    onSoundBlocked
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-[#07070a]"
    >
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          talkingActive ? "opacity-0" : "opacity-100"
        }`}
        style={zoom !== 1 ? { transform: `scale(${zoom})` } : undefined}
      >
        {posterUrl && (
          <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {baseUrl && (
          <video
            ref={baseRef}
            src={baseUrl}
            poster={posterUrl || undefined}
            muted={!sound}
            loop
            playsInline
            autoPlay={basePlay}
            preload="auto"
            disablePictureInPicture
            tabIndex={-1}
            onError={() => {
              fallbackMediaToStream(videoKey);
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>

      {talkingActive && (
        <div
          className="fade-in absolute inset-0"
          style={zoom !== 1 ? { transform: `scale(${zoom})` } : undefined}
        >
          {talkingPosterUrl && (
            <img
              src={talkingPosterUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {talkUrl && (
            <video
              ref={talkRef}
              src={talkUrl}
              poster={talkingPosterUrl || undefined}
              muted={!sound}
              loop
              playsInline
              autoPlay
              preload="auto"
              disablePictureInPicture
              tabIndex={-1}
              onError={() => {
                fallbackMediaToStream(talkingVideoKey);
              }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </div>
      )}

      <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />
    </div>
  );
}

/** Panel 16:9 di atas pesan — gaya kartu video di ruang chat. */
export function ChatVideoPanel({
  videoKey,
  posterUrl,
  dim,
  name,
}: {
  videoKey: string;
  posterUrl?: string;
  dim: number;
  name: string;
}) {
  const baseRef = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);

  const baseUrl = useVideoPlayback(
    baseRef,
    videoKey,
    true,
    sound,
    false,
    () => setSound(false)
  );
  const status = useMediaStatus(videoKey);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-[#07070a] shadow-xs">
      {posterUrl && (
        <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {baseUrl && (
        <video
          ref={baseRef}
          src={baseUrl}
          poster={posterUrl || undefined}
          muted={!sound}
          loop
          playsInline
          autoPlay
          preload="auto"
          disablePictureInPicture
          onError={() => {
            fallbackMediaToStream(videoKey);
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      <div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: dim }} />

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/55 to-transparent px-3 pb-6 pt-2">
        <span className="min-w-0 truncate text-xs font-semibold text-white/90">{name}</span>
        <div className="flex shrink-0 items-center gap-1">
          {baseUrl && (
            <button
              type="button"
              onClick={() => setSound((value) => !value)}
              aria-pressed={sound}
              className="rounded-full bg-black/45 p-1.5 text-white/90 backdrop-blur transition hover:bg-black/65"
              aria-label={sound ? "Matikan suara video" : "Nyalakan suara video"}
              title={sound ? "Matikan suara" : "Nyalakan suara"}
            >
              {sound ? <SpeakerIcon className="h-4 w-4" /> : <SpeakerOffIcon className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {status === "missing" && (
        <div className="absolute inset-0 grid place-items-center bg-black/55 px-4 text-center text-xs text-white/85">
          Video belum bisa dimuat — periksa koneksi atau pilih ulang videonya.
        </div>
      )}
    </div>
  );
}
