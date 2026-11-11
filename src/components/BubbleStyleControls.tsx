"use client";

import { useState, useSyncExternalStore } from "react";
import { getIsDarkSnapshot, subscribeTheme } from "@/lib/theme";
import { chatBackgroundProps, type ChatBackground } from "@/lib/chatBackground";
import {
  DEFAULT_BUBBLE_STYLE,
  bubbleInk,
  bubblePaint,
  isDefaultBubbleStyle,
  colorLuminance,
  type BubbleRole,
  type BubbleStyle,
} from "@/lib/bubbleStyle";
import { Switch } from "./Switch";

/**
 * Pilihan warna siap pakai selain pemilih warna bebas.
 * `null` = ikut tema terang/gelap yang sedang aktif.
 */
const COLORS: { value: string | null; label: string; hex: string | null }[] = [
  { value: null, label: "Ikut tema", hex: null },
  { value: "#ffffff", label: "Putih", hex: "#ffffff" },
  { value: "#101114", label: "Hitam", hex: "#101114" },
  { value: "#f6e7c1", label: "Krem", hex: "#f6e7c1" },
  { value: "#0f172a", label: "Malam", hex: "#0f172a" },
  { value: "#1f3d2f", label: "Hijau", hex: "#1f3d2f" },
];

/** Satu baris chip warna: label kecil di kiri, bulatan warna di kanan. */
function ColorRow({
  label,
  value,
  onChange,
  fallback,
}: {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
  fallback: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-11 shrink-0 text-[12px] text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {COLORS.map((c) => {
          const active = (value ?? null) === c.value;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => onChange(c.value)}
              aria-label={`${label}: ${c.label}`}
              aria-pressed={active}
              title={c.label}
              className={`grid h-8 w-8 place-items-center rounded-full transition ${
                active ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : "ring-1 ring-accent/30 dark:ring-accent/35"
              }`}
              style={
                c.hex
                  ? { backgroundColor: c.hex }
                  : {
                      backgroundImage:
                        "repeating-linear-gradient(45deg, transparent, transparent 3px, var(--line) 3px, var(--line) 5px)",
                    }
              }
            />
          );
        })}
        <input type="color" value={value ?? fallback} onChange={(event) => onChange(event.target.value)}
          aria-label={`${label}: pilih warna bebas`} className="h-8 w-8 cursor-pointer rounded-full border border-line"
          style={{ backgroundColor: value ?? fallback }} />
      </div>
    </div>
  );
}

/** Satu sisi gelembung: warna teks + warna latar. */
function SideColors({
  title,
  style,
  role,
  onPick,
  isDark,
}: {
  title: string;
  style: BubbleStyle;
  role: BubbleRole;
  onPick: (patch: Partial<BubbleStyle>) => void;
  isDark: boolean;
}) {
  const text = role === "in" ? style.textColorIn : style.textColorOut;
  const bg = role === "in" ? style.bgColorIn : style.bgColorOut;
  const textKey = role === "in" ? "textColorIn" : "textColorOut";
  const bgKey = role === "in" ? "bgColorIn" : "bgColorOut";

  const contrast = text && bg
    ? (Math.max(colorLuminance(text), colorLuminance(bg)) + 0.05) / (Math.min(colorLuminance(text), colorLuminance(bg)) + 0.05)
    : null;

  return (
    <div className="space-y-2">
      <span className="block text-[12px] font-semibold text-ink">{title}</span>
      <ColorRow label="Teks" value={text ?? null} fallback={isDark ? "#fafafa" : "#0a0a0a"} onChange={(next) => onPick({ [textKey]: next })} />
      <ColorRow label="Latar" value={bg ?? null} fallback={role === "in" ? (isDark ? "#171717" : "#ffffff") : (isDark ? "#262626" : "#e4e4e7")} onChange={(next) => onPick({ [bgKey]: next })} />
      {contrast !== null && contrast < 4.5 && <p role="status" className="text-xs text-amber-900 dark:text-amber-200">Kontras teks dan gelembung rendah; coba warna yang lebih berbeda.</p>}
    </div>
  );
}

type BubbleStyleControlsProps = {
  mode?: "chat" | "meetup";
  value: BubbleStyle;
  onChange: (next: BubbleStyle) => void;
  disabled?: boolean;
  background?: ChatBackground;
};

/** Pengaturan gaya gelembung untuk Chat atau Tatap Muka milik satu karakter. */
export function BubbleStyleControls(props: BubbleStyleControlsProps) {
  const { disabled = false, mode = "chat" } = props;
  const style = props.value;
  const isDark = useSyncExternalStore(subscribeTheme, getIsDarkSnapshot, () => false);
  const [colorDraft, setColorDraft] = useState<Partial<BubbleStyle>>({});
  const hasColorDraft = Object.keys(colorDraft).length > 0;

  /** Kepekatan sementara saat jari masih di slider; disimpan ketika dilepas. */
  const [opacityDraft, setOpacityDraft] = useState<number | null>(null);
  const opacity = opacityDraft ?? style.opacity;
  const previewStyle: BubbleStyle = { ...style, ...colorDraft, opacity };
  const previewBackground = props.background?.kind === "color" || props.background?.kind === "preset"
    ? chatBackgroundProps(props.background, isDark).style : undefined;

  function emit(next: BubbleStyle) {
    props.onChange(next);
  }

  function update(patch: Partial<BubbleStyle>) {
    emit({ ...style, ...patch });
  }

  function commitOpacity(raw: number) {
    setOpacityDraft(null);
    update({ opacity: raw });
  }

  const canReset = !isDefaultBubbleStyle(style);

  return (
    <div className={`space-y-3 ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      <div className="space-y-2.5 rounded-xl border border-accent/30 dark:border-accent/35 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-xs font-medium text-ink">
              Header & kolom ketik transparan
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-muted">
              Tanpa kotak bar atas/bawah — menyatu transparan dengan latar chat
            </span>
          </div>
          <Switch
            checked={Boolean(style.minimalBars)}
            onChange={(next) => update({ minimalBars: next })}
            label="Header & kolom ketik transparan"
            disabled={disabled}
          />
        </div>

        {mode === "meetup" && (
          <>
            <div className="border-t border-accent/30 dark:border-accent/35" />
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-xs font-medium text-ink">
                  Sembunyikan tulisan di Tatap Muka
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                  Sembunyikan gelembung agar video/ekspresi terlihat.
                </span>
              </div>
              <Switch
                checked={Boolean(style.hideMessages)}
                onChange={(next) => update({ hideMessages: next })}
                label="Sembunyikan tulisan di Tatap Muka"
                disabled={disabled}
              />
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl border border-accent/30 dark:border-accent/35 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-ink">Tembus pandang</span>
          <div className="flex items-center gap-2">
            {style.glass && <span className="text-xs font-semibold text-ink-soft">{opacity}%</span>}
            <Switch
              checked={Boolean(style.glass)}
              onChange={(next) => update({ glass: next })}
              label="Tembus pandang"
              disabled={disabled}
            />
          </div>
        </div>
        {style.glass && (
          <input
            type="range"
            min={20}
            max={95}
            step={5}
            value={opacity}
            onChange={(e) => setOpacityDraft(Number(e.target.value))}
            onPointerUp={(e) => commitOpacity(Number(e.currentTarget.value))}
            onTouchEnd={(e) => commitOpacity(Number(e.currentTarget.value))}
            onKeyUp={(e) => commitOpacity(Number(e.currentTarget.value))}
            onBlur={(e) => commitOpacity(Number(e.currentTarget.value))}
            aria-label="Kepekatan gelembung pesan"
            className="mt-2 w-full accent-ink"
          />
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-accent/30 dark:border-accent/35 px-3 py-2.5">
        <SideColors title="Gelembung karakter" style={previewStyle} role="in" isDark={isDark} onPick={(patch) => setColorDraft((draft) => ({ ...draft, ...patch }))} />
        <div className="border-t border-accent/30 dark:border-accent/35" />
        <SideColors title="Gelembung kamu" style={previewStyle} role="out" isDark={isDark} onPick={(patch) => setColorDraft((draft) => ({ ...draft, ...patch }))} />
      </div>

      <div className="flex flex-col gap-1.5 rounded-xl border border-accent/30 dark:border-accent/35 px-3 py-2.5" style={previewBackground}>
        {mode === "meetup" && style.hideMessages ? (
          <p className="py-2 text-center text-xs text-muted">
            Di Tatap Muka, tulisan disembunyikan agar video/ekspresi terlihat.
          </p>
        ) : (
          <>
            <span
              className="max-w-[85%] self-start rounded-2xl rounded-bl-sm bg-bubble-in px-3 py-1.5 text-sm text-bubble-in-ink shadow-xs"
              style={{ ...bubblePaint(previewStyle, "in"), ...bubbleInk(previewStyle, "in") }}
            >
              Pesan dari karakter
            </span>
            <span
              className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-bubble-out px-3 py-1.5 text-sm text-bubble-out-ink shadow-xs"
              style={{ ...bubblePaint(previewStyle, "out"), ...bubbleInk(previewStyle, "out") }}
            >
              Pesan dari kamu
            </span>
          </>
        )}
      </div>

      <p className="text-xs text-muted">Pratinjau langsung di atas. Pada gelembung transparan, keterbacaan juga bergantung pada latar percakapan.</p>
      {hasColorDraft && <button type="button" onClick={() => { update(colorDraft); setColorDraft({}); }} className="text-xs font-semibold text-accent-text underline">Terapkan warna gelembung</button>}

      {canReset && (
        <button
          type="button"
          onClick={() => { setColorDraft({}); props.onChange(DEFAULT_BUBBLE_STYLE); }}
          className="w-full rounded-lg border border-accent/30 dark:border-accent/35 py-2 text-xs font-semibold text-ink-soft transition hover:bg-accent/10 hover:text-ink"
        >
          Kembalikan ke bawaan
        </button>
      )}
    </div>
  );
}
