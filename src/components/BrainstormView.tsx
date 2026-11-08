"use client";

import { useState } from "react";
import type { BrainstormRoomSummary, CharacterSummary } from "@/types/chat";
import { Avatar } from "./Avatar";
import { MenuHeader, MenuHeaderIconButton } from "./MenuHeader";
import { MeetupIcon, PlusIcon, TrashIcon, XIcon } from "./icons";

type SharedRoomMode = "brainstorm" | "scene";

export function BrainstormView({
  rooms,
  characters,
  meetupCharacters,
  onOpenMeetup,
  onOpenRoom,
  onCreateBrainstorm,
  onDeleteRoom,
  onNeedCharacters,
}: {
  rooms: BrainstormRoomSummary[];
  characters: CharacterSummary[];
  meetupCharacters: CharacterSummary[];
  onOpenMeetup: (characterId: string) => void;
  onOpenRoom: (id: string) => void;
  onCreateBrainstorm: (
    title: string,
    characterIds: string[],
    mode: SharedRoomMode,
    sceneCanonical: boolean
  ) => Promise<boolean>;
  onDeleteRoom: (id: string) => void;
  onNeedCharacters: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<SharedRoomMode>("brainstorm");
  const brainstormRooms = rooms.filter((room) => room.mode === "brainstorm");
  const sceneRooms = rooms.filter((room) => room.mode === "scene");
  const canBrainstorm = characters.length >= 2;
  const canCreateRoom = characters.length >= 1;

  function openCreate(mode: SharedRoomMode) {
    setCreateMode(mode);
    setShowCreate(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <MenuHeader
        title="MeetUp"
        description="Tatap Muka berdua, diskusi Brainstorm, atau Reka Adegan"
        actions={
          <MenuHeaderIconButton
            onClick={() => openCreate(canBrainstorm ? "brainstorm" : "scene")}
            disabled={!canCreateRoom}
            aria-label="Buat ruang bersama"
            title={canCreateRoom ? "Buat Brainstorm atau Reka Adegan" : "Buat karakter terlebih dulu"}
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

          {meetupCharacters.length === 0 ? (
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
              {meetupCharacters.map((character) => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => onOpenMeetup(character.id)}
                  className="rounded-2xl border border-line bg-surface p-3.5 text-left transition hover:bg-surface-2 active:scale-[0.99]"
                  aria-label={`Temui ${character.name} tatap muka`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={character.name} src={character.avatarUrl} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          <p className="min-w-0 truncate text-sm font-semibold text-ink">
                            {character.name}
                          </p>
                          {character.threadKind === "guest_contact" && (
                            <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
                              Kontak
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink">
                          Temui
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">
                        {character.shortBio || "Karakter pribadimu"}
                      </p>
                    </div>
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
              Diskusi ide 2–3 karakter. Usulan dan rencana bisa diingat sebagai rencana, bukan kejadian cerita.
            </p>
          </div>

          {brainstormRooms.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface px-5 py-7 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-2">
                <MeetupIcon className="h-6 w-6 text-ink-soft" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-ink">
                {canBrainstorm ? "Belum ada meja Brainstorm" : "Brainstorm perlu minimal 2 karakter"}
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
                {canBrainstorm
                  ? "Buat meja untuk meminta beberapa karakter menanggapi topik secara bergiliran."
                  : characters.length === 0
                    ? "Buat karakter dulu. Brainstorm memerlukan setidaknya dua karakter."
                    : "Tatap Muka dan Reka Adegan sudah bisa dimulai; tambahkan satu karakter lagi untuk Brainstorm."}
              </p>
              {canBrainstorm ? (
                <button
                  onClick={() => openCreate("brainstorm")}
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
            <RoomCards rooms={brainstormRooms} onOpenRoom={onOpenRoom} onDeleteRoom={onDeleteRoom} />
          )}
        </section>

        <section className="mx-auto w-full max-w-[900px]">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-ink">Reka Adegan</h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              Adegan bersama 1–3 karakter. Default-nya latihan; tandai canon bila masuk cerita utama.
            </p>
          </div>

          {sceneRooms.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface px-5 py-7 text-center">
              <h3 className="text-sm font-semibold text-ink">
                {canCreateRoom ? "Belum ada Reka Adegan" : "Buat karakter untuk mulai Reka Adegan"}
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
                {canCreateRoom
                  ? "Mainkan adegan dengan satu sampai tiga karakter; pilih Latihan atau bagian cerita utama saat membuatnya."
                  : "Reka Adegan memerlukan minimal satu karakter."}
              </p>
              {canCreateRoom ? (
                <button
                  onClick={() => openCreate("scene")}
                  className="mt-4 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink"
                >
                  Buat Adegan Pertama
                </button>
              ) : (
                <button
                  onClick={onNeedCharacters}
                  className="mt-4 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink"
                >
                  Buat Karakter
                </button>
              )}
            </div>
          ) : (
            <RoomCards rooms={sceneRooms} onOpenRoom={onOpenRoom} onDeleteRoom={onDeleteRoom} />
          )}
        </section>
      </div>

      {showCreate && (
        <CreateSharedRoomModal
          characters={characters}
          initialMode={createMode}
          onClose={() => setShowCreate(false)}
          onCreate={async (title, ids, mode, sceneCanonical) => {
            const ok = await onCreateBrainstorm(title, ids, mode, sceneCanonical);
            if (ok) setShowCreate(false);
            return ok;
          }}
        />
      )}
    </div>
  );
}

function RoomCards({
  rooms,
  onOpenRoom,
  onDeleteRoom,
}: {
  rooms: BrainstormRoomSummary[];
  onOpenRoom: (id: string) => void;
  onDeleteRoom: (id: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      {rooms.map((room) => (
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
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-ink">{room.title}</p>
                {room.mode === "scene" && (
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
                    {room.sceneCanonical ? "Canon" : "Latihan"}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-ink-soft">
                {room.members.map((member) => member.name).join(" · ")} · {room.messageCount} pesan
              </p>
              <p className="truncate text-xs text-muted">{room.preview}</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Hapus ${room.mode === "scene" ? "adegan" : "meja"} ini beserta obrolannya?`)) {
                onDeleteRoom(room.id);
              }
            }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
            aria-label={`Hapus ${room.mode === "scene" ? "adegan" : "meja"} ${room.title}`}
            title={room.mode === "scene" ? "Hapus adegan" : "Hapus meja"}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

function CreateSharedRoomModal({
  characters,
  initialMode,
  onClose,
  onCreate,
}: {
  characters: CharacterSummary[];
  initialMode: SharedRoomMode;
  onClose: () => void;
  onCreate: (
    title: string,
    characterIds: string[],
    mode: SharedRoomMode,
    sceneCanonical: boolean
  ) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<SharedRoomMode>(initialMode);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sceneCanonical, setSceneCanonical] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minMembers = mode === "scene" ? 1 : 2;
  const canCreate = picked.length >= minMembers && picked.length <= 3;

  function toggle(id: string) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((value) => value !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  async function handleCreate() {
    if (!canCreate) {
      setError(mode === "scene" ? "Pilih 1–3 karakter untuk Reka Adegan." : "Pilih 2–3 karakter untuk Brainstorm.");
      return;
    }
    setBusy(true);
    setError(null);
    const fallbackTitle =
      mode === "scene" ? `Reka Adegan — ${picked.length} karakter` : `Brainstorm — ${picked.length} karakter`;
    const ok = await onCreate(title.trim() || fallbackTitle, picked, mode, mode === "scene" && sceneCanonical);
    if (!ok) setError("Gagal membuat ruang. Coba lagi.");
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
            <h2 className="font-display text-[15px] font-bold text-ink">
              {mode === "scene" ? "Buat Reka Adegan" : "Buat Meja Brainstorm"}
            </h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              {mode === "scene" ? "Pilih 1–3 karakter untuk bermain adegan." : "Pilih 2–3 karakter untuk berdiskusi."}
            </p>
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
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-1">
            {(["brainstorm", "scene"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setMode(value);
                  setError(null);
                }}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  mode === value ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
                }`}
                aria-pressed={mode === value}
              >
                {value === "scene" ? "Reka Adegan" : "Brainstorm"}
              </button>
            ))}
          </div>

          <label className="mt-4 block text-xs font-semibold text-muted">Judul (opsional)</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={mode === "scene" ? "mis. Adegan di tepi pantai" : "mis. Brainstorm Naskah"}
            className="mt-1.5 w-full rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-ink/20"
            maxLength={80}
          />

          {mode === "scene" && (
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface p-3">
              <input
                type="checkbox"
                checked={sceneCanonical}
                onChange={(event) => setSceneCanonical(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-current"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">Bagian dari cerita utama (canon)</span>
                <span className="mt-0.5 block text-xs text-ink-soft">
                  Tidak dicentang berarti latihan; ini adalah pilihan default.
                </span>
              </span>
            </label>
          )}

          <p className="mt-4 text-xs font-semibold text-muted">
            Pilih {mode === "scene" ? "1–3" : "2–3"} karakter
          </p>
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
                    <p className="mt-0.5 text-[10px] text-muted">
                      Ingatan jangka panjang: {character.memoryEnabled ? "aktif" : "nonaktif"}
                    </p>
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
            disabled={busy || !canCreate}
            className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.98] disabled:opacity-40"
          >
            {busy
              ? "Membuat..."
              : mode === "scene"
                ? `Buat Adegan (${picked.length} karakter)`
                : `Buat Meja (${picked.length} karakter)`}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">
            Ringkasan berwaktu WIB hanya disimpan untuk karakter peserta yang mengaktifkan Ingatan Jangka Panjang. Transkrip lengkap tetap terpisah dari Chat.
          </p>
        </div>
      </div>
    </div>
  );
}
