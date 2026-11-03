"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  buildWaveformBars,
  estimateVoiceNoteSeconds,
  formatVoiceNoteDuration,
} from "@/lib/voiceNote";

export function VoiceNoteBubble({
  messageId,
  text,
  isActiveMessage,
  isAudible,
  textStyle,
  timeLabel,
  ticksNode,
  onTogglePlay,
}: {
  messageId: string;
  text: string;
  /** Apakah pesan ini adalah pesan yang sedang antre/diputar oleh mesin suara. */
  isActiveMessage: boolean;
  /** Apakah gelombang suara benar-benar sedang berbunyi dari speaker. */
  isAudible: boolean;
  textStyle?: CSSProperties;
  timeLabel: string;
  ticksNode?: ReactNode;
  onTogglePlay: () => void;
}) {
  const [showText, setShowText] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const totalSeconds = useMemo(() => estimateVoiceNoteSeconds(text), [text]);
  const bars = useMemo(
    () => buildWaveformBars(`${messageId}:${text}`, 26),
    [messageId, text]
  );

  const isPlaying = isActiveMessage && isAudible;
  const isPreparing = isActiveMessage && !isAudible;

  useEffect(() => {
    if (!isPlaying) return;
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 100);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  const activeElapsedSec = isPlaying
    ? Math.min(totalSeconds, Math.floor(elapsedMs / 1000))
    : 0;
  const progress = isPlaying
    ? Math.min(0.98, elapsedMs / (totalSeconds * 1000))
    : 0;
  const litBars = isPlaying ? Math.max(1, Math.round(progress * bars.length)) : 0;

  return (
    <div
      className="min-w-[214px] w-[64vw] max-w-[264px] select-none"
      style={textStyle}
    >
      {/* Baris Utama: Tombol Play/Pause + Gelombang Suara */}
      <div className="flex items-center gap-2.5 pt-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlay();
          }}
          aria-label={isActiveMessage ? "Hentikan pesan suara" : "Putar pesan suara"}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-current/15 transition hover:bg-current/25 active:scale-95"
        >
          {isPreparing && (
            <span
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-current/25 border-t-current animate-spin"
              aria-hidden="true"
            />
          )}
          {isPlaying ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
              <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4 fill-current">
              <path d="M7.5 5.2c0-.9 1-1.45 1.77-.98l10.2 6.3c.73.45.73 1.51 0 1.96l-10.2 6.3c-.77.47-1.77-.08-1.77-.98V5.2Z" />
            </svg>
          )}
        </button>

        {/* 26 Batang Waveform */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlay();
          }}
          className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-[2.5px]"
          aria-hidden="true"
        >
          {bars.map((heightRatio, idx) => {
            const passed = isPlaying && idx < litBars;
            return (
              <span
                key={idx}
                style={{
                  height: `${Math.max(22, Math.round(heightRatio * 100))}%`,
                }}
                className={`min-w-0 flex-1 rounded-full bg-current transition-opacity duration-150 ${
                  passed
                    ? "opacity-95"
                    : isPlaying
                      ? "opacity-30"
                      : "opacity-55"
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Baris Bawah: Durasi · Lihat teks | Jam & Centang */}
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px]">
        <div className="flex min-w-0 items-center gap-1.5 opacity-80">
          <span className="font-mono text-[11px] tabular-nums">
            {isPlaying
              ? `${formatVoiceNoteDuration(activeElapsedSec)} / ${formatVoiceNoteDuration(totalSeconds)}`
              : formatVoiceNoteDuration(totalSeconds)}
          </span>
          {text.trim() && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowText((v) => !v);
                }}
                className="truncate font-semibold underline decoration-dotted underline-offset-2 transition hover:opacity-100"
              >
                {showText ? "Tutup teks" : "Lihat teks"}
              </button>
            </>
          )}
        </div>

        <span className="flex shrink-0 items-center gap-1 text-[11.5px] opacity-75">
          {timeLabel}
          {ticksNode}
        </span>
      </div>

      {/* Transkrip opsional saat sedang di tempat ramai */}
      {showText && text.trim() && (
        <p className="mt-1.5 border-t border-current/15 pt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed opacity-90 select-text">
          {text}
        </p>
      )}
    </div>
  );
}
