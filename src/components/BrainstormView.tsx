"use client";

import { useEffect, useState } from "react";
import type {
  BrainstormRoomMode,
  BrainstormRoomSummary,
  CharacterSummary,
} from "@/types/chat";
import { MAX_MEETUP_MEMBERS } from "@/lib/limits";
import { Avatar } from "./Avatar";
import { MenuHeader, MenuHeaderIconButton } from "./MenuHeader";
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
  onCreateRoom: (title: string, characterIds: string[], mode: BrainstormRoomMode) => Promise<boolean>;
  onDeleteRoom: (id: string) => void;
  onNeedCharacters: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <MenuHeader
        title="Meja Diskusi"
        description="Brainstorm atau Meetup tatap muka bersama karakter"
        actions={
          <MenuHeaderIconButton
            onClick={() => setShowCreate(true)}
            disabled={characters.length === 0}
            aria-label="Buat meja baru"
            title="Buat meja baru"
          >
            <PlusIcon className="h-5 w-5" />
          </MenuHeaderIconButton>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 pb-[calc(var(--tabbar-space)+1rem)] md:px-4">
        {characters.length === 0 ? (
          <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
            <p className="text-sm font-semibold text-ink">Buat karakter untuk memulai MeetUp</p>
            <p className="mt-1 text-sm text-ink-soft">
              Tatap Muka bisa dimulai berdua dengan satu karakter; Brainstorm atau pertemuan grup butuh lebih banyak karakter.
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
              Pilih Brainstorm untuk diskusi kelompok, atau Tatap Muka untuk bertemu satu karakter berdua maupun berkumpul dengan grup kecil.
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
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-ink">
                    <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {r.mode === "meetup" ? "Tatap Muka" : "Brainstorm"}
                    </span>
                    <span className="truncate">{r.title}</span>
                  </p>
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
          onCreate={async (title, ids, mode) => {
            const ok = await onCreateRoom(title, ids, mode);
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
  onCreate: (title: string, characterIds: string[], mode: BrainstormRoomMode) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<BrainstormRoomMode>(characters.length >= 2 ? "brainstorm" : "meetup");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxPicked = mode === "meetup" ? MAX_MEETUP_MEMBERS : 3;
  const minPicked = mode === "meetup" ? 1 : 2;

  function chooseMode(next: BrainstormRoomMode) {
    setMode(next);
    if (next === "brainstorm") setPicked((prev) => prev.slice(0, 3));
  }

  function toggle(id: string) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxPicked) return prev;
      return [...prev, id];
    });
  }

  async function handleCreate() {
    if (picked.length < minPicked) {
      setError(mode === "meetup" ? "Pilih minimal 1 karakter." : "Pilih minimal 2 karakter.");
      return;
    }
    setBusy(true);
    setError(null);
    const fallbackTitle = `${mode === "meetup" ? "MeetUp" : "Brainstorm"} — ${picked.length} karakter`;
    const ok = await onCreate(title.trim() || fallbackTitle, picked, mode);
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
            placeholder="mis. Brainstorm Naskah atau Pertemuan Tim 1"
            className="mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink/20"
            maxLength={80}
          />

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => chooseMode("brainstorm")}
              disabled={characters.length < 2}
              aria-pressed={mode === "brainstorm"}
              className={`rounded-2xl border px-3 py-2.5 text-left transition disabled:opacity-40 ${mode === "brainstorm" ? "border-ink bg-ink/[0.06] text-ink dark:bg-white/[0.08]" : "border-line text-ink-soft hover:bg-surface-2"}`}
            >
              <span className="block text-sm font-semibold">Brainstorm</span>
              <span className="mt-0.5 block text-[11px]">2–3 karakter menanggapi bergiliran</span>
            </button>
            <button
              type="button"
              onClick={() => chooseMode("meetup")}
              aria-pressed={mode === "meetup"}
              className={`rounded-2xl border px-3 py-2.5 text-left transition ${mode === "meetup" ? "border-ink bg-ink/[0.06] text-ink dark:bg-white/[0.08]" : "border-line text-ink-soft hover:bg-surface-2"}`}
            >
              <span className="block text-sm font-semibold">Tatap Muka</span>
              <span className="mt-0.5 block text-[11px]">1–{MAX_MEETUP_MEMBERS} karakter hadir di ruangan</span>
            </button>
          </div>

          <p className="mt-4 text-xs font-semibold text-muted">
            {mode === "meetup" ? "Pilih karakter yang hadir langsung" : "Pilih 2–3 karakter untuk diskusi"}
          </p>
          <p className="text-[11px] text-muted">Terpilih {picked.length}/{maxPicked}</p>
          {mode === "meetup" && (
            <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
              Percakapan memakai tampilan teks seperti chat; karakter akan sadar kalian hadir di ruang yang sama. Tidak ada mode telepon atau video.
            </p>
          )}
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
                    <p className="truncate text-xs text-ink-soft">
                      {mode === "meetup" && c.teamRole ? c.teamRole : c.shortBio || "Tanpa bio"}
                    </p>
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
            disabled={busy || picked.length < minPicked}
            className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.98] disabled:opacity-40"
          >
            {busy ? "Membuat..." : `Buat ${mode === "meetup" ? "MeetUp" : "Brainstorm"} (${picked.length} karakter)`}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">
            {mode === "meetup" ? "Hanya karakter terpilih yang hadir di ruangan." : "Tip: pilih karakter dengan gaya bicara berbeda biar diskusinya berwarna."}
          </p>
        </div>
      </div>
    </div>
  );
}
