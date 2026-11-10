"use client";

import { useMemo, useState } from "react";
import type { CharacterSummary } from "@/types/chat";
import type { UserProfile } from "@/lib/userProfile";
import { Avatar } from "./Avatar";
import { MenuHeader, MenuHeaderIconButton } from "./MenuHeader";
import { BibleOutlineIcon, MemoryOutlineIcon, PlusIcon, SearchIcon, WebOutlineIcon, XIcon } from "./icons";

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
  onAddContact,
  onOpenSettings,
  hasProviders,
  pendingContactsCount = 0,
  contactUpdates,
  onOpenUpdate,
}: {
  characters: CharacterSummary[];
  activeId: string | null;
  profile: UserProfile;
  onSelect: (id: string) => void;
  onAddContact: () => void;
  onOpenSettings: () => void;
  hasProviders: boolean;
  pendingContactsCount?: number;
  contactUpdates: Record<string, { storyId?: string; reelId?: string }>;
  onOpenUpdate: (id: string) => void;
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

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-r border-line bg-app md:w-[348px] lg:w-[380px]">
      {/* Header */}
      <MenuHeader
        title="HeyTalent"
        description={`${characters.length} kontak${
          profile.nickname || profile.displayName
            ? ` · hai, ${profile.nickname || profile.displayName}`
            : ""
        }`}
        actions={
          <>
            <MenuHeaderIconButton
              onClick={onAddContact}
              className="translate-x-px"
              title="Tambah & kelola kontak karakter (PIN)"
              aria-label="Tambah & kelola kontak karakter"
            >
              <PlusIcon className="h-5 w-5" />
              {pendingContactsCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[9.5px] font-extrabold text-white">
                  {pendingContactsCount > 9 ? "9+" : pendingContactsCount}
                </span>
              )}
            </MenuHeaderIconButton>
          </>
        }
      />

      {/* Pencarian */}
      <div className="px-3 pb-2.5 pt-2.5">
        <div className="flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 ring-1 ring-transparent transition focus-within:bg-surface focus-within:ring-ink/25 dark:bg-surface-2 dark:focus-within:bg-surface">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari chat atau karakter..."
            className="w-full bg-transparent text-base text-copy outline-none placeholder:text-muted sm:text-sm"
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
            Gemini, Groq, atau OpenRouter.
          </span>
          <span className="shrink-0 font-semibold">Atur →</span>
        </button>
      )}

      {/* Daftar chat */}
      <div className="flex-1 divide-y divide-accent/25 dark:divide-accent/30 overflow-y-auto px-2 pb-[calc(var(--tabbar-space)+0.5rem)] md:pb-2">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">
            {characters.length === 0
              ? "Belum ada kontak obrolan. Ketuk + untuk menambah kontak lewat PIN, atau buka menu Karakter."
              : "Tidak ada yang cocok dengan pencarianmu."}
          </div>
        ) : (
          filtered.map((c) => {
            const active = activeId === c.id;
            const update = c.threadKind === "guest_contact" && c.sourceCharacterId ? contactUpdates[c.sourceCharacterId] : undefined;
            const label = update?.storyId && update?.reelId ? "Story dan Reel baru" : update?.storyId ? "Story baru" : update?.reelId ? "Reel baru" : null;
            const ring = update?.storyId && update?.reelId ? "bg-gradient-to-tr from-[#4687fe] via-white to-[#4687fe] dark:from-[#d5b767] dark:via-white dark:to-[#d5b767] ring-1 ring-[#4687fe]/60 dark:ring-[#d5b767]/60" : update?.storyId ? "bg-[#4687fe] dark:bg-[#d5b767]" : "bg-white ring-1 ring-[#4687fe] dark:ring-[#d5b767]";
            return (
              <div
                key={c.id}
                className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition active:scale-[0.99] ${
                  active ? "bg-accent/10 dark:bg-white/[0.08]" : "hover:bg-accent/10 dark:hover:bg-surface-2"
                }`}
              >
                {label && update ? <button type="button" onClick={() => onOpenUpdate(update.storyId || update.reelId!)} aria-label={`${label} dari ${c.name}`} title={label} className={`shrink-0 rounded-full p-[3px] ${ring}`}><span className="block rounded-full bg-surface p-[2px]"><Avatar name={c.name} src={c.avatarUrl} size={42} /></span></button> : <button type="button" onClick={() => onSelect(c.id)} aria-label={`Buka chat ${c.name}`} className="shrink-0 p-[5px]"><Avatar name={c.name} src={c.avatarUrl} size={42} /></button>}
                <button type="button" onClick={() => onSelect(c.id)} className="min-w-0 flex-1 text-left" aria-label={`Buka chat ${c.name}`}>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-accent-text">
                      {c.name}
                      {c.threadKind === "guest_contact" && (
                        <span className="ml-1.5 inline-block rounded-full bg-accent/10 dark:bg-surface-2 px-1.5 py-0.2 text-[10px] font-semibold text-ink-soft ring-1 ring-line">
                          Kontak
                        </span>
                      )}
                      {c.threadKind === "owner_contact" && (
                        <span className="ml-1.5 inline-block rounded-full bg-accent/15 dark:bg-accent/15 px-1.5 py-0.2 text-[10px] font-semibold text-accent-text">
                          2 Arah
                        </span>
                      )}
                      {c.hasBible && (
                        <span role="img" aria-label="Memakai bible peran" className="ml-1 inline-flex align-middle text-ink" title="Memakai bible peran">
                          <BibleOutlineIcon className="h-4 w-4" />
                        </span>
                      )}
                      {c.memoryEnabled && (
                        <span
                          role="img"
                          aria-label="Ingatan jangka panjang dan sadar waktu aktif"
                          className="ml-1 inline-flex align-middle text-[#956b17] dark:text-[#e8cf75]"
                          title="Ingatan jangka panjang & sadar waktu aktif"
                        >
                          <MemoryOutlineIcon className="h-4 w-4" />
                        </span>
                      )}
                      {c.browsingEnabled && (
                        <span
                          role="img"
                          aria-label="Browsing internet dan baca link aktif"
                          className="ml-1 inline-flex align-middle text-[#205ac4] dark:text-[#79aaff]"
                          title="Browsing internet & baca link aktif"
                        >
                          <WebOutlineIcon className="h-4 w-4" />
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
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
