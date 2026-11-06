"use client";

import { useState } from "react";
import type { BrainstormRoomSummary, CharacterSummary } from "@/types/chat";
import { Avatar } from "./Avatar";
import { MenuHeader, MenuHeaderIconButton } from "./MenuHeader";
import { BrainstormIcon, PlusIcon, TrashIcon, XIcon } from "./icons";

export function BrainstormView({
  rooms,
  characters,
  onOpenMeetup,
  onOpenRoom,
  onCreateBrainstorm,
  onDeleteRoom,
  onNeedCharacters,
}: {
  rooms: BrainstormRoomSummary[];
  characters: CharacterSummary[];
  onOpenMeetup: (characterId: string) => void;
  onOpenRoom: (id: string) => void;
  onCreateBrainstorm: (title: string, characterIds: string[]) => Promise<boolean>;
  onDeleteRoom: (id: string) => void;
  onNeedCharacters: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const brainstormRooms = rooms.filter((room) => room.mode === "brainstorm");
  const canBrainstorm = characters.length >= 2;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <MenuHeader
        title="MeetUp"
        description="Pilih satu karakter untuk tatap muka, atau buat meja Brainstorm"
        actions={
          <MenuHeaderIconButton
            onClick={() => setShowCreate(true)}
            disabled={!canBrainstorm}
            aria-label="Buat meja Brainstorm"
            title={canBrainstorm ? "Buat meja Brainstorm" : "Brainstorm perlu minimal 2 karakter"}
          >
            <PlusIcon className="h-5 w-5" />
          </MenuHeaderIconButton>
        }
      />

      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-3 py-4 pb-[calc(var(--tabbar-space)+1rem)] md:px-4">
        <section className="mx-auto w-full max-w-[900px]">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-ink">Tatap Muka</h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              Pilih satu karakter. Kalian berdua melanjutkan riwayat Chat dan Panggilan yang sama.
            </p>
          </div>

          {characters.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface p-5 text-center">
              <p className="text-sm font-semibold text-ink">Belum ada karakter untuk diajak bertemu</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
                Buat karakter dulu, lalu pilih satu untuk memulai pertemuan berdua.
              </p>
              <button
                onClick={onNeedCharacters}
                className="mt-4 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink"
              >
                Buat Karakter
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {characters.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => onOpenMeetup(character.id)}
                  className="rounded-2xl border border-line bg-surface p-3.5 text-left transition hover:bg-surface-2 active:scale-[0.99]"
                  aria-label={`Ajak ${character.name} bertemu tatap muka`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={character.name} src={character.avatarUrl} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{character.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">
                        {character.shortBio || "Karakter pribadimu"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">Hanya kamu dan {character.name}</span>
                    <span className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink">
                      Ajak bertemu
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="mx-auto w-full max-w-[900px]">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-ink">Brainstorm</h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              Meja diskusi 2–3 karakter, terpisah dari pertemuan Tatap Muka.
            </p>
          </div>

          {brainstormRooms.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface px-5 py-7 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-2">
                <BrainstormIcon className="h-6 w-6 text-ink-soft" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-ink">
                {canBrainstorm ? "Belum ada meja Brainstorm" : "Brainstorm perlu minimal 2 karakter"}
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
                {canBrainstorm
                  ? "Buat meja untuk meminta beberapa karakter menanggapi topik secara bergiliran."
                  : characters.length === 0
                    ? "Buat karakter untuk memulai Tatap Muka. Brainstorm memerlukan setidaknya dua karakter."
                    : "Tatap Muka sudah bisa dimulai dengan satu karakter. Untuk Brainstorm, tambahkan karakter lagi."}
              </p>
              {canBrainstorm ? (
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-4 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink"
                >
                  Buat Meja Pertama
                </button>
              ) : characters.length > 0 ? (
                <button
                  onClick={onNeedCharacters}
                  className="mt-4 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink"
                >
                  Tambah Karakter
                </button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2.5">
              {brainstormRooms.map((room) => (
                <div
                  key={room.id}
                  className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3 transition hover:bg-surface-2"
                >
                  <button
                    type="button"
                    onClick={() => onOpenRoom(room.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div className="flex -space-x-2">
                      {room.members.slice(0, 3).map((member) => (
                        <div key={member.characterId} className="rounded-full ring-2 ring-surface">
                          <Avatar name={member.name} src={member.avatarUrl} size={36} />
                        </div>
                      ))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{room.title}</p>
                      <p className="truncate text-xs text-ink-soft">
                        {room.members.map((member) => member.name).join(" · ")} · {room.messageCount} pesan
                      </p>
                      <p className="truncate text-xs text-muted">{room.preview}</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Hapus meja ini beserta obrolannya?")) onDeleteRoom(room.id);
                    }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
                    aria-label={`Hapus meja ${room.title}`}
                    title="Hapus meja"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showCreate && (
        <CreateBrainstormModal
          characters={characters}
          onClose={() => setShowCreate(false)}
          onCreate={async (title, ids) => {
            const ok = await onCreateBrainstorm(title, ids);
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
      if (prev.includes(id)) return prev.filter((value) => value !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  async function handleCreate() {
    if (picked.length < 2) {
      setError("Pilih minimal 2 karakter untuk Brainstorm.");
      return;
    }
    setBusy(true);
    setError(null);
    const fallbackTitle = `Brainstorm — ${picked.length} karakter`;
    const ok = await onCreate(title.trim() || fallbackTitle, picked);
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
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h2 className="font-display text-[15px] font-bold text-ink">Buat Meja Brainstorm</h2>
            <p className="mt-0.5 text-xs text-ink-soft">Pilih 2–3 karakter untuk berdiskusi.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-soft hover:bg-surface-2 hover:text-ink"
            aria-label="Tutup"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <label className="text-xs font-semibold text-muted">Judul meja (opsional)</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="mis. Brainstorm Naskah"
            className="mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink/20"
            maxLength={80}
          />

          <p className="mt-4 text-xs font-semibold text-muted">Pilih 2–3 karakter</p>
          <p className="text-[11px] text-muted">Terpilih {picked.length}/{Math.min(characters.length, 3)}</p>
          <div className="mt-2 space-y-2">
            {characters.map((character) => {
              const active = picked.includes(character.id);
              return (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => toggle(character.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                    active ? "border-ink bg-ink/[0.06] dark:bg-white/[0.08]" : "border-line bg-surface hover:bg-surface-2"
                  }`}
                  aria-pressed={active}
                >
                  <Avatar name={character.name} src={character.avatarUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{character.name}</p>
                    <p className="truncate text-xs text-ink-soft">{character.shortBio || "Tanpa bio"}</p>
                  </div>
                  <span className={`grid h-6 w-6 place-items-center rounded-full border text-xs font-bold ${active ? "border-ink bg-ink text-white dark:bg-white dark:text-black" : "border-line text-muted"}`}>
                    {active ? "✓" : "+"}
                  </span>
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
          <p className="mt-2 text-center text-[11px] text-muted">
            Tiap karakter menanggapi bergiliran; diskusi grup tidak mengubah riwayat Tatap Muka.
          </p>
        </div>
      </div>
    </div>
  );
}
