"use client";

import { useEffect, useState } from "react";
import { useTheme, type ThemeChoice } from "@/lib/theme";
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
 * Pemilih 3-opsi (Terang / Gelap / Sistem) untuk halaman Setelan.
 */
export function ThemeSegmented() {
  const { choice, setTheme } = useTheme();

  const options: { value: ThemeChoice; label: string; Icon: typeof SunIcon }[] = [
    { value: "light", label: "Terang", Icon: SunIcon },
    { value: "dark", label: "Gelap", Icon: MoonIcon },
    { value: "system", label: "Sistem", Icon: MonitorIcon },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Tema tampilan"
      className="grid grid-cols-3 gap-1.5 rounded-xl bg-surface-2 p-1"
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
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
