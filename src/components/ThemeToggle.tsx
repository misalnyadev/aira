"use client";

import { useEffect, useState } from "react";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { customTextContrast } from "@/lib/customTheme";
import { MonitorIcon, MoonIcon, SunIcon } from "./icons";

/**
 * Tombol satu-klik untuk berpindah cepat antara mode terang & gelap.
 */
export function ThemeQuickToggle({ className = "" }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const isDark = mounted && resolved === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      title={isDark ? "Mode terang" : "Mode gelap"}
      className={`rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink active:scale-95 ${className}`}
    >
      {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
}

/**
 * Pemilih tema aplikasi untuk halaman Setelan.
 */
export function ThemeSegmented() {
  const { choice, setTheme, customTheme, setCustomTheme } = useTheme();

  const options: { value: ThemeChoice; label: string; Icon: typeof SunIcon }[] = [
    { value: "light", label: "Terang", Icon: SunIcon },
    { value: "dark", label: "Gelap", Icon: MoonIcon },
    { value: "system", label: "Sistem", Icon: MonitorIcon },
    { value: "custom", label: "Kustom", Icon: SunIcon },
  ];

  return (
    <div className="space-y-3">
    <div
      role="radiogroup"
      aria-label="Tema tampilan"
      className="grid grid-cols-2 gap-1.5 rounded-xl sm:grid-cols-4 bg-accent/10 p-1 dark:bg-accent/10"
    >
      {options.map(({ value, label, Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
              active
                ? "bg-surface text-accent-text shadow-sm ring-1 ring-accent/40 dark:text-accent-text dark:ring-accent/45"
                : "text-accent-text hover:bg-accent/10 dark:text-accent-text dark:hover:bg-accent/10"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
    {choice === "custom" && (
      <div className="space-y-3 rounded-xl border border-accent/30 p-3 dark:border-accent/35">
        <fieldset>
          <legend className="text-xs font-semibold text-ink">Dasar tampilan</legend>
          <div className="mt-2 flex gap-2">
            {(["light", "dark"] as const).map((base) => (
              <button key={base} type="button" aria-pressed={customTheme.base === base}
                onClick={() => setCustomTheme({ ...customTheme, base })}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${customTheme.base === base ? "border-brand bg-brand text-brand-ink" : "border-line text-ink"}`}>
                {base === "light" ? "Terang" : "Gelap"}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center justify-between gap-3 text-xs font-semibold text-ink">
          Warna aksen
          <input type="color" value={customTheme.accent} onChange={(event) => setCustomTheme({ ...customTheme, accent: event.target.value })} aria-label="Pilih warna aksen" className="h-9 w-12 cursor-pointer rounded border border-line bg-surface p-1" />
        </label>
        <div className="space-y-2">
          <label className="flex items-center justify-between gap-3 text-xs font-semibold text-ink">
            Warna teks utama
            <input type="color" value={customTheme.textColor ?? (customTheme.base === "light" ? "#0a0a0a" : "#fafafa")} onChange={(event) => setCustomTheme({ ...customTheme, textColor: event.target.value })} aria-label="Pilih warna teks utama" className="h-9 w-12 cursor-pointer rounded border border-line bg-surface p-1" />
          </label>
          {customTheme.textColor && (
            <button type="button" onClick={() => { const { textColor: _textColor, ...rest } = customTheme; setCustomTheme(rest); }} className="text-xs font-semibold text-accent-text underline">Gunakan warna teks bawaan</button>
          )}
          {customTheme.textColor && customTextContrast(customTheme.textColor, customTheme.base) < 4.5 && (
            <p role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">Kontras teks kurang pada latar utama. Coba warna yang lebih {customTheme.base === "light" ? "gelap" : "terang"} agar lebih mudah dibaca.</p>
          )}
        </div>
        <p className="text-xs text-ink-soft">Warna aksen dan teks berlaku pada bagian yang sudah mendukung tema Kustom; beberapa teks, ikon, dan gelembung chat masih memakai warna bawaan. Pilihan tersimpan di perangkat ini.</p>
      </div>
    )}
    </div>
  );
}
