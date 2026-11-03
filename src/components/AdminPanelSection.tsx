"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar } from "./Avatar";
import {
  CheckIcon,
  ChevronDownIcon,
  RefreshIcon,
  SearchIcon,
  XIcon,
} from "./icons";

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

type PendingAdminContactRow = {
  id: string;
  characterId: string;
  characterName: string;
  characterPin: string | null;
  ownerUserId: string;
  ownerEmail: string;
  ownerDisplayName: string;
  ownerNickname: string;
  guestUserId: string;
  guestEmail: string;
  guestDisplayName: string;
  guestNickname: string;
  adminStatus: string;
  ownerStatus: string;
  note: string;
  createdAt: string;
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
  const [pendingContacts, setPendingContacts] = useState<
    PendingAdminContactRow[]
  >([]);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "member">(
    "all"
  );
  const [requestsOpen, setRequestsOpen] = useState(true);
  const [contactsOpen, setContactsOpen] = useState(true);
  const [membersOpen, setMembersOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

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
    const nextContacts = (data.pendingContacts ??
      []) as PendingAdminContactRow[];

    setUsers(nextUsers);
    setPending(nextPending);
    setResolved(nextResolved);
    setPendingContacts(nextContacts);

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
          ? `Kuota ${reqRow.displayName || reqRow.email} disetujui menjadi ${data.appliedQuota ?? approvedQuota} slot karakter.`
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

  async function handleResolveContact(
    cRow: PendingAdminContactRow,
    action: "approve" | "reject"
  ) {
    setBusyId(`contact:${cRow.id}`);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/contacts/${cRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Gagal memproses persetujuan kontak.");
        return;
      }
      const guestLabel =
        cRow.guestDisplayName || cRow.guestNickname || cRow.guestEmail;
      setFeedback(
        action === "approve"
          ? `Sambungan kontak ${guestLabel} → ${cRow.characterName} disetujui.`
          : `Permintaan kontak ${guestLabel} → ${cRow.characterName} ditolak.`
      );
      await loadData();
      onAfterAction?.();
    } catch {
      setError("Koneksi gagal saat memproses persetujuan kontak.");
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
        setError(data.error || "Gagal menyimpan kuota member.");
        return;
      }
      setFeedback(
        `Kuota karakter ${u.displayName || u.email} diperbarui menjadi ${nextQuota} slot.`
      );
      await loadData();
      onAfterAction?.();
    } catch {
      setError("Koneksi gagal saat memperbarui kuota member.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleAdmin(u: AdminUserRow) {
    const nextAdmin = !u.isAdmin;
    const msg = nextAdmin
      ? `Jadikan ${u.email} sebagai Admin?`
      : `Ubah ${u.email} kembali menjadi Member standar?`;
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
        setError(data.error || "Gagal mengubah peran akun.");
        return;
      }
      setFeedback(
        nextAdmin
          ? `${u.email} sekarang berstatus Admin.`
          : `${u.email} diubah menjadi Member standar.`
      );
      await loadData();
      onAfterAction?.();
    } catch {
      setError("Koneksi gagal saat mengubah peran akun.");
    } finally {
      setBusyId(null);
    }
  }

  const totalCharacters = useMemo(
    () => users.reduce((acc, u) => acc + (u.characterCount || 0), 0),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter === "admin" && !u.isAdmin) return false;
      if (roleFilter === "member" && u.isAdmin) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.nickname.toLowerCase().includes(q)
      );
    });
  }, [users, query, roleFilter]);

  return (
    <div className="mx-auto max-w-2xl space-y-3.5">
      {/* Header Ringkasan Panel Admin */}
      <div className="rounded-2xl border border-line bg-surface p-4 shadow-2xs">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-ink">
              Pusat Pengelolaan Admin &amp; Member
            </h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              Kelola peran akun, kuota slot karakter tiap member, dan permintaan slot masuk.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={loading || refreshing}
            title="Muat ulang data Admin"
            aria-label="Muat ulang data panel Admin"
            className="rounded-full bg-surface-2 p-2 text-ink-soft transition hover:bg-line hover:text-ink disabled:opacity-50"
          >
            <RefreshIcon
              className={`h-4 w-4 ${loading || refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        <div className="mt-3.5 grid grid-cols-4 gap-2">
          <div className="rounded-xl bg-surface-2/70 px-2.5 py-2.5 text-center">
            <span className="block text-base font-extrabold text-ink">
              {loading ? "…" : users.length}
            </span>
            <span className="text-[11px] text-muted">Akun</span>
          </div>
          <div
            className={`rounded-xl px-2.5 py-2.5 text-center ${
              pending.length > 0
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                : "bg-surface-2/70 text-ink"
            }`}
          >
            <span className="block text-base font-extrabold">
              {loading ? "…" : pending.length}
            </span>
            <span className="text-[11px] opacity-80">Req Slot</span>
          </div>
          <div
            className={`rounded-xl px-2.5 py-2.5 text-center ${
              pendingContacts.length > 0
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                : "bg-surface-2/70 text-ink"
            }`}
          >
            <span className="block text-base font-extrabold">
              {loading ? "…" : pendingContacts.length}
            </span>
            <span className="text-[11px] opacity-80">Req PIN</span>
          </div>
          <div className="rounded-xl bg-surface-2/70 px-2.5 py-2.5 text-center">
            <span className="block text-base font-extrabold text-ink">
              {loading ? "…" : totalCharacters}
            </span>
            <span className="text-[11px] text-muted">Karakter</span>
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-300">
          {error}
        </p>
      )}

      {feedback && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
          ✓ {feedback}
        </p>
      )}

      {loading ? (
        <div className="rounded-2xl border border-line bg-surface p-6 text-center text-xs text-muted">
          Memuat daftar member &amp; pengajuan slot...
        </div>
      ) : (
        <>
          {/* 1. Permintaan Tambah Slot (Dropdown v) */}
          <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-2xs">
            <button
              type="button"
              onClick={() => setRequestsOpen((v) => !v)}
              aria-expanded={requestsOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-ink">
                    Permintaan Tambah Slot Karakter
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                      pending.length > 0
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "bg-surface-2 text-muted"
                    }`}
                  >
                    {pending.length} menunggu
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Setujui atau sesuaikan jumlah slot karakter yang diminta member
                </p>
              </div>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-soft">
                <ChevronDownIcon
                  className={`h-4 w-4 transition-transform duration-200 ${
                    requestsOpen ? "rotate-180 text-ink" : ""
                  }`}
                />
              </span>
            </button>

            {requestsOpen && (
              <div className="space-y-2.5 border-t border-line p-4">
                {pending.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-center text-xs text-muted">
                    Tidak ada pengajuan tambah slot yang menunggu saat ini.
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
                            <p className="truncate text-xs text-muted">
                              {r.email}
                            </p>
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
                          placeholder="Catatan singkat untuk member (opsional)..."
                          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                        />

                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleResolveRequest(r, "approve")
                            }
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-50"
                          >
                            <CheckIcon className="h-3.5 w-3.5" />
                            Setujui ({quotaVal} slot)
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleResolveRequest(r, "reject")
                            }
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
            )}
          </section>

          {/* 1B. Persetujuan Kontak PIN Karakter (Dropdown v) */}
          <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-2xs">
            <button
              type="button"
              onClick={() => setContactsOpen((v) => !v)}
              aria-expanded={contactsOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-ink">
                    Persetujuan Kontak PIN Karakter
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                      pendingContacts.length > 0
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "bg-surface-2 text-muted"
                    }`}
                  >
                    {pendingContacts.length} menunggu
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Setujui sambungan kontak antar-akun lewat PIN agar terkontrol
                </p>
              </div>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-soft">
                <ChevronDownIcon
                  className={`h-4 w-4 transition-transform duration-200 ${
                    contactsOpen ? "rotate-180 text-ink" : ""
                  }`}
                />
              </span>
            </button>

            {contactsOpen && (
              <div className="space-y-2.5 border-t border-line p-4">
                {pendingContacts.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-center text-xs text-muted">
                    Tidak ada permintaan sambungan kontak PIN yang menunggu saat ini.
                  </p>
                ) : (
                  pendingContacts.map((c) => {
                    const guestLabel =
                      c.guestDisplayName ||
                      c.guestNickname ||
                      c.guestEmail.split("@")[0];
                    const ownerLabel =
                      c.ownerDisplayName ||
                      c.ownerNickname ||
                      c.ownerEmail.split("@")[0];
                    const isBusy = busyId === `contact:${c.id}`;

                    return (
                      <div
                        key={c.id}
                        className="space-y-2.5 rounded-xl border border-amber-500/35 bg-amber-500/[0.06] p-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">
                              {guestLabel}{" "}
                              <span className="font-normal text-ink-soft">
                                mengundang
                              </span>{" "}
                              {c.characterName}
                            </p>
                            <p className="truncate text-xs text-muted">
                              {c.guestEmail} → pemilik: {ownerLabel}
                              {c.characterPin ? ` · PIN ${c.characterPin}` : ""}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-[10.5px] font-semibold text-ink ring-1 ring-line">
                            {c.ownerStatus === "approved"
                              ? "Pemilik setuju"
                              : "Menunggu pemilik"}
                          </span>
                        </div>

                        {c.note && (
                          <p className="rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-ink-soft">
                            “{c.note}”
                          </p>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleResolveContact(c, "approve")
                            }
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-50"
                          >
                            <CheckIcon className="h-3.5 w-3.5" />
                            Setujui Sambungan
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleResolveContact(c, "reject")
                            }
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
            )}
          </section>

          {/* 2. Daftar Admin & Member (Dropdown v) */}
          <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-2xs">
            <button
              type="button"
              onClick={() => setMembersOpen((v) => !v)}
              aria-expanded={membersOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-ink">
                    Daftar Akun Admin &amp; Member
                  </h3>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-ink-soft">
                    {users.length} akun
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Atur kuota slot karakter &amp; peran Admin/Member per akun
                </p>
              </div>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-soft">
                <ChevronDownIcon
                  className={`h-4 w-4 transition-transform duration-200 ${
                    membersOpen ? "rotate-180 text-ink" : ""
                  }`}
                />
              </span>
            </button>

            {membersOpen && (
              <div className="space-y-3 border-t border-line p-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="flex flex-1 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
                    <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Cari nama atau email member..."
                      className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-muted"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="text-muted hover:text-ink"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
                    {(
                      [
                        { id: "all", label: "Semua" },
                        { id: "admin", label: "Admin" },
                        { id: "member", label: "Member" },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setRoleFilter(f.id)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                          roleFilter === f.id
                            ? "bg-surface text-ink shadow-2xs"
                            : "text-ink-soft hover:text-ink"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredUsers.length === 0 ? (
                  <p className="py-3 text-center text-xs text-muted">
                    Tidak ada akun yang cocok dengan pencarian.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredUsers.map((u) => {
                      const label =
                        u.displayName || u.nickname || u.email.split("@")[0];
                      const isSelf = u.id === currentAdminId;
                      const qVal = draftUserQuota[u.id] ?? u.characterQuota;
                      const quotaDirty =
                        !u.isAdmin && qVal !== u.characterQuota;
                      const savingQuota = busyId === `user:${u.id}`;
                      const savingRole = busyId === `role:${u.id}`;

                      return (
                        <div
                          key={u.id}
                          className="rounded-xl border border-line bg-surface-2/30 p-3"
                        >
                          <div className="flex items-center gap-2.5">
                            <Avatar name={label} src={u.avatarUrl} size={38} />
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
                                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft ring-1 ring-line">
                                    Member
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
                                Akses penuh Admin ({u.effectiveLimit} karakter)
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-ink-soft">
                                  Slot karakter:
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDraftUserQuota((prev) => ({
                                      ...prev,
                                      [u.id]: Math.max(1, qVal - 1),
                                    }))
                                  }
                                  className="h-6 w-6 rounded-md border border-line bg-surface text-xs font-bold text-ink hover:bg-surface-2"
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
                                  className="h-6 w-6 rounded-md border border-line bg-surface text-xs font-bold text-ink hover:bg-surface-2"
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
                                {u.isAdmin ? "Ubah jadi Member" : "Jadikan Admin"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 3. Riwayat Keputusan Kuota (Dropdown v) */}
          {resolved.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-2xs">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                aria-expanded={historyOpen}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2/50"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-ink">
                    Riwayat Keputusan Kuota Terakhir
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {resolved.length} keputusan persetujuan/penolakan terbaru
                  </p>
                </div>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-soft">
                  <ChevronDownIcon
                    className={`h-4 w-4 transition-transform duration-200 ${
                      historyOpen ? "rotate-180 text-ink" : ""
                    }`}
                  />
                </span>
              </button>

              {historyOpen && (
                <div className="space-y-1.5 border-t border-line p-4">
                  {resolved.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-xs"
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
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
