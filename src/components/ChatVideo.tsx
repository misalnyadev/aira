"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ensureMediaUrl, useMediaStatus, useMediaUrl } from "@/lib/mediaClient";
import { usePrefersReducedMotion } from "@/lib/motion";
import { PlayIcon, SpeakerIcon, SpeakerOffIcon } from "./icons";

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
  /** Perbesaran video (1 = 100%). */
  zoom?: number;
};

function useVideoPlayback(
  ref: RefObject<HTMLVideoElement | null>,
  videoKey: string | null,
  shouldPlay: boolean,
  sound = false,
  restartOnPlay = false
): string | null {
  const url = useMediaUrl(videoKey);

  useEffect(() => {
    if (videoKey) ensureMediaUrl(videoKey);
  }, [videoKey]);

  const wasPlaying = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !url) return;
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
    el.muted = !sound;
    void el.play().catch(() => {
      if (sound) {
        el.muted = true;
        void el.play().catch(() => {});
      }
    });
  }, [ref, url, shouldPlay, sound, restartOnPlay]);

  // Jaga-jaga di iOS: lanjutkan video bila dijeda otomatis saat TTS berbunyi.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onPause() {
      if (!shouldPlay || document.hidden) return;
      if (el!.ended) return;
      void el!.play().catch(() => {});
    }

    el.addEventListener("pause", onPause);
    return () => el.removeEventListener("pause", onPause);
  }, [ref, shouldPlay, url]);

  useEffect(() => {
    function onVisibilityChange() {
      const el = ref.current;
      if (!el) return;
      if (document.hidden) {
        el.pause();
        wasPlaying.current = false;
      } else if (shouldPlay) {
        el.muted = !sound;
        void el.play().catch(() => {
          if (sound) {
            el.muted = true;
            void el.play().catch(() => {});
          }
        });
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [ref, shouldPlay, sound]);

  return url;
}

/** Latar penuh: video memenuhi area chat atau layar video call. */
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
  zoom = 1,
}: VideoBackgroundProps) {
  const reduced = usePrefersReducedMotion();
  const baseRef = useRef<HTMLVideoElement>(null);
  const talkRef = useRef<HTMLVideoElement>(null);

  const talkingStatus = useMediaStatus(talkingVideoKey ?? null);
  const talkingActive = Boolean(
    talking && talkingVideoKey && !reduced && talkingStatus !== "missing"
  );
  const basePlay = !reduced && !talkingActive && playing;
  const baseUrl = useVideoPlayback(baseRef, videoKey, basePlay, sound, restartOnPlay);
  const talkUrl = useVideoPlayback(
    talkRef,
    talkingVideoKey ?? null,
    talkingActive,
    sound,
    restartOnPlay
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
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </div>

      {talkingActive && (
        <div className="fade-in absolute inset-0">
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
  const reduced = usePrefersReducedMotion();
  const baseRef = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);
  const [forcePlay, setForcePlay] = useState(false);

  const shouldPlay = !reduced || forcePlay;
  const baseUrl = useVideoPlayback(baseRef, videoKey, shouldPlay, sound);
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
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      <div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: dim }} />

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/55 to-transparent px-3 pb-6 pt-2">
        <span className="min-w-0 truncate text-xs font-semibold text-white/90">{name}</span>
        <div className="flex shrink-0 items-center gap-1">
          {reduced && !forcePlay && (
            <button
              type="button"
              onClick={() => setForcePlay(true)}
              className="rounded-full bg-black/45 p-1.5 text-white/90 backdrop-blur transition hover:bg-black/65"
              aria-label="Putar video latar"
              title="Putar video"
            >
              <PlayIcon className="h-4 w-4" />
            </button>
          )}
          {baseUrl && shouldPlay && (
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
