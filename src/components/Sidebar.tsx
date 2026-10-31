"use client";

import { useMemo, useState } from "react";
import type { CharacterSummary } from "@/types/chat";
import type { UserProfile } from "@/lib/userProfile";
import { Avatar } from "./Avatar";
import { ThemeQuickToggle } from "./ThemeToggle";
import { PlusIcon, SearchIcon, XIcon } from "./icons";

function formatListTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return "Sekarang";
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

export function Sidebar({
  characters,
  activeId,
  profile,
  onSelect,
  onNewCharacter,
  onOpenSettings,
  onOpenProfile,
  hasProviders,
  limit,
}: {
  characters: CharacterSummary[];
  activeId: string | null;
  profile: UserProfile;
  onSelect: (id: string) => void;
  onNewCharacter: () => void;
  onOpenSettings: () => void;
  onOpenProfile: () => void;
  hasProviders: boolean;
  limit: number;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.shortBio.toLowerCase().includes(q) ||
        c.preview.toLowerCase().includes(q)
    );
  }, [characters, query]);

  const full = characters.length >= limit;
  const userName = profile.displayName || profile.nickname || "Kamu";

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-line bg-surface md:w-[348px] lg:w-[380px]">
      {/* Header */}
      <div className="top-bar flex items-center justify-between gap-2 px-4 pb-3 pt-[max(0.75rem,var(--safe-top))]">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={onOpenProfile}
            aria-label="Profil saya"
            className="shrink-0 rounded-full transition active:scale-95 md:hidden"
          >
            <Avatar name={userName} src={profile.avatarUrl} size={34} />
          </button>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="truncate font-display text-lg font-extrabold tracking-tight text-ink">
                Aisherly<span className="text-muted">.</span>
              </h1>
              <span
                className={`text-[11px] font-medium ${full ? "text-rose-500" : "text-muted"}`}
                title={`Maksimal ${limit} karakter`}
              >
                {characters.length}/{limit}
              </span>
            </div>
            {(profile.nickname || profile.displayName) && (
              <p className="truncate text-[11px] text-ink-soft md:hidden">
                hai, {profile.nickname || profile.displayName}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <ThemeQuickToggle className="md:hidden" />
          <button
            onClick={onNewCharacter}
            disabled={full}
            className="rounded-full bg-brand p-2 text-brand-ink transition hover:bg-brand-strong active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            title={full ? `Maksimal ${limit} karakter` : "Buat karakter baru"}
            aria-label="Buat karakter baru"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Pencarian */}
      <div className="px-3 pb-2.5 pt-2.5">
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-transparent transition focus-within:bg-surface focus-within:ring-ink/25">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari chat atau karakter..."
            className="w-full bg-transparent text-base text-ink outline-none placeholder:text-muted sm:text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Bersihkan pencarian"
              className="rounded-full p-0.5 text-muted hover:text-ink"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Pengingat API key */}
      {!hasProviders && (
        <button
          onClick={onOpenSettings}
          className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-left text-xs text-amber-800 transition hover:bg-amber-500/15 dark:text-amber-200"
        >
          <span>
            <strong className="font-semibold">Belum ada API key.</strong> Ketuk untuk menambahkan
            Gemini, Grok, atau OpenRouter.
          </span>
          <span className="shrink-0 font-semibold">Atur →</span>
        </button>
      )}

      {/* Daftar chat */}
      <div className="flex-1 overflow-y-auto px-2 pb-[calc(var(--tabbar-space)+0.5rem)] md:pb-2">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">
            {characters.length === 0
              ? "Belum ada karakter. Ketuk + untuk membuat karakter pertamamu."
              : "Tidak ada yang cocok dengan pencarianmu."}
          </div>
        ) : (
          filtered.map((c) => {
            const active = activeId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`group mb-0.5 flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition active:scale-[0.99] ${
                  active ? "bg-ink/[0.06] dark:bg-white/[0.08]" : "hover:bg-surface-2"
                }`}
              >
                <Avatar name={c.name} src={c.avatarUrl} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-ink">
                      {c.name}
                      {c.hasBible && (
                        <span className="ml-1 text-[11px]" title="Memakai bible peran">
                          📖
                        </span>
                      )}
                    </p>
                    <span className="shrink-0 text-[11px] text-muted">
                      {formatListTime(c.updatedAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-soft">
                    {c.preview || c.shortBio || "Mulai obrolan baru"}
                  </p>
                </div>
              </button>
            );
          })
        )}

        {full && (
          <p className="px-4 py-3 text-center text-[11px] text-muted">
            Batas {limit} karakter tercapai. Hapus salah satu untuk menambah yang baru.
          </p>
        )}
      </div>
    </aside>
  );
}
