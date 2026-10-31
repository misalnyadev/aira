"use client";

import type { CharacterSummary } from "@/types/chat";
import { MAX_CHARACTERS } from "@/lib/limits";
import { Avatar } from "./Avatar";
import { ChatsIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";

export function CharactersView({
  characters,
  limit = MAX_CHARACTERS,
  onChat,
  onNew,
  onEdit,
  onDelete,
}: {
  characters: CharacterSummary[];
  limit?: number;
  onChat: (id: string) => void;
  onNew: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const full = characters.length >= limit;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-surface">
      <div className="top-bar flex items-center justify-between px-5 pb-3.5 pt-[max(1rem,var(--safe-top))]">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">Karakter</h1>
          <p className="text-xs text-ink-soft">
            {characters.length}/{limit} karakter tersimpan
          </p>
        </div>
        <button
          onClick={onNew}
          disabled={full}
          title={full ? `Maksimal ${limit} karakter per akun` : "Buat karakter baru"}
          aria-label="Buat karakter baru"
          className="rounded-full bg-brand p-2 text-brand-ink transition hover:bg-brand-strong active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-[calc(var(--tabbar-space)+0.75rem)] sm:p-6 sm:pb-[calc(var(--tabbar-space)+1rem)]">
        {characters.length === 0 ? (
          <div className="mx-auto mt-16 max-w-sm rounded-3xl border border-dashed border-line bg-surface p-8 text-center">
            <p className="font-display text-base font-bold text-ink">Belum ada karakter</p>
            <p className="mt-1 text-xs text-ink-soft">
              Buat karakter pertamamu — tulis kepribadian atau impor naskah bible perannya.
            </p>
            <button
              onClick={onNew}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong"
            >
              <PlusIcon className="h-3.5 w-3.5" /> Buat Karakter
            </button>
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {characters.map((c) => (
              <div
                key={c.id}
                className="group flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={c.name} src={c.avatarUrl} size={52} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate font-semibold text-ink">{c.name}</h3>
                      {c.hasBible && (
                        <span
                          title="Memakai bible peran"
                          className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft ring-1 ring-line"
                        >
                          📖 Bible
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-ink-soft">
                      {c.shortBio || "Tanpa status singkat"}
                    </p>
                  </div>
                </div>

                {c.preview && (
                  <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-ink-soft">
                    {c.preview}
                  </p>
                )}

                <div className="mt-4 flex items-center gap-1.5 border-t border-line pt-3">
                  <button
                    onClick={() => onChat(c.id)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.98]"
                  >
                    <ChatsIcon className="h-3.5 w-3.5" /> Chat
                  </button>
                  <button
                    onClick={() => onEdit(c.id)}
                    aria-label={`Edit ${c.name}`}
                    title="Edit karakter"
                    className="rounded-xl border border-line p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onDelete(c.id)}
                    aria-label={`Hapus ${c.name}`}
                    title="Hapus karakter"
                    className="rounded-xl border border-line p-2 text-ink-soft transition hover:border-rose-300 hover:bg-rose-500/10 hover:text-rose-500"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
