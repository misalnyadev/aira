"use client";

import { useMemo, useState } from "react";
import type { CharacterSummary } from "@/types/chat";
import { Avatar } from "./Avatar";
import { PlusIcon, SearchIcon, SettingsIcon } from "./icons";

function formatListTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

export function Sidebar({
  characters,
  activeId,
  onSelect,
  onNewCharacter,
  onOpenSettings,
  hasProviders,
}: {
  characters: CharacterSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewCharacter: () => void;
  onOpenSettings: () => void;
  hasProviders: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => characters.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())),
    [characters, query]
  );

  return (
    <div className="flex h-full w-full flex-col border-r border-slate-200 bg-white md:w-[380px]">
      <div className="flex items-center justify-between bg-[#f0f2f5] px-4 py-3">
        <h1 className="text-lg font-bold text-slate-900">Persona</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenSettings}
            className="relative rounded-full p-2 text-slate-600 hover:bg-slate-200"
            title="Pengaturan API Key"
          >
            <SettingsIcon className="h-5 w-5" />
            {!hasProviders && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />
            )}
          </button>
          <button
            onClick={onNewCharacter}
            className="rounded-full p-2 text-slate-600 hover:bg-slate-200"
            title="Buat karakter baru"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
          <SearchIcon className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari karakter"
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            {characters.length === 0
              ? "Belum ada karakter. Buat karakter pertamamu!"
              : "Karakter tidak ditemukan."}
          </div>
        )}
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
              activeId === c.id ? "bg-slate-100" : ""
            }`}
          >
            <Avatar name={c.name} src={c.avatarUrl} size={48} />
            <div className="min-w-0 flex-1 border-b border-slate-100 pb-3 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {formatListTime(c.updatedAt)}
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">{c.preview}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
