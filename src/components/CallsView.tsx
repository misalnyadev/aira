"use client";

import { useMemo, useState } from "react";
import type { CharacterSummary } from "@/types/chat";
import { Avatar } from "./Avatar";
import { MenuHeader, MenuHeaderIconButton } from "./MenuHeader";
import { PlusIcon, RefreshIcon, SearchIcon, XIcon } from "./icons";

function formatListTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const difference = now.getTime() - date.getTime();
  if (difference < 60_000) return "Sekarang";
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Kemarin";
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

function formatPreview(thread: CharacterSummary) {
  const preview = thread.preview.trim();
  const partnerName = thread.partnerName?.trim();

  if (partnerName && preview === `Kontak baru dengan ${partnerName}`) {
    return "Mulai obrolan 2 arah";
  }
  return preview || "Mulai obrolan 2 arah";
}

export function CallsView({
  threads,
  activeId,
  onSelect,
  onManageContacts,
  onRefresh,
}: {
  threads: CharacterSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onManageContacts: () => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");

  const ownerThreads = useMemo(
    () => threads.filter((thread) => thread.threadKind === "owner_contact"),
    [threads]
  );
  const filtered = useMemo(() => {
    const cleanedQuery = query.trim().toLowerCase();
    if (!cleanedQuery) return ownerThreads;

    return ownerThreads.filter((thread) =>
      [thread.partnerName, thread.contactCharacterName, thread.name, thread.preview]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(cleanedQuery)
    );
  }, [ownerThreads, query]);

  return (
    <main className="flex h-full min-h-0 w-full flex-col bg-app">
      <MenuHeader
        title="Panggilan"
        description="Chat 2 arah dengan karakter milikmu"
        actions={
          <>
            <MenuHeaderIconButton
              onClick={onRefresh}
              aria-label="Segarkan daftar chat"
              title="Segarkan daftar chat"
            >
              <RefreshIcon className="h-5 w-5" />
            </MenuHeaderIconButton>
            <MenuHeaderIconButton
              onClick={onManageContacts}
              aria-label="Kelola kontak karakter"
              title="Kelola kontak karakter"
            >
              <PlusIcon className="h-5 w-5" />
            </MenuHeaderIconButton>
          </>
        }
      />

      <div className="px-3 pb-2.5 pt-2.5">
        <div className="flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 ring-1 ring-transparent transition focus-within:bg-surface focus-within:ring-ink/25 dark:bg-surface-2 dark:focus-within:bg-surface">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari chat, orang, atau karakter..."
            aria-label="Cari chat Panggilan"
            className="w-full bg-transparent text-base text-copy outline-none placeholder:text-muted sm:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Bersihkan pencarian"
              className="rounded-full p-0.5 text-muted transition hover:text-ink"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-accent/25 dark:divide-accent/30 overflow-y-auto px-2 pb-[calc(var(--tabbar-space)+0.5rem)] md:pb-2">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            {ownerThreads.length === 0 ? (
              <>
                <h2 className="text-sm font-semibold text-accent-text">Belum ada chat 2 arah</h2>
                <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-ink-soft">
                  Daftar ini hanya menampilkan pengguna yang mengundang karakter milikmu dan
                  sudah terhubung. Undangan masuk bisa ditinjau di Kontak Karakter.
                </p>
                <button
                  type="button"
                  onClick={onManageContacts}
                  className="mt-4 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong"
                >
                  Lihat undangan masuk
                </button>
              </>
            ) : (
              <p className="text-sm text-muted">Tidak ada chat yang cocok dengan pencarianmu.</p>
            )}
          </div>
        ) : (
          filtered.map((thread) => {
            const selected = activeId === thread.id;
            return (
              <button
                key={thread.id}
                type="button"
                onClick={() => onSelect(thread.id)}
                className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition active:scale-[0.99] ${
                  selected ? "bg-accent/10 dark:bg-white/[0.08]" : "hover:bg-accent/10 dark:hover:bg-surface-2"
                }`}
              >
                <Avatar
                  name={thread.partnerName || thread.name}
                  src={thread.avatarUrl}
                  size={48}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-accent-text">
                      {thread.name}
                    </p>
                    <time className="shrink-0 text-[11px] text-muted">
                      {formatListTime(thread.updatedAt)}
                    </time>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-soft">{formatPreview(thread)}</p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </main>
  );
}
