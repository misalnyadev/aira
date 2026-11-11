"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ContactInvitePreview,
  IncomingContactItem,
  OutgoingContactItem,
} from "@/types/chat";
import {
  describeContactState,
  effectiveContactState,
  normalizePinInput,
} from "@/lib/contactPin";
import { Avatar } from "./Avatar";
import { Switch } from "./Switch";
import { CheckIcon, RefreshIcon, XIcon } from "./icons";

export function AddContactModal({
  onClose,
  onUpdated,
  onOpenCharactersView,
  onOpenChatThread,
}: {
  onClose: () => void;
  onUpdated?: () => Promise<void> | void;
  onOpenCharactersView?: () => void;
  onOpenChatThread?: (contactId: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{
    pin: string;
    character: ContactInvitePreview;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [loading, setLoading] = useState(true);
  const [incoming, setIncoming] = useState<IncomingContactItem[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingContactItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    const res = await fetch("/api/contacts", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const inc = (data.incoming ?? []) as IncomingContactItem[];
      const out = (data.outgoing ?? []) as OutgoingContactItem[];
      setIncoming(inc);
      setOutgoing(out);
      if (inc.length === 0 && out.length > 0) {
        setTab("outgoing");
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadContacts();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadContacts]);

  async function handlePreviewPin() {
    const cleaned = normalizePinInput(pin);
    if (!cleaned) {
      setFeedback({ kind: "err", text: "Masukkan kode PIN karakter dulu." });
      return;
    }

    setPreviewing(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/contacts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: cleaned }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.preview) {
        setPreview(null);
        setFeedback({
          kind: "err",
          text: data.error || "Gagal memuat pratinjau karakter.",
        });
        return;
      }
      setPreview({ pin: cleaned, character: data.preview as ContactInvitePreview });
    } catch {
      setPreview(null);
      setFeedback({ kind: "err", text: "Koneksi gagal saat memuat pratinjau karakter." });
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSubmitPin(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = normalizePinInput(pin);
    if (!cleaned) {
      setFeedback({ kind: "err", text: "Masukkan kode PIN karakter dulu." });
      return;
    }
    if (!preview || preview.pin !== cleaned) {
      setFeedback({
        kind: "err",
        text: "Lihat pratinjau karakter dulu sebelum mengirim undangan.",
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: cleaned, note: note.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({
          kind: "err",
          text: data.error || "Gagal mengirim undangan kontak.",
        });
        return;
      }
      setPin("");
      setNote("");
      setPreview(null);
      setTab("outgoing");
      setFeedback({
        kind: "ok",
        text: `Undangan kontak untuk ${data.characterName || "karakter"} berhasil dikirim.`,
      });
      await loadContacts();
      await onUpdated?.();
    } catch {
      setFeedback({
        kind: "err",
        text: "Koneksi gagal saat mengirim undangan kontak.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAction(
    id: string,
    action: "accept" | "reject" | "block" | "unblock" | "cancel" | "remove",
    extra?: Record<string, unknown>
  ) {
    if (action === "block" && !confirm("Blokir pengguna ini dari karaktermu?")) {
      return;
    }
    if (
      (action === "cancel" || action === "remove") &&
      !confirm("Hapus undangan / kontak karakter ini dari daftarmu?")
    ) {
      return;
    }

    setBusyId(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({
          kind: "err",
          text: data.error || "Gagal memperbarui status kontak.",
        });
        return;
      }
      await loadContacts();
      await onUpdated?.();
    } catch {
      setFeedback({
        kind: "err",
        text: "Koneksi gagal saat memperbarui kontak.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleAi(item: IncomingContactItem, nextVal: boolean) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/contacts/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_ai", aiAutoReply: nextVal }),
      });
      if (res.ok) {
        await loadContacts();
        await onUpdated?.();
      }
    } finally {
      setBusyId(null);
    }
  }

  const pendingIncomingCount = incoming.filter(
    (i) => i.ownerStatus === "pending" && i.adminStatus !== "rejected"
  ).length;
  const visiblePreview =
    preview?.pin === normalizePinInput(pin) ? preview.character : null;

  return (
    <div
      className="modal-sheet-overlay absolute inset-0 z-50 flex items-end justify-center bg-black/55 px-0 pb-0 pt-[max(0.5rem,var(--safe-top))] backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90dvh,100%)] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h2 className="font-display text-base font-bold text-accent-text dark:text-accent-text">
              Kontak Karakter
            </h2>
            <p className="text-xs text-ink-soft">
              Undang lewat PIN &amp; kelola akses kontak 2 arah
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void loadContacts()}
              aria-label="Segarkan daftar kontak"
              className="rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink"
            >
              <RefreshIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-5 pb-6">
          {/* Form Tambah Kontak dengan PIN */}
          <form
            onSubmit={handleSubmitPin}
            className="space-y-2.5 rounded-2xl border border-line bg-surface-2/40 p-3.5"
          >
            <label className="block text-xs font-semibold text-accent-text dark:text-accent-text">
              Tambah Kontak Karakter dengan PIN
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.toUpperCase());
                  setPreview(null);
                  setFeedback(null);
                }}
                placeholder="Contoh: K7R4M9"
                maxLength={12}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2 font-mono text-sm font-bold tracking-widest text-ink uppercase placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-muted focus:border-ink focus:outline-none"
              />
              <button
                type="button"
                disabled={previewing || submitting}
                onClick={() => void handlePreviewPin()}
                className="shrink-0 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
              >
                {previewing ? "Memuat..." : "Pratinjau"}
              </button>
            </div>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Sapaan singkat untuk pemilik karakter (opsional)..."
              maxLength={200}
              className="w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            />
            {visiblePreview && (
              <div
                className="space-y-3 rounded-xl border border-line bg-surface p-3.5"
                aria-live="polite"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar
                    name={visiblePreview.characterName}
                    src={visiblePreview.characterAvatarUrl}
                    size={44}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-accent-text dark:text-accent-text">
                      {visiblePreview.characterName}
                    </p>
                    <p className="text-xs leading-relaxed text-ink-soft">
                      {visiblePreview.characterShortBio || "Belum ada status singkat."}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-accent-text dark:text-accent-text">Keahlian & layanan</p>
                  {visiblePreview.skillPortfolio.length ? (
                    <ul className="space-y-1.5">
                      {visiblePreview.skillPortfolio.map((skill, index) => (
                        <li
                          key={`${skill.title}-${index}`}
                          className="rounded-lg bg-surface-2/70 px-2.5 py-2"
                        >
                          <p className="text-xs font-semibold text-accent-text dark:text-accent-text">{skill.title}</p>
                          {skill.description && (
                            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
                              {skill.description}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-lg bg-surface-2/70 px-2.5 py-2 text-xs text-ink-soft">
                      Belum ada keahlian yang dicantumkan.
                    </p>
                  )}
                </div>
                <p className="text-[10px] leading-relaxed text-muted">
                  Ini portofolio yang diatur pemilik karakter, bukan verifikasi sertifikasi.
                  Sambungan aktif setelah disetujui pemilik.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-50"
                >
                  {submitting ? "Mengirim..." : `Undang ${visiblePreview.characterName}`}
                </button>
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-muted">
              Pratinjau menampilkan profil publik dan keahlian karakter. Sambungan kontak langsung
              aktif setelah disetujui <b>pemilik karakter</b>. Ngobrol memakai API key masing-masing
              akun.
            </p>
          </form>

          {feedback && (
            <p
              className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                feedback.kind === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300"
              }`}
            >
              {feedback.kind === "ok"
                ? `✓ ${feedback.text}`
                : `✗ ${feedback.text}`}
            </p>
          )}

          {/* Tab Masuk vs Keluar */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
              <button
                type="button"
                onClick={() => setTab("incoming")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                  tab === "incoming"
                    ? "bg-surface text-ink shadow-2xs ring-1 ring-line"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                <span>Masuk ke Karakterku</span>
                {pendingIncomingCount > 0 && (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-extrabold text-white">
                    {pendingIncomingCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setTab("outgoing")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                  tab === "outgoing"
                    ? "bg-surface text-ink shadow-2xs ring-1 ring-line"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                <span>Undangan Saya ({outgoing.length})</span>
              </button>
            </div>

            {loading ? (
              <p className="py-6 text-center text-xs text-muted">
                Memuat daftar kontak...
              </p>
            ) : tab === "incoming" ? (
              incoming.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-muted">
                  Belum ada pengguna lain yang mengundang karaktermu. Bagikan kode PIN karakter dari menu <b>Karakter</b>.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {incoming.map((item) => {
                    const state = effectiveContactState(
                      item.adminStatus,
                      item.ownerStatus
                    );
                    const isBusy = busyId === item.id;

                    return (
                      <div
                        key={item.id}
                        className="space-y-2.5 rounded-2xl border border-line bg-surface p-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar
                              name={item.guestName}
                              src={item.guestAvatarUrl}
                              size={38}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-accent-text dark:text-accent-text">
                                {item.guestName}
                              </p>
                              <p className="truncate text-xs text-muted">
                                Mengundang <b>{item.characterName}</b>
                              </p>
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                              state === "active"
                                ? "bg-brand/15 dark:bg-brand/15 text-accent-text dark:text-accent-text"
                                : state === "blocked" || state === "rejected"
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {describeContactState(state)}
                          </span>
                        </div>

                        {item.note && (
                          <p className="rounded-lg bg-surface-2/70 px-3 py-1.5 text-xs text-ink-soft">
                            “{item.note}”
                          </p>
                        )}

                        {state === "active" && (
                          <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2/50 px-3 py-2">
                            <div className="min-w-0">
                              <span className="block text-xs font-medium text-ink">
                                Balasan AI Otomatis
                              </span>
                              <span className="block text-[11px] text-muted">
                                Matikan saat kamu ingin membalas manual 2 arah saja
                              </span>
                            </div>
                            <Switch
                              checked={item.aiAutoReply}
                              disabled={isBusy}
                              onChange={(next) =>
                                void handleToggleAi(item, next)
                              }
                              label="Balasan AI Otomatis"
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-1.5 pt-0.5">
                          {state === "active" && onOpenChatThread && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenChatThread(item.id);
                              }}
                              className="mr-auto rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong"
                            >
                              Buka Chat
                            </button>
                          )}
                          {item.ownerStatus === "blocked" ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void handleAction(item.id, "unblock")
                              }
                              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                            >
                              Buka Blokir
                            </button>
                          ) : (
                            <>
                              {item.ownerStatus !== "approved" && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleAction(item.id, "accept")
                                  }
                                  className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink hover:bg-brand-strong disabled:opacity-50"
                                >
                                  <CheckIcon className="h-3.5 w-3.5" /> Terima
                                </button>
                              )}
                              {item.ownerStatus !== "rejected" && (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleAction(item.id, "reject")
                                  }
                                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                                >
                                  {item.ownerStatus === "approved"
                                    ? "Putuskan"
                                    : "Tolak"}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  void handleAction(item.id, "block")
                                }
                                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-rose-500 hover:border-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                              >
                                Blokir
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : outgoing.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-xs text-muted">
                Kamu belum mengundang karakter milik pengguna lain. Masukkan kode PIN di atas untuk mulai menambahkan kontak.
              </p>
            ) : (
              <div className="space-y-2.5">
                {outgoing.map((item) => {
                  const state = effectiveContactState(
                    item.adminStatus,
                    item.ownerStatus
                  );
                  const isBusy = busyId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar
                          name={item.characterName}
                          src={item.characterAvatarUrl}
                          size={40}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-accent-text dark:text-accent-text">
                            {item.characterName}
                          </p>
                          <p className="truncate text-xs text-muted">
                            Pemilik: {item.ownerName}
                          </p>
                          <span
                            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                              state === "active"
                                ? "bg-brand/15 dark:bg-brand/15 text-accent-text dark:text-accent-text"
                                : state === "blocked" || state === "rejected"
                                  ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {describeContactState(state)}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {state === "active" && onOpenChatThread && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenChatThread(item.id);
                            }}
                            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong"
                          >
                            Buka Chat
                          </button>
                        )}
                        {state !== "blocked" && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleAction(item.id, "remove")}
                            className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface-2 hover:text-rose-500 disabled:opacity-50"
                          >
                            {state === "active" ? "Hapus" : "Batal"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer pintasan ke Menu Karakter */}
        {onOpenCharactersView && (
          <div className="border-t border-line bg-surface-2/40 px-5 py-3 text-center">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCharactersView();
              }}
              className="text-xs font-medium text-ink-soft transition hover:text-ink"
            >
              Ingin membuat karakter baru milikmu sendiri?{" "}
              <b className="text-ink underline decoration-dotted">
                Buka menu Karakter →
              </b>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
