"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDaysToKey,
  formatDueBadge,
  kindLabelId,
  todayWibKey,
  type SharedNoteItem,
  type SharedNoteKind,
} from "@/lib/sharedNotes";
import { CheckIcon, ChevronDownIcon, PlusIcon, TrashIcon, XIcon } from "./icons";

type FilterTab = "active" | "promise" | "idea" | "link" | "done";

const KIND_OPTIONS: { id: SharedNoteKind; label: string }[] = [
  { id: "promise", label: "Janji & Target" },
  { id: "idea", label: "Ide & Naskah" },
  { id: "plan", label: "Rencana" },
  { id: "link", label: "Link" },
];

export function SharedNotesDrawer({
  characterName,
  notes,
  loading,
  onClose,
  onAddNote,
  onToggleDone,
  onDeleteNote,
}: {
  characterName: string;
  notes: SharedNoteItem[];
  loading: boolean;
  onClose: () => void;
  onAddNote: (input: {
    kind: SharedNoteKind;
    title: string;
    dueDate: string | null;
    url: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  onToggleDone: (noteId: string, nextDone: boolean) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<FilterTab>("active");
  const [composerOpen, setComposerOpen] = useState(false);
  const [kind, setKind] = useState<SharedNoteKind>("promise");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState<string>("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const todayKey = useMemo(() => todayWibKey(), []);
  const tomorrowKey = useMemo(() => addDaysToKey(todayKey, 1), [todayKey]);
  const nextWeekKey = useMemo(() => addDaysToKey(todayKey, 7), [todayKey]);

  const activeNotes = useMemo(() => notes.filter((n) => !n.done), [notes]);
  const doneNotes = useMemo(() => notes.filter((n) => n.done), [notes]);

  const filteredNotes = useMemo(() => {
    const base =
      filter === "done"
        ? doneNotes
        : filter === "promise"
          ? activeNotes.filter((n) => n.kind === "promise" || n.kind === "plan")
          : filter === "idea"
            ? activeNotes.filter((n) => n.kind === "idea")
            : filter === "link"
              ? activeNotes.filter((n) => n.kind === "link" || Boolean(n.url))
              : activeNotes;

    // Urutkan item aktif: tanggal terdekat duluan, lalu waktu dibuat terbaru
    return [...base].sort((a, b) => {
      if (!a.done && !b.done) {
        if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
          return a.dueDate.localeCompare(b.dueDate);
        }
        if (a.dueDate && !b.dueDate) return -1;
        if (!a.dueDate && b.dueDate) return 1;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [activeNotes, doneNotes, filter]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError("Tulis isi catatan atau janji terlebih dahulu.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const res = await onAddNote({
      kind,
      title: cleanTitle,
      dueDate: dueDate.trim() || null,
      url: url.trim() || null,
    });
    setSaving(false);

    if (!res.ok) {
      setFormError(res.error || "Gagal menyimpan catatan.");
      return;
    }

    setTitle("");
    setDueDate("");
    setUrl("");
    setComposerOpen(false);
    if (filter === "done") setFilter("active");
  }

  return (
    <div
      className="fade-in modal-overlay absolute inset-0 z-50 flex items-center justify-center bg-black/55 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,var(--safe-top))] backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="pop-in flex max-h-[min(86dvh,100%)] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Catatan Kita bersama ${characterName}`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-bold text-accent-text">
              Catatan & Janji Kita
            </h2>
            <p className="truncate text-[11.5px] text-muted">
              Bersama {characterName} · otomatis diingat saat ngobrol
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup papan catatan"
            className="shrink-0 rounded-full p-1.5 text-ink-soft transition hover:bg-surface-2 hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Isi Scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-3">
          {/* Accordion Tambah Manual */}
          <div className="rounded-2xl border border-line bg-surface-2/55">
            <button
              type="button"
              onClick={() => {
                setComposerOpen((v) => !v);
                setFormError(null);
              }}
              className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-accent-text">
                <PlusIcon className="h-4 w-4 shrink-0" />
                Tambah Catatan / Janji Baru
              </span>
              <ChevronDownIcon
                className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${
                  composerOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {composerOpen && (
              <form
                onSubmit={handleSubmit}
                className="space-y-2.5 border-t border-line px-3.5 py-3"
              >
                <div className="flex flex-wrap gap-1.5">
                  {KIND_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setKind(opt.id)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                        kind === opt.id
                          ? "border-ink bg-ink text-surface"
                          : "border-line bg-surface text-ink-soft hover:text-ink"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    kind === "idea"
                      ? "Tulis ide naskah, adegan, atau premis cerita..."
                      : kind === "link"
                        ? "Judul referensi atau keterangan link..."
                        : "Mis: Jumat revisi naskah babak 2 bareng..."
                  }
                  className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-base text-copy placeholder:text-muted focus:border-ink focus:outline-none"
                />

                {(kind === "link" || url.length > 0) && (
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-copy placeholder:text-muted focus:border-ink focus:outline-none"
                  />
                )}

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium text-muted">
                      Target hari:
                    </span>
                    {[
                      { label: "Tanpa tanggal", val: "" },
                      { label: "Hari ini", val: todayKey },
                      { label: "Besok", val: tomorrowKey },
                      { label: "Minggu depan", val: nextWeekKey },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setDueDate(preset.val)}
                        className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold transition ${
                          dueDate === preset.val
                            ? "border-ink bg-ink text-surface"
                            : "border-line bg-surface text-ink-soft hover:text-ink"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-xl border border-line bg-surface px-3 py-1.5 text-base text-copy focus:border-ink focus:outline-none"
                  />
                </div>

                {formError && (
                  <p className="text-xs font-medium text-rose-500">{formError}</p>
                )}

                <div className="flex justify-end gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setComposerOpen(false)}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-surface transition disabled:opacity-50"
                  >
                    {saving ? "Menyimpan…" : "Simpan"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Filter Kategori */}
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "active", label: `Aktif (${activeNotes.length})` },
                { id: "promise", label: "Janji & Rencana" },
                { id: "idea", label: "Ide Naskah" },
                { id: "link", label: "Link" },
                { id: "done", label: `Selesai (${doneNotes.length})` },
              ] as { id: FilterTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  filter === tab.id
                    ? "border-ink bg-ink text-surface"
                    : "border-line bg-surface text-ink-soft hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Daftar Catatan */}
          {loading ? (
            <p className="py-8 text-center text-xs text-muted">
              Memuat papan catatan…
            </p>
          ) : filteredNotes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center">
              <p className="text-xs font-medium text-copy-soft">
                {filter === "done"
                  ? "Belum ada catatan yang ditandai selesai."
                  : "Belum ada catatan aktif di kategori ini."}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Ketik janji ber-tanggal, ide naskah (mis. &ldquo;Ide naskah:
                …&rdquo;), atau kirim link di chat — otomatis rapi di sini, atau
                tambahkan manual di atas.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNotes.map((item) => {
                const badge = formatDueBadge(item.dueDate, item.done);
                const dueClass =
                  badge?.status === "today"
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300"
                    : badge?.status === "overdue"
                      ? "border-rose-500/40 bg-rose-500/12 text-rose-600 dark:text-rose-300"
                      : "border-line bg-surface text-ink-soft";

                return (
                  <div
                    key={item.id}
                    className={`flex min-w-0 items-start gap-2.5 rounded-2xl border p-3 transition ${
                      item.done
                        ? "border-line/70 bg-surface-2/35 opacity-70"
                        : badge?.status === "today"
                          ? "border-amber-500/45 bg-surface-2/65"
                          : "border-line bg-surface-2/55"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void onToggleDone(item.id, !item.done)}
                      aria-label={
                        item.done ? "Tandai belum selesai" : "Tandai selesai"
                      }
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                        item.done
                          ? "border-ink bg-ink text-surface"
                          : "border-line bg-surface text-transparent hover:border-ink"
                      }`}
                    >
                      <CheckIcon className="h-3 w-3" />
                    </button>

                    <div className="min-w-0 flex-1 space-y-1">
                      <p
                        className={`break-words text-[13px] leading-snug text-copy ${
                          item.done ? "line-through opacity-75" : "font-medium"
                        }`}
                      >
                        {item.title}
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                        <span className="rounded-full border border-line bg-surface px-2 py-0.5 font-semibold text-ink-soft">
                          {kindLabelId(item.kind)}
                        </span>

                        {badge && (
                          <span
                            className={`rounded-full border px-2 py-0.5 font-semibold ${dueClass}`}
                          >
                            {badge.label}
                          </span>
                        )}

                        {item.source === "auto" && (
                          <span className="text-muted">✨ dari chat</span>
                        )}

                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="truncate font-semibold text-copy underline decoration-dotted underline-offset-2"
                          >
                            Buka link ↗
                          </a>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void onDeleteNote(item.id)}
                      aria-label="Hapus catatan"
                      className="shrink-0 rounded-full p-1 text-muted transition hover:bg-surface hover:text-rose-500"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
