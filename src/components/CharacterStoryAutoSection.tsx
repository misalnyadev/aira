"use client";

import { useState } from "react";
import type { CharacterStoryFrequency } from "@/lib/characterStoryAuto";
import { FilmIcon } from "./icons";

type StoryAutoSettings = {
  enabled: boolean;
  frequency: CharacterStoryFrequency;
};

export function CharacterStoryAutoSection({
  characterId,
  characterName,
  enabled,
  frequency,
  hasProvider,
  onChange,
}: {
  characterId: string;
  characterName: string;
  enabled: boolean;
  frequency: CharacterStoryFrequency;
  hasProvider: boolean;
  onChange: (next: StoryAutoSettings) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(next: StoryAutoSettings) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    onChange(next);

    try {
      const res = await fetch(`/api/characters/${characterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyAutoEnabled: next.enabled,
          storyAutoFrequency: next.frequency,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Gagal menyimpan pengaturan Story otomatis.");
      setSaved(true);
    } catch (err) {
      onChange({ enabled, frequency });
      setError(err instanceof Error ? err.message : "Gagal menyimpan pengaturan Story otomatis.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#4687fe]/30 dark:border-[#d5b767]/35 bg-[#4687fe]/10 dark:bg-[#d5b767]/10 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FilmIcon className="h-4 w-4 shrink-0 text-ink-soft" />
            <h4 className="text-sm font-semibold text-[#205ac4] dark:text-[#e8cf75]">StoryTalent Otomatis</h4>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Story teks dipublikasikan sekitar pukul 18.00 WIB, mengikuti kepribadian dan Bible {characterName}.
            Tidak memakai riwayat chat, profilmu, atau Ingatan Jangka Panjang.
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Saat aktif, Story langsung terlihat di StoryTalent dan memakai provider serta kuota API karakter.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Aktifkan StoryTalent otomatis untuk ${characterName}`}
          disabled={busy}
          onClick={() => void save({ enabled: !enabled, frequency })}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled ? "bg-brand" : "bg-line"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full shadow transition ${
              enabled ? "translate-x-5 bg-brand-ink" : "translate-x-0.5 bg-white"
            }`}
          />
        </button>
      </div>

      {enabled ? (
        <label className="mt-3 flex items-center justify-between gap-3 border-t border-[#4687fe]/30 dark:border-[#d5b767]/35 pt-3 text-xs text-ink-soft">
          <span>Frekuensi</span>
          <select
            value={frequency}
            disabled={busy}
            onChange={(event) =>
              void save({
                enabled,
                frequency: event.target.value as CharacterStoryFrequency,
              })
            }
            className="rounded-xl border border-[#4687fe]/30 dark:border-[#d5b767]/35 bg-surface px-3 py-2 text-xs font-medium text-ink outline-none focus:border-brand disabled:opacity-60"
          >
            <option value="every_other_day">Setiap 2 hari (disarankan)</option>
            <option value="daily">Setiap hari</option>
          </select>
        </label>
      ) : null}

      {!hasProvider ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Siapkan provider AI di Setelan agar Story otomatis bisa terbit.
        </p>
      ) : null}
      {busy ? <p className="mt-2 text-xs text-muted">Menyimpan pengaturan...</p> : null}
      {saved ? <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">Pengaturan tersimpan.</p> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}
    </section>
  );
}
