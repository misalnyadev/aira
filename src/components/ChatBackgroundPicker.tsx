"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { compressImageFile } from "@/lib/compressImage";
import {
  CHAT_ANIMATED_PRESETS,
  CHAT_COLOR_PRESETS,
  animatedSwatch,
  getAnimatedPreset,
  getPreset,
  presetSwatch,
  type ChatBackground,
} from "@/lib/chatBackground";
import { getIsDarkSnapshot, subscribeTheme } from "@/lib/theme";
import { CameraIcon } from "./icons";

const ring = "border-ink ring-2 ring-ink/25";
const idle = "border-line hover:border-ink/40";

type AccountPickerProps = {
  allowInherit?: false;
  value: ChatBackground;
  onChange: (next: ChatBackground) => void;
  disabled?: boolean;
};

type CharacterPickerProps = {
  allowInherit: true;
  value: ChatBackground | null;
  onChange: (next: ChatBackground | null) => void;
  disabled?: boolean;
};

/**
 * Pemilih latar area chat: bawaan, warna, gambar sendiri, atau animasi.
 *
 * Di Profil Karakter (`allowInherit`), `value === null` berarti mengikuti
 * latar bawaan akun dari Setelan.
 */
export function ChatBackgroundPicker(props: AccountPickerProps | CharacterPickerProps) {
  const { disabled = false } = props;
  const imageRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Nilai sementara penggeser peredupan — baru disimpan saat jari dilepas. */
  const [dimDraft, setDimDraft] = useState<number | null>(null);
  const isDark = useSyncExternalStore(subscribeTheme, getIsDarkSnapshot, () => false);

  const inherited = props.allowInherit && props.value === null;
  const current: ChatBackground = props.value ?? { kind: "default" };
  const isImage = !inherited && current.kind === "image";
  const dimPercent =
    dimDraft ?? Math.round((current.kind === "image" ? current.dim : 0.25) * 100);

  function selectBackground(next: ChatBackground) {
    if (props.allowInherit) {
      props.onChange(next);
    } else {
      props.onChange(next);
    }
  }

  async function handleImage(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Pilih berkas gambar.");
      return;
    }
    setBusy(true);
    try {
      const compressed = await compressImageFile(file, { maxSize: 1600, quality: 0.75 });
      const body = new FormData();
      body.append("file", compressed);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal mengunggah gambar.");
      setDimDraft(null);
      selectBackground({ kind: "image", imageUrl: data.url, dim: 0.25 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memakai gambar itu.");
    } finally {
      setBusy(false);
      if (imageRef.current) imageRef.current.value = "";
    }
  }

  function commitDim(percent: number) {
    if (current.kind !== "image") return;
    setDimDraft(null);
    selectBackground({ kind: "image", imageUrl: current.imageUrl, dim: percent / 100 });
  }

  return (
    <div className={`space-y-3 ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      <div>
        <p className="mb-1.5 text-[12px] font-medium text-muted">Warna &amp; gambar</p>
        <div className="flex flex-wrap items-center gap-2">
          {props.allowInherit && (
            <button
              type="button"
              onClick={() => props.onChange(null)}
              title="Ikut setelan"
              aria-pressed={inherited}
              className={`flex h-10 items-center rounded-full border px-3 text-xs font-medium transition ${
                inherited ? `${ring} text-ink` : `${idle} bg-surface-2 text-ink-soft`
              }`}
            >
              Ikut setelan
            </button>
          )}

          <button
            type="button"
            onClick={() => selectBackground({ kind: "default" })}
            aria-pressed={!inherited && current.kind === "default"}
            title="Bawaan"
            className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-full border transition ${
              !inherited && current.kind === "default" ? ring : idle
            }`}
            style={{
              backgroundColor: isDark ? "#0b0b0d" : "#f7f8fa",
              backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
              backgroundSize: "7px 7px",
              color: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.14)",
            }}
          >
            <span className="sr-only">Latar bawaan</span>
          </button>

          {CHAT_COLOR_PRESETS.map((preset) => {
            const active = !inherited && current.kind === "preset" && current.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => selectBackground({ kind: "preset", id: preset.id })}
                aria-pressed={active}
                title={preset.label}
                className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-full border transition ${
                  active ? ring : idle
                }`}
                style={{ backgroundImage: presetSwatch(preset) }}
              >
                <span className="sr-only">{preset.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => imageRef.current?.click()}
            disabled={busy}
            title="Pilih gambar"
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border transition disabled:opacity-50 ${
              isImage ? ring : `${idle} bg-surface-2 text-ink-soft hover:text-ink`
            }`}
            style={
              isImage && current.kind === "image"
                ? {
                    backgroundImage: `url("${current.imageUrl}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          >
            {!isImage && <CameraIcon className="h-4 w-4" />}
            <span className="sr-only">Pilih gambar latar</span>
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[12px] font-medium text-muted">Animasi</p>
        <div className="flex flex-wrap items-center gap-2">
          {CHAT_ANIMATED_PRESETS.map((preset) => {
            const active = !inherited && current.kind === "animated" && current.id === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => selectBackground({ kind: "animated", id: preset.id })}
                aria-pressed={active}
                title={`${preset.label} · ${preset.hint}`}
                className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-full border transition ${
                  active ? ring : idle
                }`}
                style={{ backgroundImage: animatedSwatch(preset, isDark) }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0 grid place-items-center text-[11px] font-bold text-ink-soft"
                >
                  ▶
                </span>
                <span className="sr-only">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImage(file);
        }}
      />

      {busy && <p className="text-xs text-muted">Memproses gambar...</p>}
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      {isImage && (
        <div className="rounded-xl border border-line px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-soft">Redup gambar · {dimPercent}%</span>
            <button
              type="button"
              onClick={() =>
                props.allowInherit ? props.onChange(null) : props.onChange({ kind: "default" })
              }
              className="text-xs font-medium text-ink-soft transition hover:text-ink"
            >
              Hapus gambar
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={70}
            step={5}
            value={dimPercent}
            onChange={(e) => setDimDraft(Number(e.target.value))}
            onPointerUp={(e) => commitDim(Number(e.currentTarget.value))}
            onTouchEnd={(e) => commitDim(Number(e.currentTarget.value))}
            onKeyUp={(e) => commitDim(Number(e.currentTarget.value))}
            onBlur={(e) => commitDim(Number(e.currentTarget.value))}
            aria-label="Tingkat peredupan gambar"
            className="mt-2 w-full accent-ink"
          />
        </div>
      )}

      {!inherited && current.kind === "preset" && (
        <p className="text-xs text-muted">{getPreset(current.id).label}</p>
      )}

      {!inherited && current.kind === "animated" && (
        <p className="text-xs text-muted">
          {getAnimatedPreset(current.id).label} · {getAnimatedPreset(current.id).hint}
        </p>
      )}
    </div>
  );
}
