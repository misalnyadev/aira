"use client";

import { useRef, useState, type ReactNode } from "react";
import type { CharacterMedia } from "@/lib/characterMedia";
import {
  removeCharacterMediaKey,
  uploadCharacterAudio,
  uploadCharacterVideo,
} from "@/lib/mediaClient";
import { FilmIcon, SpeakerIcon } from "./icons";

type Slot = "chatVideo" | "callVideo" | "callAudio";

function MediaRow({
  label,
  hint,
  active,
  thumb,
  icon,
  busy,
  onPick,
  onRemove,
}: {
  label: string;
  hint: string;
  active: boolean;
  thumb?: string;
  icon: ReactNode;
  busy: boolean;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
      <div className="grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2 text-ink-soft">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink">{label}</p>
        <p className="truncate text-[12px] text-muted">{busy ? "Mengunggah..." : hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onPick}
          disabled={busy}
          className="rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-ink-soft transition hover:text-ink disabled:opacity-50"
        >
          {active ? "Ganti" : "Pilih"}
        </button>
        {active && !busy && (
          <button
            type="button"
            onClick={onRemove}
            className="text-[12px] font-medium text-ink-soft transition hover:text-ink"
          >
            Hapus
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Media pribadi karakter di Cloudflare R2:
 * - Video saat chat (panel 16:9 di atas pesan atau latar penuh)
 * - Video video call (+ penggeser zoom 100–200%)
 * - Rekaman suara telepon (MP3 / M4A / WAV)
 */
export function CharacterMediaSection({
  characterId,
  media,
  onChange,
}: {
  characterId: string;
  media: CharacterMedia | null | undefined;
  onChange: (next: CharacterMedia | null) => void;
}) {
  const chatVideoRef = useRef<HTMLInputElement>(null);
  const callVideoRef = useRef<HTMLInputElement>(null);
  const callAudioRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Nilai sementara slider zoom — disimpan saat jari dilepas. */
  const [zoomDraft, setZoomDraft] = useState<number | null>(null);
  const zoom = zoomDraft ?? media?.callVideoZoom ?? 100;

  function emitOrNull(next: CharacterMedia) {
    if (!next.chatVideoKey && !next.callVideoKey && !next.callAudioKey) {
      onChange(null);
    } else {
      onChange(next);
    }
  }

  function commitZoom(percent: number) {
    setZoomDraft(null);
    if (!media?.callVideoKey) return;
    emitOrNull({ ...media, callVideoZoom: percent });
  }

  async function pickVideo(slot: "chatVideo" | "callVideo", file: File) {
    setBusy(slot);
    setError(null);
    try {
      const uploaded = await uploadCharacterVideo(characterId, slot, file);
      const next: CharacterMedia = { ...(media ?? {}) };
      const previous = slot === "chatVideo" ? media?.chatVideoKey : media?.callVideoKey;
      if (slot === "chatVideo") {
        next.chatVideoKey = uploaded.key;
        next.chatVideoPosterUrl = uploaded.posterUrl;
        next.chatVideoLayout = media?.chatVideoLayout ?? "tile";
      } else {
        next.callVideoKey = uploaded.key;
        next.callVideoPosterUrl = uploaded.posterUrl;
        next.callVideoZoom = media?.callVideoZoom ?? 100;
      }
      emitOrNull(next);
      if (previous) void removeCharacterMediaKey(previous);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah video.");
    } finally {
      setBusy(null);
      if (chatVideoRef.current) chatVideoRef.current.value = "";
      if (callVideoRef.current) callVideoRef.current.value = "";
    }
  }

  async function pickAudio(file: File) {
    setBusy("callAudio");
    setError(null);
    try {
      const uploaded = await uploadCharacterAudio(characterId, file);
      const previous = media?.callAudioKey;
      emitOrNull({
        ...(media ?? {}),
        callAudioKey: uploaded.key,
        callAudioName: uploaded.name,
      });
      if (previous) void removeCharacterMediaKey(previous);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah suara.");
    } finally {
      setBusy(null);
      if (callAudioRef.current) callAudioRef.current.value = "";
    }
  }

  function dropVideo(slot: "chatVideo" | "callVideo") {
    const previous = slot === "chatVideo" ? media?.chatVideoKey : media?.callVideoKey;
    const next: CharacterMedia = { ...(media ?? {}) };
    if (slot === "chatVideo") {
      delete next.chatVideoKey;
      delete next.chatVideoPosterUrl;
      delete next.chatVideoLayout;
    } else {
      delete next.callVideoKey;
      delete next.callVideoPosterUrl;
      delete next.callVideoZoom;
    }
    emitOrNull(next);
    if (previous) void removeCharacterMediaKey(previous);
  }

  function dropAudio() {
    const previous = media?.callAudioKey;
    const next: CharacterMedia = { ...(media ?? {}) };
    delete next.callAudioKey;
    delete next.callAudioName;
    emitOrNull(next);
    if (previous) void removeCharacterMediaKey(previous);
  }

  return (
    <div className="space-y-2">
      <MediaRow
        label="Video saat chat"
        hint={
          media?.chatVideoKey
            ? "Tampil selama mengobrol."
            : "Adegan bicara — tampil saat mengobrol."
        }
        active={Boolean(media?.chatVideoKey)}
        thumb={media?.chatVideoPosterUrl}
        icon={<FilmIcon className="h-4 w-4" />}
        busy={busy === "chatVideo"}
        onPick={() => chatVideoRef.current?.click()}
        onRemove={() => dropVideo("chatVideo")}
      />

      {media?.chatVideoKey && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
          <span className="text-xs font-medium text-ink-soft">Tampilan video chat</span>
          <div className="flex gap-0.5 rounded-full bg-surface-2 p-0.5">
            {[
              { id: "tile" as const, label: "Panel atas" },
              { id: "full" as const, label: "Latar penuh" },
            ].map((option) => {
              const active = (media.chatVideoLayout ?? "tile") === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => emitOrNull({ ...media, chatVideoLayout: option.id })}
                  className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition ${
                    active ? "bg-surface text-ink shadow-xs" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <MediaRow
        label="Video video call"
        hint={
          media?.callVideoKey ? "Dipakai saat video call." : "Adegan untuk layar video call."
        }
        active={Boolean(media?.callVideoKey)}
        thumb={media?.callVideoPosterUrl}
        icon={<FilmIcon className="h-4 w-4" />}
        busy={busy === "callVideo"}
        onPick={() => callVideoRef.current?.click()}
        onRemove={() => dropVideo("callVideo")}
      />

      {media?.callVideoKey && (
        <div className="rounded-xl border border-line px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-soft">Zoom video call</span>
            <span className="text-xs font-semibold text-ink">{zoom}%</span>
          </div>
          <input
            type="range"
            min={100}
            max={200}
            step={5}
            value={zoom}
            onChange={(e) => setZoomDraft(Number(e.target.value))}
            onPointerUp={(e) => commitZoom(Number(e.currentTarget.value))}
            onTouchEnd={(e) => commitZoom(Number(e.currentTarget.value))}
            onKeyUp={(e) => commitZoom(Number(e.currentTarget.value))}
            onBlur={(e) => commitZoom(Number(e.currentTarget.value))}
            aria-label="Zoom video panggilan"
            className="mt-1 w-full accent-ink"
          />
          <p className="mt-1 text-[12px] leading-snug text-muted">
            Perbesar bila ada bingkai hitam di tepi video, supaya layar panggilan penuh.
          </p>
        </div>
      )}

      <MediaRow
        label="Suara telepon"
        hint={
          media?.callAudioKey
            ? (media.callAudioName ?? "Rekaman suara aktif.")
            : "Rekaman MP3/WAV untuk panggilan telepon."
        }
        active={Boolean(media?.callAudioKey)}
        icon={<SpeakerIcon className="h-4 w-4" />}
        busy={busy === "callAudio"}
        onPick={() => callAudioRef.current?.click()}
        onRemove={dropAudio}
      />

      <p className="text-[12px] leading-snug text-muted">
        Opsional — tersimpan di akunmu dan ikut ke semua perangkat. Tanpa rekaman suara, panggilan
        memakai suara perangkat bawaan.
      </p>
      {error && <p className="text-[12px] text-rose-600 dark:text-rose-400">{error}</p>}

      <input
        ref={chatVideoRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pickVideo("chatVideo", file);
        }}
      />
      <input
        ref={callVideoRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pickVideo("callVideo", file);
        }}
      />
      <input
        ref={callAudioRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/mp4,audio/aac,audio/ogg,audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pickAudio(file);
        }}
      />
    </div>
  );
}
