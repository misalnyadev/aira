"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import { CheckIcon, RefreshIcon, XIcon } from "./icons";

type AdminUserRow = {
  id: string;
  email: string;
  displayName: string;
  nickname: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  characterQuota: number;
  effectiveLimit: number;
  characterCount: number;
  createdAt: string;
};

type PendingQuotaRow = {
  id: string;
  userId: string;
  requestedQuota: number;
  reason: string;
  status: string;
  adminNote: string;
  createdAt: string;
  email: string;
  displayName: string;
  nickname: string;
  currentQuota: number;
  characterCount: number;
};

type ResolvedQuotaRow = {
  id: string;
  userId: string;
  requestedQuota: number;
  reason: string;
  status: string;
  adminNote: string;
  createdAt: string;
  resolvedAt: string | null;
  email: string;
  displayName: string;
  nickname: string;
};

export function AdminPanelSection({
  currentAdminId,
  onAfterAction,
}: {
  currentAdminId: string;
  onAfterAction?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [pending, setPending] = useState<PendingQuotaRow[]>([]);
  const [resolved, setResolved] = useState<ResolvedQuotaRow[]>([]);

  const [draftApprovedQuota, setDraftApprovedQuota] = useState<
    Record<string, number>
  >({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [draftUserQuota, setDraftUserQuota] = useState<Record<string, number>>(
    {}
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const res = await fetch("/api/admin/overview", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Gagal memuat panel Admin.");
    }
    const nextUsers = (data.users ?? []) as AdminUserRow[];
    const nextPending = (data.pendingRequests ?? []) as PendingQuotaRow[];
    const nextResolved = (data.recentResolved ?? []) as ResolvedQuotaRow[];

    setUsers(nextUsers);
    setPending(nextPending);
    setResolved(nextResolved);

    const quotaMap: Record<string, number> = {};
    for (const r of nextPending) {
      quotaMap[r.id] = r.requestedQuota;
    }
    setDraftApprovedQuota(quotaMap);

    const userQuotaMap: Record<string, number> = {};
    for (const u of nextUsers) {
      userQuotaMap[u.id] = u.characterQuota;
    }
    setDraftUserQuota(userQuotaMap);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadData();
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Gagal memuat panel Admin."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memuat panel Admin."
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function handleResolveRequest(
    reqRow: PendingQuotaRow,
    action: "approve" | "reject"
  ) {
    setBusyId(reqRow.id);
    setError(null);
    setFeedback(null);
    try {
      const approvedQuota =
        draftApprovedQuota[reqRow.id] ?? reqRow.requestedQuota;
      const adminNote = draftNotes[reqRow.id] ?? "";
      const res = await fetch(`/api/admin/quota-requests/${reqRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          approvedQuota,
          adminNote,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Gagal memproses pengajuan.");
        return;
      }
      setFeedback(
        action === "approve"
          ? `Kuota ${reqRow.displayName || reqRow.email} disetujui menjadi ${data.appliedQuota ?? approvedQuota} karakter.`
          : `Pengajuan dari ${reqRow.displayName || reqRow.email} ditolak.`
      );
      await loadData();
      onAfterAction?.();
    } catch {
      setError("Koneksi gagal saat memproses pengajuan.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveUserQuota(u: AdminUserRow) {
    const nextQuota = draftUserQuota[u.id] ?? u.characterQuota;
    setBusyId(`user:${u.id}`);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterQuota: nextQuota }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan kuota pengguna.");
        return;
      }
      setFeedback(
        `Kuota karakter ${u.displayName || u.email} diperbarui menjadi ${nextQuota}.`
      );
      await loadData();
      onAfterAction?.();
    } catch {
      setError("Koneksi gagal saat memperbarui kuota pengguna.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleAdmin(u: AdminUserRow) {
    const nextAdmin = !u.isAdmin;
    const msg = nextAdmin
      ? `Jadikan ${u.email} sebagai Admin?`
      : `Ubah ${u.email} kembali menjadi pengguna biasa?`;
    if (!confirm(msg)) return;

    setBusyId(`role:${u.id}`);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isAdmin: nextAdmin,
          ...(nextAdmin ? {} : { characterQuota: Math.min(u.characterQuota, 5) }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Gagal mengubah peran pengguna.");
        return;
      }
      setFeedback(
        nextAdmin
          ? `${u.email} sekarang berstatus Admin.`
          : `${u.email} diubah menjadi pengguna standar.`
      );
      await loadData();
      onAfterAction?.();
    } catch {
      setError("Koneksi gagal saat mengubah peran pengguna.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4 border-t border-line pt-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Panel Admin · Kuota &amp; Pengguna
            </h2>
            {pending.length > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-bold text-amber-700 dark:text-amber-300">
                {pending.length} menunggu
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-ink-soft">
            Pengguna standar mendapat 1 slot karakter bawaan dan harus meminta izin Admin untuk menambah slot.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={loading || refreshing}
          title="Muat ulang data pengguna & permintaan"
          aria-label="Muat ulang data panel Admin"
          className="rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
        >
          <RefreshIcon
            className={`h-4 w-4 ${loading || refreshing ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
          {error}
        </p>
      )}

      {feedback && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          ✓ {feedback}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-muted">Memuat daftar pengguna &amp; pengajuan kuota...</p>
      ) : (
        <>
          {/* Permintaan Slot Menunggu Persetujuan */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-ink">
              Permintaan Tambah Slot ({pending.length})
            </h3>

            {pending.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-xs text-muted">
                Belum ada pengajuan penambahan slot karakter yang menunggu.
              </p>
            ) : (
              pending.map((r) => {
                const nameLabel =
                  r.displayName || r.nickname || r.email.split("@")[0];
                const quotaVal =
                  draftApprovedQuota[r.id] ?? r.requestedQuota;
                const isBusy = busyId === r.id;

                return (
                  <div
                    key={r.id}
                    className="space-y-2.5 rounded-xl border border-amber-500/35 bg-amber-500/[0.06] p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {nameLabel}
                        </p>
                        <p className="truncate text-xs text-muted">{r.email}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-ink ring-1 ring-line">
                        {r.characterCount}/{r.currentQuota} → minta{" "}
                        {r.requestedQuota} slot
                      </span>
                    </div>

                    {r.reason ? (
                      <p className="rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-ink-soft">
                        “{r.reason}”
                      </p>
                    ) : (
                      <p className="text-[11px] italic text-muted">
                        Tanpa catatan alasan.
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-ink-soft">
                        Slot disetujui jadi:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setDraftApprovedQuota((prev) => ({
                              ...prev,
                              [r.id]: Math.max(1, quotaVal - 1),
                            }))
                          }
                          className="h-7 w-7 rounded-lg border border-line bg-surface text-xs font-bold text-ink hover:bg-surface-2"
                        >
                          -
                        </button>
                        <span className="min-w-[2.2rem] text-center text-xs font-bold text-ink">
                          {quotaVal}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftApprovedQuota((prev) => ({
                              ...prev,
                              [r.id]: Math.min(30, quotaVal + 1),
                            }))
                          }
                          className="h-7 w-7 rounded-lg border border-line bg-surface text-xs font-bold text-ink hover:bg-surface-2"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <input
                      type="text"
                      value={draftNotes[r.id] ?? ""}
                      onChange={(e) =>
                        setDraftNotes((prev) => ({
                          ...prev,
                          [r.id]: e.target.value,
                        }))
                      }
                      placeholder="Catatan singkat untuk pengguna (opsional)..."
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                    />

                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleResolveRequest(r, "approve")}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-50"
                      >
                        <CheckIcon className="h-3.5 w-3.5" />
                        Setujui ({quotaVal} slot)
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleResolveRequest(r, "reject")}
                        className="inline-flex items-center justify-center gap-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400 disabled:opacity-50"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                        Tolak
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Daftar Seluruh Pengguna */}
          <div className="space-y-2 pt-1">
            <h3 className="text-xs font-semibold text-ink">
              Daftar Pengguna Terdaftar ({users.length})
            </h3>
            <div className="space-y-2">
              {users.map((u) => {
                const label =
                  u.displayName || u.nickname || u.email.split("@")[0];
                const isSelf = u.id === currentAdminId;
                const qVal = draftUserQuota[u.id] ?? u.characterQuota;
                const quotaDirty = !u.isAdmin && qVal !== u.characterQuota;
                const savingQuota = busyId === `user:${u.id}`;
                const savingRole = busyId === `role:${u.id}`;

                return (
                  <div
                    key={u.id}
                    className="rounded-xl border border-line bg-surface p-3"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={label} src={u.avatarUrl} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-ink">
                            {label}
                          </span>
                          {u.isAdmin ? (
                            <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-surface">
                              Admin
                            </span>
                          ) : (
                            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
                              User
                            </span>
                          )}
                          {isSelf && (
                            <span className="text-[10.5px] text-muted">
                              (kamu)
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted">
                          {u.email} · {u.characterCount}/
                          {u.isAdmin ? u.effectiveLimit : u.characterQuota}{" "}
                          karakter dibuat
                        </p>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
                      {u.isAdmin ? (
                        <span className="text-[11px] text-muted">
                          Kuota penuh Admin ({u.effectiveLimit} karakter)
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-ink-soft">
                            Kuota slot:
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftUserQuota((prev) => ({
                                ...prev,
                                [u.id]: Math.max(1, qVal - 1),
                              }))
                            }
                            className="h-6 w-6 rounded-md border border-line bg-surface-2 text-xs font-bold text-ink hover:bg-line"
                          >
                            -
                          </button>
                          <span className="min-w-[1.8rem] text-center text-xs font-bold text-ink">
                            {qVal}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setDraftUserQuota((prev) => ({
                                ...prev,
                                [u.id]: Math.min(30, qVal + 1),
                              }))
                            }
                            className="h-6 w-6 rounded-md border border-line bg-surface-2 text-xs font-bold text-ink hover:bg-line"
                          >
                            +
                          </button>
                          {quotaDirty && (
                            <button
                              type="button"
                              disabled={savingQuota}
                              onClick={() => void handleSaveUserQuota(u)}
                              className="ml-1 rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-50"
                            >
                              {savingQuota ? "..." : "Simpan"}
                            </button>
                          )}
                        </div>
                      )}

                      {!isSelf && (
                        <button
                          type="button"
                          disabled={savingRole}
                          onClick={() => void handleToggleAdmin(u)}
                          className="text-[11px] font-medium text-ink-soft underline decoration-dotted hover:text-ink disabled:opacity-50"
                        >
                          {u.isAdmin ? "Ubah jadi User" : "Jadikan Admin"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {resolved.length > 0 && (
            <details className="rounded-xl border border-line px-3 py-2.5">
              <summary className="cursor-pointer text-xs font-semibold text-ink-soft">
                Riwayat Keputusan Kuota Terakhir ({resolved.length})
              </summary>
              <div className="mt-2.5 space-y-1.5">
                {resolved.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-xs"
                  >
                    <span className="min-w-0 truncate text-ink-soft">
                      {h.displayName || h.email} · {h.requestedQuota} slot
                      {h.adminNote ? ` — “${h.adminNote}”` : ""}
                    </span>
                    <span
                      className={`shrink-0 font-semibold ${
                        h.status === "approved"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-500"
                      }`}
                    >
                      {h.status === "approved" ? "Disetujui" : "Ditolak"}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}
