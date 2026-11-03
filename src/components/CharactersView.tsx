"use client";

import { useRef, useState } from "react";
import type { CharacterSummary, QuotaRequestSummary } from "@/types/chat";
import { useKeepFieldVisible } from "@/lib/keepFieldVisible";
import { MAX_CHARACTERS } from "@/lib/limits";
import { Avatar } from "./Avatar";
import {
  ChatsIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SettingsIcon,
  TrashIcon,
} from "./icons";
import { QuotaDiscussionBox } from "./QuotaDiscussionBox";

export function CharactersView({
  characters,
  limit = MAX_CHARACTERS,
  isAdmin = false,
  latestQuotaRequest = null,
  pendingQuotaRequestsCount = 0,
  pendingOwnerContactsCount = 0,
  autoOpenRequestForm = false,
  onClearAutoOpenRequest,
  onQuotaChanged,
  onOpenAdminPanel,
  onOpenContactsModal,
  onChat,
  onNew,
  onProfile,
  onEdit,
  onDelete,
}: {
  characters: CharacterSummary[];
  limit?: number;
  isAdmin?: boolean;
  latestQuotaRequest?: QuotaRequestSummary | null;
  pendingQuotaRequestsCount?: number;
  pendingOwnerContactsCount?: number;
  autoOpenRequestForm?: boolean;
  onClearAutoOpenRequest?: () => void;
  onQuotaChanged?: () => Promise<void> | void;
  onOpenAdminPanel?: () => void;
  onOpenContactsModal?: () => void;
  onChat: (id: string) => void;
  onNew: () => void;
  onProfile?: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  useKeepFieldVisible(scrollAreaRef, true);

  const full = characters.length >= limit;
  const hasPendingReq = latestQuotaRequest?.status === "pending";

  const [requestFormOpen, setRequestFormOpen] = useState(autoOpenRequestForm);
  const [addSlots, setAddSlots] = useState(1);
  const [reason, setReason] = useState("");
  const [reqBusy, setReqBusy] = useState(false);
  const [reqFeedback, setReqFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCopyPin(charId: string, pinValue: string) {
    try {
      await navigator.clipboard.writeText(pinValue);
      setCopiedId(charId);
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === charId ? null : cur));
      }, 1800);
    } catch {
      // Abaikan jika browser menolak akses clipboard.
    }
  }

  const showReqForm =
    !isAdmin && !hasPendingReq && (requestFormOpen || autoOpenRequestForm);

  function toggleRequestForm(next: boolean) {
    setRequestFormOpen(next);
    if (!next) onClearAutoOpenRequest?.();
  }

  async function handleSubmitQuotaRequest(e: React.FormEvent) {
    e.preventDefault();
    setReqBusy(true);
    setReqFeedback(null);
    try {
      const res = await fetch("/api/quota-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addSlots,
          reason: reason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setReqFeedback({
          kind: "err",
          text: data.error || "Gagal mengirim pengajuan slot.",
        });
        return;
      }
      setReason("");
      toggleRequestForm(false);
      setReqFeedback({
        kind: "ok",
        text: "Pengajuan tambah slot berhasil dikirim ke Admin.",
      });
      await onQuotaChanged?.();
    } catch {
      setReqFeedback({
        kind: "err",
        text: "Koneksi gagal saat mengirim pengajuan ke Admin.",
      });
    } finally {
      setReqBusy(false);
    }
  }

  async function handleCancelPendingRequest() {
    if (!confirm("Batalkan pengajuan tambah slot ini?")) return;
    setReqBusy(true);
    setReqFeedback(null);
    try {
      const res = await fetch("/api/quota-requests", { method: "DELETE" });
      if (res.ok) {
        setReqFeedback({
          kind: "ok",
          text: "Pengajuan tambah slot dibatalkan.",
        });
        await onQuotaChanged?.();
      }
    } finally {
      setReqBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-surface">
      <div className="top-bar flex items-center justify-between px-5 pb-3.5 pt-[max(1rem,var(--safe-top))]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-bold tracking-tight text-ink">
              Karakter
            </h1>
            {isAdmin && (
              <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-surface">
                Admin
              </span>
            )}
          </div>
          <p className="text-xs text-ink-soft">
            {characters.length}/{limit}{" "}
            {isAdmin ? "karakter tersimpan" : "slot karakter milikmu"}
          </p>
        </div>

        {!isAdmin && full ? (
          <button
            type="button"
            onClick={() => toggleRequestForm(!showReqForm)}
            disabled={hasPendingReq}
            title="Ajukan penambahan slot karakter ke Admin"
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-line active:scale-95 disabled:opacity-50"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            {hasPendingReq ? "Menunggu Admin" : "Minta Slot"}
          </button>
        ) : (
          <button
            onClick={onNew}
            disabled={full}
            title={
              full
                ? `Maksimal ${limit} karakter per akun`
                : "Buat karakter baru"
            }
            aria-label="Buat karakter baru"
            className="rounded-full bg-brand p-2 text-brand-ink transition hover:bg-brand-strong active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto p-4 pb-[calc(var(--tabbar-space)+0.75rem)] sm:p-6 sm:pb-[calc(var(--tabbar-space)+1rem)]"
      >
        <div className="mx-auto max-w-5xl space-y-4">
          {/* Pita pemberitahuan untuk Admin jika ada pengajuan yang menunggu */}
          {isAdmin && pendingQuotaRequestsCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                Ada <b>{pendingQuotaRequestsCount}</b> permintaan tambah slot member di Panel Admin.
              </p>
              {onOpenAdminPanel && (
                <button
                  type="button"
                  onClick={onOpenAdminPanel}
                  className="rounded-xl bg-ink px-3 py-1.5 text-xs font-semibold text-surface transition hover:opacity-90"
                >
                  Tinjau di Panel Admin
                </button>
              )}
            </div>
          )}

          {/* Pita undangan kontak masuk ke karakter milik pengguna ini */}
          {pendingOwnerContactsCount > 0 && onOpenContactsModal && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3">
              <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                Ada <b>{pendingOwnerContactsCount}</b> undangan kontak masuk ke karaktermu.
              </p>
              <button
                type="button"
                onClick={onOpenContactsModal}
                className="rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong"
              >
                Kelola Undangan
              </button>
            </div>
          )}

          {/* Kartu Kuota & Permintaan Tambah Slot untuk Pengguna Biasa */}
          {!isAdmin && (full || latestQuotaRequest || showReqForm || reqFeedback) && (
            <div className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-4">
              {hasPendingReq ? (
                <div className="min-w-0 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="inline-block rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                        Menunggu Persetujuan Admin
                      </span>
                      <p className="mt-1.5 break-words text-xs leading-relaxed text-ink">
                        Kamu mengajukan penambahan kuota menjadi{" "}
                        <b>{latestQuotaRequest?.requestedQuota} karakter</b>.
                        {latestQuotaRequest?.reason
                          ? ` (“${latestQuotaRequest.reason}”)`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onQuotaChanged?.()}
                      title="Cek pembaruan status"
                      aria-label="Cek pembaruan status"
                      className="shrink-0 rounded-full p-1.5 text-ink-soft transition hover:bg-surface hover:text-ink"
                    >
                      <RefreshIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <QuotaDiscussionBox
                    viewerRole="member"
                    requestId={latestQuotaRequest?.id}
                    messages={latestQuotaRequest?.discussion ?? []}
                    onMessagesChange={() => void onQuotaChanged?.()}
                    onPollRefresh={onQuotaChanged}
                  />
                  <button
                    type="button"
                    disabled={reqBusy}
                    onClick={() => void handleCancelPendingRequest()}
                    className="text-xs font-medium text-rose-600 underline decoration-dotted hover:text-rose-500 dark:text-rose-400"
                  >
                    Batalkan pengajuan
                  </button>
                </div>
              ) : (
                <>
                  {latestQuotaRequest &&
                    latestQuotaRequest.status !== "pending" && (
                      <div
                        className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                          latestQuotaRequest.status === "approved"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300"
                        }`}
                      >
                        {latestQuotaRequest.status === "approved"
                          ? `✓ Admin menyetujui kuota kamu menjadi ${limit} karakter.`
                          : "Pengajuan tambah slot sebelumnya belum disetujui Admin."}
                        {latestQuotaRequest.adminNote
                          ? ` Catatan Admin: “${latestQuotaRequest.adminNote}”`
                          : ""}
                      </div>
                    )}

                  {full && !showReqForm && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 flex-1 text-xs leading-relaxed text-ink-soft">
                        Slot karaktermu sudah penuh (<b>{characters.length}/{limit}</b>). Akun standar mendapat 1 karakter bawaan — ingin membuat karakter lagi?
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleRequestForm(true)}
                        className="shrink-0 rounded-xl bg-brand px-3.5 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong"
                      >
                        + Minta Tambah Slot
                      </button>
                    </div>
                  )}

                  {showReqForm && (
                    <form
                      onSubmit={handleSubmitQuotaRequest}
                      className="space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                          Ajukan Tambah Slot Karakter ke Admin
                        </h3>
                        <button
                          type="button"
                          onClick={() => toggleRequestForm(false)}
                          className="text-xs text-ink-soft hover:text-ink"
                        >
                          Tutup
                        </button>
                      </div>

                      <div>
                        <span className="mb-1.5 block text-xs font-medium text-ink-soft">
                          Mau tambah berapa slot karakter? (kuota sekarang: {limit})
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          {[1, 2, 3].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setAddSlots(n)}
                              className={`rounded-xl border py-2 text-xs font-semibold transition ${
                                addSlots === n
                                  ? "border-ink bg-surface text-ink shadow-xs"
                                  : "border-line text-ink-soft hover:bg-surface"
                              }`}
                            >
                              +{n} slot (jadi {limit + n})
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="mb-1 block text-xs font-medium text-ink-soft">
                          Alasan singkat untuk Admin (opsional)
                        </span>
                        <input
                          type="text"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Mis. ingin buat 1 karakter teman diskusi naskah..."
                          maxLength={300}
                          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={reqBusy}
                        className="w-full rounded-xl bg-brand py-2.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-50"
                      >
                        {reqBusy ? "Mengirim..." : "Kirim Permintaan ke Admin"}
                      </button>
                    </form>
                  )}
                </>
              )}

              {reqFeedback && (
                <p
                  className={`text-xs ${
                    reqFeedback.kind === "ok"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {reqFeedback.kind === "ok"
                    ? `✓ ${reqFeedback.text}`
                    : `✗ ${reqFeedback.text}`}
                </p>
              )}
            </div>
          )}

          {characters.length === 0 ? (
            <div className="mx-auto mt-12 max-w-sm rounded-3xl border border-dashed border-line bg-surface p-8 text-center">
              <p className="font-display text-base font-bold text-ink">
                Belum ada karakter
              </p>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {characters.map((c) => (
                <div
                  key={c.id}
                  className="group flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={c.name} src={c.avatarUrl} size={52} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="truncate font-semibold text-ink">
                          {c.name}
                        </h3>
                        {c.hasBible && (
                          <span
                            title="Memakai bible peran"
                            className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft ring-1 ring-line"
                          >
                            📖 Bible
                          </span>
                        )}
                        {c.memoryEnabled && (
                          <span
                            title="Ingatan jangka panjang & sadar waktu aktif"
                            className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft ring-1 ring-line"
                          >
                            🧠 Ingatan
                          </span>
                        )}
                        {c.browsingEnabled && (
                          <span
                            title="Browsing internet & baca link aktif"
                            className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft ring-1 ring-line"
                          >
                            🌐 Web
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

                  {c.invitePin && (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2">
                      <div className="min-w-0">
                        <span className="block text-[10.5px] text-muted">
                          PIN Undangan Kontak
                        </span>
                        <span className="font-mono text-xs font-bold tracking-widest text-ink">
                          {c.invitePin}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopyPin(c.id, c.invitePin!)}
                        className="shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-soft transition hover:bg-surface-2 hover:text-ink"
                      >
                        {copiedId === c.id ? "✓ Disalin" : "Salin PIN"}
                      </button>
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-3">
                    <button
                      onClick={() => onChat(c.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.98]"
                    >
                      <ChatsIcon className="h-3.5 w-3.5" /> Chat
                    </button>
                    {onProfile && (
                      <button
                        onClick={() => onProfile(c.id)}
                        aria-label={`Pengaturan tampilan ${c.name}`}
                        title="Pengaturan tampilan & media"
                        className="rounded-xl border border-line p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink"
                      >
                        <SettingsIcon className="h-4 w-4" />
                      </button>
                    )}
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
    </div>
  );
}
