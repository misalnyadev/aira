"use client";

import { useEffect, useState } from "react";
import type { BrainstormRoomSummary, CharacterSummary } from "@/types/chat";
import { Avatar } from "./Avatar";
import { BrainstormIcon, PlusIcon, TrashIcon, XIcon } from "./icons";

export function BrainstormView({
  rooms,
  characters,
  onOpenRoom,
  onCreateRoom,
  onDeleteRoom,
  onNeedCharacters,
}: {
  rooms: BrainstormRoomSummary[];
  characters: CharacterSummary[];
  onOpenRoom: (id: string) => void;
  onCreateRoom: (title: string, characterIds: string[]) => Promise<boolean>;
  onDeleteRoom: (id: string) => void;
  onNeedCharacters: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <div className="top-bar shrink-0 px-4 pb-3 pt-[max(0.75rem,var(--safe-top))]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-ink text-brand-ink">
              <BrainstormIcon className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-[15px] font-bold leading-none text-ink">Meja Diskusi</h1>
              <p className="text-xs text-ink-soft">2–3 karakter brainstorming bareng</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            disabled={characters.length < 2}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-95 disabled:opacity-40"
          >
            <PlusIcon className="h-4 w-4" /> Buat Meja
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 pb-[calc(var(--tabbar-space)+1rem)] md:px-4">
        {characters.length < 2 ? (
          <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
            <p className="text-sm font-semibold text-ink">Butuh minimal 2 karakter</p>
            <p className="mt-1 text-sm text-ink-soft">
              Meja diskusi butuh 2–3 karakter biar seru brainstorming. Buat karakter dulu, bedakan sifat & keahliannya.
            </p>
            <button
              onClick={onNeedCharacters}
              className="mt-4 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink"
            >
              Buat Karakter
            </button>
          </div>
        ) : rooms.length === 0 ? (
          <div className="mx-auto max-w-md py-10 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-2">
              <BrainstormIcon className="h-7 w-7 text-ink-soft" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-ink">Belum ada meja</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">
              Undang 2–3 karakter dengan karakter berbeda ke satu meja — cocok buat brainstorm naskah, proyek, atau ide konten.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink"
            >
              Buat Meja Pertama
            </button>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[720px] space-y-2.5">
            {rooms.map((r) => (
              <button
                key={r.id}
                onClick={() => onOpenRoom(r.id)}
                className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 text-left transition hover:bg-surface-2 active:scale-[0.99]"
              >
                <div className="flex -space-x-2">
                  {r.members.slice(0, 3).map((m) => (
                    <div key={m.characterId} className="rounded-full ring-2 ring-surface">
                      <Avatar name={m.name} src={m.avatarUrl} size={36} />
                    </div>
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{r.title}</p>
                  <p className="truncate text-xs text-ink-soft">
                    {r.members.map((m) => m.name).join(" · ")} · {r.messageCount} pesan
                  </p>
                  <p className="truncate text-xs text-muted">{r.preview}</p>
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Hapus meja ini beserta obrolannya?")) onDeleteRoom(r.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      if (confirm("Hapus meja ini beserta obrolannya?")) onDeleteRoom(r.id);
                    }
                  }}
                  className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
                  aria-label="Hapus meja"
                >
                  <TrashIcon className="h-4 w-4" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateBrainstormModal
          characters={characters}
          onClose={() => setShowCreate(false)}
          onCreate={async (title, ids) => {
            const ok = await onCreateRoom(title, ids);
            if (ok) setShowCreate(false);
            return ok;
          }}
        />
      )}
    </div>
  );
}

function CreateBrainstormModal({
  characters,
  onClose,
  onCreate,
}: {
  characters: CharacterSummary[];
  onClose: () => void;
  onCreate: (title: string, characterIds: string[]) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  async function handleCreate() {
    if (picked.length < 2) {
      setError("Pilih minimal 2 karakter.");
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onCreate(title.trim() || `${picked.length} Karakter — Brainstorm`, picked);
    if (!ok) setError("Gagal membuat meja. Coba lagi.");
    setBusy(false);
  }

  return (
    <div
      className="fade-in modal-overlay absolute inset-0 z-50 flex items-center justify-center bg-black/55 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,var(--safe-top))] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="pop-in flex max-h-[min(86dvh,100%)] min-h-0 w-full max-w-md flex-col rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-display text-[15px] font-bold text-ink">Buat Meja Baru</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink-soft hover:bg-surface-2 hover:text-ink">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <label className="text-xs font-semibold text-muted">Judul meja (opsional)</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="mis. Brainstorm Naskah Kopi Senja"
            className="mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink/20"
            maxLength={80}
          />

          <p className="mt-4 text-xs font-semibold text-muted">Pilih 2–3 karakter (beda sifat makin seru)</p>
          <p className="text-[11px] text-muted">Terpilih {picked.length}/3</p>
          <div className="mt-2 space-y-2">
            {characters.map((c) => {
              const active = picked.includes(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                    active ? "border-ink bg-ink/[0.06] dark:bg-white/[0.08]" : "border-line bg-surface hover:bg-surface-2"
                  }`}
                >
                  <Avatar name={c.name} src={c.avatarUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                    <p className="truncate text-xs text-ink-soft">{c.shortBio || "Tanpa bio"}</p>
                  </div>
                  <div className={`grid h-6 w-6 place-items-center rounded-full border text-xs font-bold ${active ? "border-ink bg-ink text-white dark:bg-white dark:text-black" : "border-line text-muted"}`}>
                    {active ? "✓" : "+"}
                  </div>
                </button>
              );
            })}
          </div>

          {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}
        </div>

        <div className="shrink-0 border-t border-line px-5 py-3">
          <button
            onClick={handleCreate}
            disabled={busy || picked.length < 2}
            className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? "Membuat..." : `Buat Meja (${picked.length} karakter)`}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">Tip: pilih karakter dengan gaya bicara berbeda biar diskusinya berwarna.</p>
        </div>
      </div>
    </div>
  );
}
