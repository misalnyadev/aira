"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CALL_AUDIO_SLOTS,
  CALL_CLIP_SLOTS,
  DEFAULT_CALL_AUDIO_PACK,
  type CallAudioSlot,
  type CallAudios,
  type CallClipSlot,
  type CallClips,
  type CharacterMedia,
} from "@/lib/characterMedia";
import {
  ensureMediaUrl,
  fallbackMediaToStream,
  generateCharacterCallAudio,
  getMediaUrl,
  removeCharacterMediaKey,
  uploadCharacterAudio,
  uploadCharacterVideo,
} from "@/lib/mediaClient";
import { unlockSpeech } from "@/lib/voice";
import {
  FilmIcon,
  PlayIcon,
  RefreshIcon,
  SpeakerIcon,
  TrashIcon,
} from "./icons";

type BusyTarget =
  | "chatVideo"
  | "callVideo"
  | "callAudio"
  | CallClipSlot
  | `audio:${CallAudioSlot}`
  | `gen:${CallAudioSlot}`;

const CALL_EXPRESSION_META: {
  slot: CallClipSlot;
  label: string;
  hint: string;
  activeHint: string;
}[] = [
  {
    slot: "greeting",
    label: "Pembuka angkat telepon (1x)",
    hint: "Sapaan 1x dengan suara asli videonya (4 dtk).",
    activeHint: "Diputar 1x bersuara asli saat diangkat.",
  },
  {
    slot: "listening",
    label: "Mendengarkan",
    hint: "Menyimak sampai kamu selesai bicara.",
    activeHint: "Aktif saat mendengarkanmu.",
  },
  {
    slot: "thinking",
    label: "Mikir menunggu jawaban",
    hint: "Ekspresi mikir selagi AI menyiapkan balasan.",
    activeHint: "Aktif saat menunggu jawaban AI.",
  },
  {
    slot: "talking",
    label: "Menjawab biasa",
    hint: "Saat menjawab santai/normal.",
    activeHint: "Aktif saat menjawab biasa.",
  },
  {
    slot: "smile",
    label: "Menjawab sambil senyum",
    hint: "Saat menjawab hangat & senang.",
    activeHint: "Aktif saat tersenyum hangat.",
  },
  {
    slot: "laugh",
    label: "Tertawa / bercanda",
    hint: "Saat ketawa lepas & ceria.",
    activeHint: "Aktif saat tertawa.",
  },
  {
    slot: "shy",
    label: "Malu / tersipu",
    hint: "Saat salah tingkah / dipuji.",
    activeHint: "Aktif saat malu-malu.",
  },
  {
    slot: "pout",
    label: "Cemberut / ngambek",
    hint: "Saat ngambek manja / merajuk.",
    activeHint: "Aktif saat cemberut.",
  },
  {
    slot: "confused",
    label: "Bingung / heran",
    hint: "Saat bingung memastikan maksudmu.",
    activeHint: "Aktif saat bingung.",
  },
  {
    slot: "angry",
    label: "Marah / kesal",
    hint: "Saat kesal atau protes tegas.",
    activeHint: "Aktif saat marah/kesal.",
  },
  {
    slot: "sad",
    label: "Sedih / empati",
    hint: "Saat sedih, terharu, atau bersimpati.",
    activeHint: "Aktif saat sedih.",
  },
  {
    slot: "surprised",
    label: "Kaget / tak menyangka",
    hint: "Saat spontan terkejut.",
    activeHint: "Aktif saat kaget.",
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
 * - Video saat chat (khusus ruang chat, terpisah dari video call)
 * - Video call utama + paket 12 klip pembuka & ekspresi (OmniFlash Flow) + zoom
 * - Paket 10 asset audio panggilan dengan Generator per-Asset Gemini HD + uji putar langsung
 */
export function CharacterMediaSection({
  characterId,
  media,
  fallbackVoiceSlot = "female",
  onChange,
}: {
  characterId: string;
  media: CharacterMedia | null | undefined;
  /** Slot suara default dari halaman Suara bila karakter memakai mode 'Mengikuti Suara'. */
  fallbackVoiceSlot?: "female" | "male";
  onChange: (next: CharacterMedia | null) => void;
}) {
  const chatVideoRef = useRef<HTMLInputElement>(null);
  const callVideoRef = useRef<HTMLInputElement>(null);
  const clipInputRef = useRef<HTMLInputElement>(null);
  const callAudioRef = useRef<HTMLInputElement>(null);
  const reactionAudioRef = useRef<HTMLInputElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);
  const pendingClipSlotRef = useRef<CallClipSlot | null>(null);
  const pendingAudioSlotRef = useRef<CallAudioSlot | null>(null);

  const filledClipCount = CALL_CLIP_SLOTS.filter(
    (s) => Boolean(media?.callClips?.[s]?.key)
  ).length;
  const filledAudioCount = CALL_AUDIO_SLOTS.filter(
    (s) => Boolean(media?.callAudios?.[s]?.key)
  ).length;

  const [busy, setBusy] = useState<BusyTarget | null>(null);
  const [playingSlot, setPlayingSlot] = useState<CallAudioSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExpressions, setShowExpressions] = useState<boolean>(filledClipCount > 0);
  const [showAudioPack, setShowAudioPack] = useState<boolean>(filledAudioCount > 0);
  const [scriptDrafts, setScriptDrafts] = useState<Partial<Record<CallAudioSlot, string>>>(
    {}
  );
  /** Nilai sementara slider zoom — disimpan saat jari dilepas. */
  const [zoomDraft, setZoomDraft] = useState<number | null>(null);
  const zoom = zoomDraft ?? media?.callVideoZoom ?? 100;
  const hasAnyCallVideo = Boolean(media?.callVideoKey || filledClipCount > 0);

  useEffect(() => {
    const audioEl = previewAudioRef.current;
    return () => {
      audioEl?.pause();
    };
  }, []);

  function scriptValueFor(slot: CallAudioSlot): string {
    const draft = scriptDrafts[slot];
    if (draft !== undefined) return draft;
    return media?.callAudios?.[slot]?.text ?? DEFAULT_CALL_AUDIO_PACK[slot].defaultText;
  }

  function emitOrNull(next: CharacterMedia) {
    const nextClipCount = CALL_CLIP_SLOTS.filter(
      (s) => Boolean(next.callClips?.[s]?.key)
    ).length;
    const nextAudioCount = CALL_AUDIO_SLOTS.filter(
      (s) => Boolean(next.callAudios?.[s]?.key)
    ).length;
    const cleaned: CharacterMedia = { ...next };
    if (nextClipCount === 0) {
      delete cleaned.callClips;
    }
    if (nextAudioCount === 0) {
      delete cleaned.callAudios;
    }
    if (!cleaned.callVideoKey && nextClipCount === 0) {
      delete cleaned.callVideoZoom;
      delete cleaned.useCallClipsInChat;
    }
    if (!cleaned.chatVideoKey && !cleaned.useCallClipsInChat) {
      delete cleaned.chatVideoLayout;
    }
    if (
      !cleaned.chatVideoKey &&
      !cleaned.callVideoKey &&
      !cleaned.callClips &&
      !cleaned.callAudioKey &&
      !cleaned.callAudios
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

  async function pickReactionAudio(audioSlot: CallAudioSlot, file: File) {
    setBusy(`audio:${audioSlot}`);
    setError(null);
    try {
      const uploaded = await uploadCharacterAudio(characterId, file);
      const prevKey = media?.callAudios?.[audioSlot]?.key;
      const currentText = scriptValueFor(audioSlot).trim();
      const nextAudios: CallAudios = {
        ...(media?.callAudios ?? {}),
        [audioSlot]: {
          key: uploaded.key,
          name: uploaded.name,
          ...(currentText ? { text: currentText } : {}),
        },
      };
      emitOrNull({
        ...(media ?? {}),
        callAudios: nextAudios,
      });
      if (prevKey) void removeCharacterMediaKey(prevKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah audio ekspresi.");
    } finally {
      setBusy(null);
      pendingAudioSlotRef.current = null;
      if (reactionAudioRef.current) reactionAudioRef.current.value = "";
    }
  }

  async function handleGenerateSlotAudio(audioSlot: CallAudioSlot) {
    unlockSpeech();
    const scriptText =
      scriptValueFor(audioSlot).trim() || DEFAULT_CALL_AUDIO_PACK[audioSlot].defaultText;
    setBusy(`gen:${audioSlot}`);
    setError(null);
    try {
      const generated = await generateCharacterCallAudio({
        characterId,
        audioSlot,
        text: scriptText,
        fallbackSlot: fallbackVoiceSlot,
      });
      const prevKey = media?.callAudios?.[audioSlot]?.key;
      const nextAudios: CallAudios = {
        ...(media?.callAudios ?? {}),
        [audioSlot]: {
          key: generated.key,
          name: generated.name,
          text: generated.text,
        },
      };
      emitOrNull({
        ...(media ?? {}),
        callAudios: nextAudios,
      });
      if (prevKey && prevKey !== generated.key) {
        void removeCharacterMediaKey(prevKey);
      }
      // Putar pratinjau otomatis supaya langsung terdengar hasilnya!
      playPreviewKey(audioSlot, generated.key);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Gagal men-generate audio Gemini untuk ekspresi ini."
      );
    } finally {
      setBusy(null);
    }
  }

  function stopPreviewAudio() {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.onended = null;
      previewAudioRef.current.onerror = null;
    }
    setPlayingSlot(null);
  }

  function playPreviewKey(slot: CallAudioSlot, key: string) {
    unlockSpeech();
    if (playingSlot === slot) {
      stopPreviewAudio();
      return;
    }
    stopPreviewAudio();
    const el = previewAudioRef.current;
    if (!el) return;
    ensureMediaUrl(key);

    let retried = false;
    const initial = getMediaUrl(key) ?? `/api/media/stream?key=${encodeURIComponent(key)}`;

    const runUrl = (src: string) => {
      el.onended = () => setPlayingSlot(null);
      el.onerror = () => {
        if (!retried && fallbackMediaToStream(key)) {
          retried = true;
          const nextUrl = getMediaUrl(key);
          if (nextUrl) {
            runUrl(nextUrl);
            return;
          }
        }
        setPlayingSlot(null);
      };
      el.src = src;
      setPlayingSlot(slot);
      void el.play().catch(() => {
        setPlayingSlot(null);
      });
    };

    runUrl(initial);
  }

  function dropReactionAudio(audioSlot: CallAudioSlot) {
    if (playingSlot === audioSlot) {
      stopPreviewAudio();
    }
    const prevKey = media?.callAudios?.[audioSlot]?.key;
    const nextAudios: CallAudios = { ...(media?.callAudios ?? {}) };
    delete nextAudios[audioSlot];
    emitOrNull({
      ...(media ?? {}),
      callAudios: nextAudios,
    });
    if (prevKey) void removeCharacterMediaKey(prevKey);
  }

  function dropVideo(slot: "chatVideo" | "callVideo") {
    const previous = slot === "chatVideo" ? media?.chatVideoKey : media?.callVideoKey;
    const next: CharacterMedia = { ...(media ?? {}) };
    if (slot === "chatVideo") {
      delete next.chatVideoKey;
      delete next.chatVideoPosterUrl;
      if (!next.useCallClipsInChat) {
        delete next.chatVideoLayout;
      }
    } else {
      delete next.callVideoKey;
      delete next.callVideoPosterUrl;
    }
    emitOrNull(next);
    if (previous) void removeCharacterMediaKey(previous);
  }

  function toggleUseCallClipsInChat() {
    if (!hasAnyCallVideo || !media) return;
    const next: CharacterMedia = { ...media };
    if (media.useCallClipsInChat) {
      delete next.useCallClipsInChat;
      if (!next.chatVideoKey) {
        delete next.chatVideoLayout;
      }
    } else {
      next.useCallClipsInChat = true;
      next.chatVideoLayout = media.chatVideoLayout ?? "tile";
    }
    emitOrNull(next);
  }

  function dropAudio() {
    const previous = media?.callAudioKey;
    const next: CharacterMedia = { ...(media ?? {}) };
    delete next.callAudioKey;
    delete next.callAudioName;
    emitOrNull(next);
    if (previous) void removeCharacterMediaKey(previous);
  }

  const useCallInChat = Boolean(hasAnyCallVideo && media?.useCallClipsInChat);
  const showChatLayoutSelector = Boolean(media?.chatVideoKey || useCallInChat);

  return (
    <div className="space-y-2">
      <MediaRow
        label="Video saat chat"
        hint={
          useCallInChat
            ? "Sedang memakai ekspresi dari aset video call."
            : media?.chatVideoKey
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

      <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink">
            Gunakan aset video call saat chat
          </p>
          <p className="text-[12px] leading-snug text-muted">
            {!hasAnyCallVideo
              ? "Unggah klip video call dulu untuk menampilkan ekspresi di chat."
              : useCallInChat
                ? "Ekspresi diam, dengar, mikir, & bicara ikut hidup di ruang chat."
                : "Tampilkan ekspresi hidup dari klip video call langsung saat chat."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={useCallInChat}
          aria-label="Gunakan aset video call saat chat"
          disabled={!hasAnyCallVideo || busy !== null}
          onClick={toggleUseCallClipsInChat}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-45 ${
            useCallInChat ? "bg-emerald-500" : "bg-line"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
              useCallInChat ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {showChatLayoutSelector && media && (
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
            ? "Klip dasar cadangan saat mic dimatikan."
            : "Klip dasar menatap tenang (OmniFlash Flow)."
        }
        active={Boolean(media?.callVideoKey)}
        thumb={media?.callVideoPosterUrl}
        icon={<FilmIcon className="h-4 w-4" />}
        busy={busy === "callVideo"}
        disabled={busy !== null}
        onPick={() => callVideoRef.current?.click()}
        onRemove={() => dropVideo("callVideo")}
      />

      {/* Paket 12 klip video pembuka & ekspresi (OmniFlash Flow) */}
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
                ? `${filledClipCount} dari ${CALL_CLIP_SLOTS.length} klip aktif`
                : "Pembuka 1x, dengar, mikir, jawab biasa, senyum, malu, marah, sedih, kaget…"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-[11.5px] font-medium text-ink-soft">
            {showExpressions
              ? "Tutup"
              : filledClipCount > 0
                ? `${filledClipCount}/${CALL_CLIP_SLOTS.length}`
                : "Atur"}
          </span>
        </button>

        {showExpressions && (
          <div className="space-y-1.5 border-t border-line px-2.5 py-2.5">
            <p className="px-0.5 text-[11.5px] leading-snug text-muted">
              Unggah klip dari OmniFlash Flow dengan *frame* awal & akhir seragam agar
              perpindahan mulus. Klip <strong>Pembuka</strong> diputar 1x di awal lalu
              otomatis lanjut ke <strong>Mendengarkan</strong>.
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
            <span className="text-xs font-medium text-ink-soft">
              {useCallInChat ? "Zoom video call & chat" : "Zoom video call"}
            </span>
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

      {/* Paket 10 asset audio panggilan — Generate per-asset langsung dari Gemini HD */}
      <div className="rounded-xl border border-line">
        <button
          type="button"
          onClick={() => setShowAudioPack((v) => !v)}
          aria-expanded={showAudioPack}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink">
              Paket audio panggilan (Gemini HD)
            </p>
            <p className="truncate text-[12px] text-muted">
              {filledAudioCount > 0
                ? `${filledAudioCount} dari ${CALL_AUDIO_SLOTS.length} suara ekspresi siap`
                : "Buat suara pembuka, mikir, & tiap ekspresi langsung dari Gemini"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-[11.5px] font-medium text-ink-soft">
            {showAudioPack
              ? "Tutup"
              : filledAudioCount > 0
                ? `${filledAudioCount}/${CALL_AUDIO_SLOTS.length}`
                : "Atur"}
          </span>
        </button>

        {showAudioPack && (
          <div className="space-y-2 border-t border-line px-2.5 py-2.5">
            <p className="px-0.5 text-[11.5px] leading-snug text-muted">
              Memakai pengaturan Suara HD Gemini dari halaman <strong>Suara</strong>.
              Ubah kata bila perlu, ketuk <strong>Buat</strong> per ekspresi, dan ketuk{" "}
              <strong>Ulang</strong> kapan saja bila ingin intonasi yang lebih natural.
            </p>

            {CALL_AUDIO_SLOTS.map((slot) => {
              const preset = DEFAULT_CALL_AUDIO_PACK[slot];
              const entry = media?.callAudios?.[slot];
              const hasAsset = Boolean(entry?.key);
              const isGenBusy = busy === `gen:${slot}`;
              const isUploadBusy = busy === `audio:${slot}`;
              const rowBusy = isGenBusy || isUploadBusy;
              const isPreviewing = playingSlot === slot;

              return (
                <div
                  key={slot}
                  className="rounded-xl border border-line bg-surface-2/40 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink">{preset.label}</p>
                      <p className="truncate text-[11px] text-muted">
                        {isGenBusy
                          ? "Membuat suara Gemini…"
                          : isUploadBusy
                            ? "Mengunggah audio…"
                            : preset.hint}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {hasAsset && entry?.key && (
                        <button
                          type="button"
                          onClick={() => playPreviewKey(slot, entry.key)}
                          disabled={busy !== null}
                          aria-label={`Putar pratinjau ${preset.label}`}
                          title="Dengarkan hasil suara"
                          className={`grid h-7 w-7 place-items-center rounded-full border transition disabled:opacity-45 ${
                            isPreviewing
                              ? "border-ink bg-ink text-surface"
                              : "border-line bg-surface text-ink-soft hover:text-ink"
                          }`}
                        >
                          <PlayIcon className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleGenerateSlotAudio(slot)}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink transition hover:bg-surface-2 active:scale-95 disabled:opacity-45"
                      >
                        <RefreshIcon
                          className={`h-3 w-3 ${isGenBusy ? "animate-spin" : ""}`}
                        />
                        {hasAsset ? "Ulang" : "Buat"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          pendingAudioSlotRef.current = slot;
                          reactionAudioRef.current?.click();
                        }}
                        disabled={busy !== null}
                        title="Unggah file audio manual"
                        aria-label={`Unggah file manual untuk ${preset.label}`}
                        className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-ink-soft transition hover:text-ink disabled:opacity-45"
                      >
                        <SpeakerIcon className="h-3.5 w-3.5" />
                      </button>

                      {hasAsset && !rowBusy && (
                        <button
                          type="button"
                          onClick={() => dropReactionAudio(slot)}
                          title="Hapus asset ini"
                          aria-label={`Hapus ${preset.label}`}
                          className="grid h-7 w-7 place-items-center rounded-full text-ink-soft transition hover:text-rose-500 disabled:opacity-45"
                          disabled={busy !== null}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <input
                    type="text"
                    value={scriptValueFor(slot)}
                    onChange={(e) =>
                      setScriptDrafts((prev) => ({
                        ...prev,
                        [slot]: e.target.value,
                      }))
                    }
                    maxLength={140}
                    placeholder={preset.defaultText}
                    aria-label={`Naskah kata ${preset.label}`}
                    className="mt-1.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] text-ink placeholder:text-muted"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MediaRow
        label="Suara telepon (cadangan)"
        hint={
          media?.callAudioKey
            ? (media.callAudioName ?? "Rekaman suara aktif.")
            : "Rekaman MP3/WAV cadangan bila pembuka kosong."
        }
        active={Boolean(media?.callAudioKey)}
        icon={<SpeakerIcon className="h-4 w-4" />}
        busy={busy === "callAudio"}
        disabled={busy !== null}
        onPick={() => callAudioRef.current?.click()}
        onRemove={dropAudio}
      />

      <p className="text-[12px] leading-snug text-muted">
        Opsional — tersimpan di akunmu dan ikut ke semua perangkat.
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
        ref={reactionAudioRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/mp4,audio/aac,audio/ogg,audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const slot = pendingAudioSlotRef.current;
          if (file && slot) void pickReactionAudio(slot, file);
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
      <audio ref={previewAudioRef} preload="auto" playsInline className="hidden" />
    </div>
  );
}
