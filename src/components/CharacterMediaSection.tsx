"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  CALL_CLIP_SLOTS,
  type CallClipSlot,
  type CallClips,
  type CharacterMedia,
} from "@/lib/characterMedia";
import {
  removeCharacterMediaKey,
  uploadCharacterAudio,
  uploadCharacterVideo,
} from "@/lib/mediaClient";
import { FilmIcon, SpeakerIcon } from "./icons";

type BusyTarget = "chatVideo" | "callVideo" | "callAudio" | CallClipSlot;

const CALL_EXPRESSION_META: {
  slot: CallClipSlot;
  label: string;
  hint: string;
  activeHint: string;
}[] = [
  {
    slot: "listening",
    label: "Menyimak & angguk",
    hint: "Saat kamu bicara (saran 6 dtk).",
    activeHint: "Aktif saat mendengarkanmu.",
  },
  {
    slot: "thinking",
    label: "Mikir mau jawab",
    hint: "Saat jeda berpikir (saran 4 dtk).",
    activeHint: "Aktif saat menyiapkan jawaban.",
  },
  {
    slot: "talking",
    label: "Bicara ramah",
    hint: "Saat mengobrol biasa (saran 8 dtk).",
    activeHint: "Aktif saat berbicara santai.",
  },
  {
    slot: "laugh",
    label: "Tertawa / ceria",
    hint: "Saat bercanda & ketawa (saran 6 dtk).",
    activeHint: "Aktif saat suasana ketawa.",
  },
  {
    slot: "shy",
    label: "Malu / senyum manis",
    hint: "Saat dipuji / lembut (saran 6 dtk).",
    activeHint: "Aktif saat tersipu / romantis.",
  },
  {
    slot: "pout",
    label: "Cemberut / heran",
    hint: "Saat ngambek manja / kaget (saran 6 dtk).",
    activeHint: "Aktif saat cemberut / heran.",
  },
];

function MediaRow({
  label,
  hint,
  active,
  thumb,
  icon,
  busy,
  disabled,
  compact = false,
  onPick,
  onRemove,
}: {
  label: string;
  hint: string;
  active: boolean;
  thumb?: string;
  icon: ReactNode;
  busy: boolean;
  disabled?: boolean;
  compact?: boolean;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-line ${
        compact ? "px-2.5 py-1.5" : "px-3 py-2"
      }`}
    >
      <div
        className={`grid shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2 text-ink-soft ${
          compact ? "h-9 w-12" : "h-10 w-14"
        }`}
      >
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
          disabled={busy || disabled}
          className="rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-ink-soft transition hover:text-ink disabled:opacity-50"
        >
          {active ? "Ganti" : "Pilih"}
        </button>
        {active && !busy && !disabled && (
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
 * - Video saat chat (panel 16:9 di atas pesan atau latar penuh, terpisah dari video call)
 * - Video video call utama (diam/idle) + paket 6 klip ekspresi interaktif + zoom 100–200%
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
  const clipInputRef = useRef<HTMLInputElement>(null);
  const callAudioRef = useRef<HTMLInputElement>(null);
  const pendingClipSlotRef = useRef<CallClipSlot | null>(null);

  const filledClipCount = CALL_CLIP_SLOTS.filter(
    (s) => Boolean(media?.callClips?.[s]?.key)
  ).length;

  const [busy, setBusy] = useState<BusyTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExpressions, setShowExpressions] = useState<boolean>(filledClipCount > 0);
  /** Nilai sementara slider zoom — disimpan saat jari dilepas. */
  const [zoomDraft, setZoomDraft] = useState<number | null>(null);
  const zoom = zoomDraft ?? media?.callVideoZoom ?? 100;
  const hasAnyCallVideo = Boolean(media?.callVideoKey || filledClipCount > 0);

  function emitOrNull(next: CharacterMedia) {
    const nextClipCount = CALL_CLIP_SLOTS.filter(
      (s) => Boolean(next.callClips?.[s]?.key)
    ).length;
    const cleaned: CharacterMedia = { ...next };
    if (nextClipCount === 0) {
      delete cleaned.callClips;
    }
    if (!cleaned.callVideoKey && nextClipCount === 0) {
      delete cleaned.callVideoZoom;
    }
    if (
      !cleaned.chatVideoKey &&
      !cleaned.callVideoKey &&
      !cleaned.callClips &&
      !cleaned.callAudioKey
    ) {
      onChange(null);
    } else {
      onChange(cleaned);
    }
  }

  function commitZoom(percent: number) {
    setZoomDraft(null);
    if (!hasAnyCallVideo || !media) return;
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

  async function pickExpressionClip(clipSlot: CallClipSlot, file: File) {
    setBusy(clipSlot);
    setError(null);
    try {
      const uploaded = await uploadCharacterVideo(characterId, "callVideo", file);
      const prevKey = media?.callClips?.[clipSlot]?.key;
      const nextClips: CallClips = {
        ...(media?.callClips ?? {}),
        [clipSlot]: {
          key: uploaded.key,
          ...(uploaded.posterUrl ? { posterUrl: uploaded.posterUrl } : {}),
        },
      };
      emitOrNull({
        ...(media ?? {}),
        callClips: nextClips,
        callVideoZoom: media?.callVideoZoom ?? 100,
      });
      if (prevKey) void removeCharacterMediaKey(prevKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah klip ekspresi.");
    } finally {
      setBusy(null);
      pendingClipSlotRef.current = null;
      if (clipInputRef.current) clipInputRef.current.value = "";
    }
  }

  function dropExpressionClip(clipSlot: CallClipSlot) {
    const prevKey = media?.callClips?.[clipSlot]?.key;
    const nextClips: CallClips = { ...(media?.callClips ?? {}) };
    delete nextClips[clipSlot];
    emitOrNull({
      ...(media ?? {}),
      callClips: nextClips,
    });
    if (prevKey) void removeCharacterMediaKey(prevKey);
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
            ? "Khusus ruang chat (tidak dipakai di video call)."
            : "Adegan khusus ruang chat."
        }
        active={Boolean(media?.chatVideoKey)}
        thumb={media?.chatVideoPosterUrl}
        icon={<FilmIcon className="h-4 w-4" />}
        busy={busy === "chatVideo"}
        disabled={busy !== null}
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
        label="Video call · Diam / Utama"
        hint={
          media?.callVideoKey
            ? "Tatapan tenang saat jeda panggilan."
            : "Klip dasar menatap tenang (saran 8–10 dtk)."
        }
        active={Boolean(media?.callVideoKey)}
        thumb={media?.callVideoPosterUrl}
        icon={<FilmIcon className="h-4 w-4" />}
        busy={busy === "callVideo"}
        disabled={busy !== null}
        onPick={() => callVideoRef.current?.click()}
        onRemove={() => dropVideo("callVideo")}
      />

      {/* Paket klip ekspresi tambahan untuk rekayasa video call natural */}
      <div className="rounded-xl border border-line">
        <button
          type="button"
          onClick={() => setShowExpressions((v) => !v)}
          aria-expanded={showExpressions}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink">Paket ekspresi video call</p>
            <p className="truncate text-[12px] text-muted">
              {filledClipCount > 0
                ? `${filledClipCount} dari 6 klip ekspresi aktif`
                : "Opsional — menyimak, mikir, bicara, ketawa, malu, cemberut"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-[11.5px] font-medium text-ink-soft">
            {showExpressions ? "Tutup" : filledClipCount > 0 ? `${filledClipCount}/6` : "Atur"}
          </span>
        </button>

        {showExpressions && (
          <div className="space-y-1.5 border-t border-line px-2.5 py-2.5">
            <p className="px-0.5 text-[11.5px] leading-snug text-muted">
              Gunakan foto awal & akhir (*Frame*) yang sama agar perpindahan antar-ekspresi
              menyatu mulus. Slot yang kosong otomatis memakai klip utama.
            </p>
            {CALL_EXPRESSION_META.map((item) => {
              const clip = media?.callClips?.[item.slot];
              return (
                <MediaRow
                  key={item.slot}
                  label={item.label}
                  hint={clip?.key ? item.activeHint : item.hint}
                  active={Boolean(clip?.key)}
                  thumb={clip?.posterUrl}
                  icon={<FilmIcon className="h-3.5 w-3.5" />}
                  busy={busy === item.slot}
                  disabled={busy !== null}
                  compact
                  onPick={() => {
                    pendingClipSlotRef.current = item.slot;
                    clipInputRef.current?.click();
                  }}
                  onRemove={() => dropExpressionClip(item.slot)}
                />
              );
            })}
          </div>
        )}
      </div>

      {hasAnyCallVideo && (
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
        disabled={busy !== null}
        onPick={() => callAudioRef.current?.click()}
        onRemove={dropAudio}
      />

      <p className="text-[12px] leading-snug text-muted">
        Opsional — tersimpan di akunmu dan ikut ke semua perangkat. Tanpa rekaman suara, panggilan
        memakai suara karakter / perangkat.
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
        ref={clipInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const slot = pendingClipSlotRef.current;
          if (file && slot) void pickExpressionClip(slot, file);
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
