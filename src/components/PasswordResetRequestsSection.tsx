"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckIcon, ChevronDownIcon, CopyIcon, RefreshIcon, XIcon } from "./icons";

type PasswordResetRequestRow = {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  nickname: string;
  contactInfo: string;
  createdAt: string;
  lastIssuedAt: string | null;
  activeLinkExpiresAt: string | null;
};

type IssuedLink = { url: string; expiresAt: string };

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "waktu tidak diketahui";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function PasswordResetRequestsSection() {
  const [requests, setRequests] = useState<PasswordResetRequestRow[]>([]);
  const [issuedLinks, setIssuedLinks] = useState<Record<string, IssuedLink>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    const response = await fetch("/api/admin/password-reset-requests", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Gagal memuat pengajuan reset.");
    setRequests((data.requests ?? []) as PasswordResetRequestRow[]);
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/password-reset-requests", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Gagal memuat pengajuan reset.");
        return data as { requests?: PasswordResetRequestRow[] };
      })
      .then((data) => {
        if (active) {
          setRequests(data.requests ?? []);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Gagal memuat pengajuan reset.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      await loadRequests();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat pengajuan reset.");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAction(request: PasswordResetRequestRow, action: "issue" | "revoke" | "reject") {
    const memberName = request.displayName || request.nickname || request.email;
    if (
      action === "issue" &&
      !confirm(`Pastikan identitas ${memberName} sudah diverifikasi melalui kanal tepercaya sebelum membuat tautan reset.`)
    ) {
      return;
    }
    if (
      action === "revoke" &&
      !confirm(`Cabut tautan reset untuk ${memberName}? Tautan itu tidak akan bisa digunakan lagi.`)
    ) {
      return;
    }
    if (
      action === "reject" &&
      !confirm(`Tolak pengajuan reset kata sandi dari ${memberName}?`)
    ) {
      return;
    }

    setBusyId(request.id);
    setError(null);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/password-reset-requests/${request.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Gagal memproses pengajuan reset.");

      if (action === "issue") {
        if (typeof data.resetUrl !== "string" || typeof data.expiresAt !== "string") {
          throw new Error("Tautan reset tidak diterima. Muat ulang pengajuan lalu coba lagi.");
        }
        setIssuedLinks((current) => ({
          ...current,
          [request.id]: { url: data.resetUrl, expiresAt: data.expiresAt },
        }));
        setFeedback(`Tautan untuk ${memberName} siap. Tautan berlaku 30 menit; kirim hanya lewat kanal tepercaya.`);
      } else if (action === "revoke") {
        setIssuedLinks((current) => {
          const next = { ...current };
          delete next[request.id];
          return next;
        });
        setFeedback(`Tautan reset untuk ${memberName} sudah dicabut.`);
      } else {
        setIssuedLinks((current) => {
          const next = { ...current };
          delete next[request.id];
          return next;
        });
        setFeedback(`Pengajuan ${memberName} ditolak.`);
      }
      await loadRequests();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Koneksi gagal saat memproses pengajuan reset.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopy(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1800);
    } catch {
      setError("Tidak bisa menyalin tautan otomatis. Pilih tautan yang tampil lalu salin secara manual.");
    }
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-amber-500/35 bg-surface shadow-2xs">
      <div className="flex min-w-0 items-center gap-2 px-4 py-3.5">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-sm font-bold text-[#205ac4] dark:text-[#e8cf75]">Pemulihan Kata Sandi</h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${requests.length > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-surface-2 text-muted"}`}>
                {loading ? "…" : `${requests.length} menunggu`}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-ink-soft">
              Verifikasi member sebelum membuat tautan reset satu kali.
            </p>
          </div>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-soft">
            <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180 text-ink" : ""}`} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={loading || refreshing}
          title="Muat ulang pengajuan reset"
          aria-label="Muat ulang pengajuan reset kata sandi"
          className="shrink-0 rounded-full bg-surface-2 p-2 text-ink-soft transition hover:bg-line hover:text-ink disabled:opacity-50"
        >
          <RefreshIcon className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="min-w-0 space-y-3 border-t border-line p-4">
          <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
            Verifikasi identitas melalui kanal yang sudah dikenal. Email atau nomor yang dicantumkan sendiri pada formulir bukan bukti kepemilikan. Tautan mentah hanya ditampilkan sekali setelah dibuat—salin dan kirim secara pribadi.
          </p>

          {error && (
            <p className="break-words rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-600 dark:text-rose-300">
              {error}
            </p>
          )}
          {feedback && (
            <p className="break-words rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              {feedback}
            </p>
          )}

          {loading ? (
            <div className="rounded-xl border border-line bg-surface-2/50 px-3 py-4 text-center text-xs text-muted">
              Memuat pengajuan reset...
            </div>
          ) : requests.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-center text-xs text-muted">
              Tidak ada pengajuan pemulihan kata sandi yang menunggu.
            </p>
          ) : (
            <div className="space-y-2.5">
              {requests.map((request) => {
                const memberName = request.displayName || request.nickname || request.email.split("@")[0];
                const issuedLink = issuedLinks[request.id];
                const busy = busyId === request.id;
                return (
                  <article key={request.id} className="min-w-0 space-y-3 rounded-xl border border-line bg-surface-2/40 p-3.5">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold text-[#205ac4] dark:text-[#e8cf75]">{memberName}</p>
                        <p className="break-all text-xs text-muted">{request.email}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[10px] font-medium text-muted ring-1 ring-line">
                        Diajukan {formatDate(request.createdAt)}
                      </span>
                    </div>

                    {request.contactInfo ? (
                      <div className="rounded-lg bg-surface px-3 py-2 text-xs text-ink-soft">
                        <span className="font-semibold text-[#205ac4] dark:text-[#e8cf75]">Kontak tambahan: </span>
                        <span className="break-words">{request.contactInfo}</span>
                      </div>
                    ) : (
                      <p className="text-[11px] italic text-muted">Member tidak menambahkan kontak tambahan.</p>
                    )}

                    {request.activeLinkExpiresAt && !issuedLink && (
                      <p className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                        Ada tautan reset aktif hingga {formatDate(request.activeLinkExpiresAt)}. Tautan lama dapat dicabut atau diganti dengan tautan baru.
                      </p>
                    )}
                    {request.lastIssuedAt && !request.activeLinkExpiresAt && !issuedLink && (
                      <p className="text-[11px] leading-relaxed text-muted">
                        Tautan pernah dibuat {formatDate(request.lastIssuedAt)}, tetapi sekarang sudah tidak aktif (mungkin kedaluwarsa, dipakai, atau dicabut).
                      </p>
                    )}

                    {issuedLink && (
                      <div className="space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
                        <p className="text-xs font-semibold text-[#205ac4] dark:text-[#e8cf75]">Tautan reset — kedaluwarsa {formatDate(issuedLink.expiresAt)}</p>
                        <p className="break-all rounded-lg bg-surface px-2.5 py-2 font-mono text-[11px] leading-relaxed text-ink select-all">
                          {issuedLink.url}
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleCopy(request.id, issuedLink.url)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-surface-2 hover:text-ink"
                        >
                          {copiedId === request.id ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                          {copiedId === request.id ? "Tersalin" : "Salin tautan"}
                        </button>
                      </div>
                    )}

                    <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAction(request, "issue")}
                        className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-50"
                      >
                        {busy ? "Memproses..." : request.lastIssuedAt || issuedLink ? "Buat tautan baru" : "Buat tautan reset"}
                      </button>
                      {(request.activeLinkExpiresAt || issuedLink) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleAction(request, "revoke")}
                          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber-500/35 bg-amber-500/[0.06] px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-500/15 dark:text-amber-300 disabled:opacity-50"
                        >
                          Cabut tautan
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAction(request, "reject")}
                        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400 disabled:opacity-50"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                        Tolak
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
