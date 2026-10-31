"use client";

import { useMemo, useState } from "react";
import type { CharacterSummary } from "@/types/chat";
import { Avatar } from "./Avatar";
import { PlusIcon, SearchIcon, SettingsIcon, SpeakerIcon } from "./icons";

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
  onOpenVoice,
  hasProviders,
  voiceEnabled,
  limit,
}: {
  characters: CharacterSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewCharacter: () => void;
  onOpenSettings: () => void;
  onOpenVoice: () => void;
  hasProviders: boolean;
  voiceEnabled: boolean;
  limit: number;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => characters.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())),
    [characters, query]
  );

  const full = characters.length >= limit;

  return (
    <div className="flex h-full w-full flex-col border-r border-slate-200 bg-white md:w-[380px]">
      <div className="flex items-center justify-between bg-[#f0f2f5] px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-bold text-slate-900">Aisherly</h1>
          <span
            className={`text-[11px] font-medium ${full ? "text-rose-500" : "text-slate-400"}`}
            title={`Maksimal ${limit} karakter`}
          >
            {characters.length}/{limit}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onOpenVoice}
            className="relative rounded-full p-2 text-slate-600 hover:bg-slate-200"
            title="Pengaturan Suara"
            aria-label="Pengaturan Suara"
          >
            <SpeakerIcon className="h-5 w-5" />
            {voiceEnabled && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-500" />
            )}
          </button>
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
            disabled={full}
            className="rounded-full p-2 text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            title={full ? `Maksimal ${limit} karakter` : "Buat karakter baru"}
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
            className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
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
                <p className="truncate text-sm font-semibold text-slate-900">
                  {c.name}
                  {c.hasBible && (
                    <span className="ml-1 text-[11px]" title="Punya bible peran">
                      📖
                    </span>
                  )}
                </p>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {formatListTime(c.updatedAt)}
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">{c.preview}</p>
            </div>
          </button>
        ))}

        {full && (
          <p className="px-4 py-3 text-center text-[11px] text-slate-400">
            Sudah {limit} karakter — batas maksimal. Hapus salah satu untuk menambah lagi.
          </p>
        )}
      </div>
    </div>
  );
}
