"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { QuotaDiscussionMessage } from "@/types/chat";
import { Avatar } from "./Avatar";
import { QuotaDiscussionBox } from "./QuotaDiscussionBox";
import { PasswordResetRequestsSection } from "./PasswordResetRequestsSection";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  RefreshIcon,
  SearchIcon,
  XIcon,
} from "./icons";

type SignupInviteState = {
  code: string;
  enabled: boolean;
  source: "env" | "custom" | "closed";
  hasEnvDefault: boolean;
};

function randomInviteSuggestion(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let tail = "";
  for (let i = 0; i < 6; i++) {
    tail += chars[bytes[i] % chars.length];
  }
  return `aish-${tail}`;
}

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
  discussion?: QuotaDiscussionMessage[];
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
  discussion?: QuotaDiscussionMessage[];
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
  const [signupInvite, setSignupInvite] = useState<SignupInviteState | null>(
    null
  );
  const [showInviteCode, setShowInviteCode] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [draftInviteCode, setDraftInviteCode] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "member">(
    "all"
  );
  const [requestsOpen, setRequestsOpen] = useState(false);
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
    const nextInvite = (data.signupInvite ?? null) as SignupInviteState | null;

    setUsers(nextUsers);
    setPending(nextPending);
    setResolved(nextResolved);
    setSignupInvite(nextInvite);
    if (nextPending.length > 0) setRequestsOpen(true);

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

  async function handleCopyInviteCode() {
    if (!signupInvite?.code) return;
    try {
      await navigator.clipboard.writeText(signupInvite.code);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      // Abaikan bila clipboard ditolak browser.
    }
  }

  async function handlePatchInviteCode(
    mode: "custom" | "close" | "reset_env",
    explicitCode?: string
  ) {
    setBusyId("invite");
    setError(null);
    setFeedback(null);
    try {
      const code = (explicitCode ?? draftInviteCode).trim();
      const res = await fetch("/api/admin/invite-code", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Gagal menyimpan kode undangan.");
        return;
      }
      if (data.signupInvite) {
        setSignupInvite(data.signupInvite as SignupInviteState);
      }
      if (mode === "custom") {
        setDraftInviteCode("");
        setShowInviteCode(true);
        setFeedback("Kode undangan pendaftaran baru berhasil disimpan.");
      } else if (mode === "close") {
        setFeedback("Pendaftaran member baru ditutup sementara.");
      } else {
        setFeedback("Kode undangan dikembalikan ke nilai bawaan Vercel.");
      }
    } catch {
      setError("Koneksi gagal saat menyimpan kode undangan.");
    } finally {
      setBusyId(null);
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

  const filteredUsers = useMemo(
    () =>
      users.filter((u) => {
        if (roleFilter === "admin" && !u.isAdmin) return false;
        if (roleFilter === "member" && u.isAdmin) return false;
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
          u.email.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          u.nickname.toLowerCase().includes(q)
        );
      }),
    [users, query, roleFilter]
  );

  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl space-y-3.5">
      {/* Header Ringkasan Panel Admin */}
      <div className="min-w-0 rounded-2xl border border-accent/25 bg-surface p-4 shadow-2xs dark:border-accent/30">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-accent-text">
              Pusat Pengelolaan Admin &amp; Member
            </h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              Kelola kode undangan member, persetujuan kuota slot karakter, dan peran akun.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={loading || refreshing}
            title="Muat ulang data Admin"
            aria-label="Muat ulang data panel Admin"
            className="shrink-0 rounded-full bg-accent/10 p-2 text-accent-text ring-1 ring-accent/40 transition hover:bg-accent/20 dark:text-accent-text dark:ring-accent/45 dark:hover:bg-accent/20 disabled:opacity-50"
          >
            <RefreshIcon
              className={`h-4 w-4 ${loading || refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        <div className="mt-3.5 grid grid-cols-3 gap-2">
          <div className="min-w-0 rounded-xl bg-accent/10 dark:bg-surface-2/70 px-2 py-2.5 text-center">
            <span className="block truncate text-base font-extrabold text-accent-text">
              {loading ? "…" : users.length}
            </span>
            <span className="block truncate text-[11px] text-muted">Akun</span>
          </div>
          <div
            className={`min-w-0 rounded-xl px-2 py-2.5 text-center ${
              pending.length > 0
                ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                : "bg-accent/10 dark:bg-surface-2/70 text-ink"
            }`}
          >
            <span className="block truncate text-base font-extrabold">
              {loading ? "…" : pending.length}
            </span>
            <span className="block truncate text-[11px] opacity-80">
              Req Slot
            </span>
          </div>
          <div className="min-w-0 rounded-xl bg-accent/10 dark:bg-surface-2/70 px-2 py-2.5 text-center">
            <span className="block truncate text-base font-extrabold text-accent-text">
              {loading ? "…" : totalCharacters}
            </span>
            <span className="block truncate text-[11px] text-muted">
              Karakter
            </span>
          </div>
        </div>
      </div>

      {error && (
        <p className="break-words rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-300">
          {error}
        </p>
      )}

      {feedback && (
        <p className="break-words rounded-xl border border-accent/30 dark:border-accent/35 bg-accent/10 px-3.5 py-2.5 text-xs text-accent-text">
          ✓ {feedback}
        </p>
      )}

      {loading ? (
        <div className="rounded-2xl border border-accent/30 dark:border-accent/35 bg-surface p-6 text-center text-xs text-muted">
          Memuat daftar member &amp; pengajuan slot...
        </div>
      ) : (
        <>
          <PasswordResetRequestsSection />

          {/* 0. Kode Undangan Pendaftaran Member (Dropdown v) */}
          <section className="min-w-0 overflow-hidden rounded-2xl border border-accent/25 bg-surface shadow-2xs dark:border-accent/30">
            <button
              type="button"
              onClick={() => setInviteOpen((v) => !v)}
              aria-expanded={inviteOpen}
              className="flex w-full min-w-0 items-center justify-between gap-2.5 px-4 py-3.5 text-left transition hover:bg-accent/10 dark:hover:bg-surface-2/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-bold text-accent-text">
                    Kode Undangan Pendaftaran
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                      signupInvite?.enabled
                        ? "bg-accent/15 text-accent-text"
                        : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {signupInvite?.enabled
                      ? signupInvite.source === "custom"
                        ? "Aktif · Diatur Admin"
                        : "Aktif · Bawaan Vercel"
                      : "Pendaftaran Ditutup"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Lihat, salin, atau ganti kode invite pendaftaran akun baru tanpa redeploy
                </p>
              </div>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-text ring-1 ring-accent/40 dark:text-accent-text dark:ring-accent/45">
                <ChevronDownIcon
                  strokeWidth={1.6}
                  className={`h-4 w-4 transition-transform duration-200 ${
                    inviteOpen ? "rotate-180" : ""
                  }`}
                />
              </span>
            </button>

            {inviteOpen && (
              <div className="min-w-0 space-y-3 border-t border-accent/25 p-4 dark:border-accent/30">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/30 dark:border-accent/35 bg-accent/10 dark:bg-surface-2/50 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="block text-[11px] text-muted">
                      Kode undangan aktif saat ini
                    </span>
                    {signupInvite?.enabled && signupInvite.code ? (
                      <span className="mt-0.5 block break-all font-mono text-sm font-bold tracking-wider text-accent-text">
                        {showInviteCode
                          ? signupInvite.code
                          : "•".repeat(
                              Math.min(12, Math.max(6, signupInvite.code.length))
                            )}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-xs font-medium text-rose-500">
                        Belum aktif / pendaftaran ditutup
                      </span>
                    )}
                  </div>

                  {signupInvite?.enabled && signupInvite.code && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowInviteCode((v) => !v)}
                        title={showInviteCode ? "Sembunyikan kode" : "Lihat kode"}
                        aria-label={showInviteCode ? "Sembunyikan kode" : "Lihat kode"}
                        className="inline-flex items-center gap-1 rounded-lg border border-accent/30 dark:border-accent/35 bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-accent/10 dark:hover:bg-surface-2 hover:text-ink"
                      >
                        {showInviteCode ? (
                          <>
                            <EyeOffIcon className="h-3.5 w-3.5" /> Tutup
                          </>
                        ) : (
                          <>
                            <EyeIcon className="h-3.5 w-3.5" /> Lihat
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyInviteCode()}
                        className="inline-flex items-center gap-1 rounded-lg border border-accent/30 dark:border-accent/35 bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-accent/10 dark:hover:bg-surface-2 hover:text-ink"
                      >
                        <CopyIcon className="h-3.5 w-3.5" />
                        {inviteCopied ? "✓ Tersalin" : "Salin"}
                      </button>
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handlePatchInviteCode("custom");
                  }}
                  className="min-w-0 space-y-2"
                >
                  <label className="block text-xs font-medium text-ink-soft">
                    Ganti kode undangan baru (tidak membedakan huruf besar/kecil)
                  </label>
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={draftInviteCode}
                      onChange={(e) => setDraftInviteCode(e.target.value)}
                      placeholder="Ketik kode baru atau klik Acak..."
                      maxLength={64}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      className="w-full min-w-0 flex-1 rounded-xl border border-accent/30 dark:border-accent/35 bg-surface px-3 py-2 font-mono text-xs text-ink placeholder:font-sans placeholder:text-muted focus:border-accent-text focus:outline-none"
                    />
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setDraftInviteCode(randomInviteSuggestion())
                        }
                        className="flex-1 rounded-xl border border-accent/30 dark:border-accent/35 bg-accent/10 dark:bg-surface-2 px-3 py-2 text-xs font-semibold text-ink-soft transition hover:bg-accent/20 dark:hover:bg-line/60 hover:text-ink sm:flex-none"
                      >
                        Acak
                      </button>
                      <button
                        type="submit"
                        disabled={
                          busyId === "invite" ||
                          draftInviteCode.trim().length < 4
                        }
                        className="flex-1 rounded-xl bg-brand px-3.5 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-50 sm:flex-none"
                      >
                        {busyId === "invite" ? "..." : "Simpan"}
                      </button>
                    </div>
                  </div>
                </form>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-accent/30 dark:border-accent/35 pt-2.5">
                  <span className="text-[11px] text-muted">
                    Langsung berlaku tanpa perlu redeploy Vercel.
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {signupInvite?.source !== "env" &&
                      signupInvite?.hasEnvDefault && (
                        <button
                          type="button"
                          disabled={busyId === "invite"}
                          onClick={() => void handlePatchInviteCode("reset_env")}
                          className="text-[11px] font-semibold text-ink-soft underline decoration-dotted hover:text-ink disabled:opacity-50"
                        >
                          Pakai bawaan Vercel
                        </button>
                      )}
                    {signupInvite?.enabled && (
                      <button
                        type="button"
                        disabled={busyId === "invite"}
                        onClick={() => {
                          if (!confirm("Tutup sementara pendaftaran akun baru?"))
                            return;
                          void handlePatchInviteCode("close");
                        }}
                        className="text-[11px] font-semibold text-rose-500 underline decoration-dotted hover:text-rose-600 disabled:opacity-50"
                      >
                        Tutup pendaftaran
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 1. Permintaan Tambah Slot (Dropdown v) */}
          <section className="min-w-0 overflow-hidden rounded-2xl border border-accent/25 bg-surface shadow-2xs dark:border-accent/30">
            <button
              type="button"
              onClick={() => setRequestsOpen((v) => !v)}
              aria-expanded={requestsOpen}
              className="flex w-full min-w-0 items-center justify-between gap-2.5 px-4 py-3.5 text-left transition hover:bg-accent/10 dark:hover:bg-surface-2/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-bold text-accent-text">
                    Permintaan Tambah Slot Karakter
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                      pending.length > 0
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "bg-accent/10 dark:bg-surface-2 text-muted"
                    }`}
                  >
                    {pending.length} menunggu
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Setujui atau sesuaikan jumlah slot karakter yang diminta member
                </p>
              </div>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-text ring-1 ring-accent/40 dark:text-accent-text dark:ring-accent/45">
                <ChevronDownIcon
                  strokeWidth={1.6}
                  className={`h-4 w-4 transition-transform duration-200 ${
                    requestsOpen ? "rotate-180" : ""
                  }`}
                />
              </span>
            </button>

            {requestsOpen && (
              <div className="min-w-0 space-y-2.5 border-t border-accent/25 p-4 dark:border-accent/30">
                {pending.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-accent/30 dark:border-accent/35 px-3.5 py-3 text-center text-xs text-muted">
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
                        className="min-w-0 space-y-2.5 rounded-xl border border-amber-500/35 bg-amber-500/[0.06] p-3.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-accent-text">
                              {nameLabel}
                            </p>
                            <p className="truncate text-xs text-muted">
                              {r.email}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-accent-text ring-1 ring-accent/30 dark:ring-accent/35">
                            {r.characterCount}/{r.currentQuota} → minta{" "}
                            {r.requestedQuota} slot
                          </span>
                        </div>

                        {r.reason ? (
                          <p className="whitespace-pre-wrap break-words rounded-lg bg-surface px-3 py-2 text-xs leading-relaxed text-ink-soft">
                            “{r.reason}”
                          </p>
                        ) : (
                          <p className="text-[11px] italic text-muted">
                            Tanpa catatan alasan.
                          </p>
                        )}

                        <QuotaDiscussionBox
                          viewerRole="admin"
                          requestId={r.id}
                          memberLabel={nameLabel}
                          messages={r.discussion ?? []}
                          onMessagesChange={(nextMsgs) =>
                            setPending((prev) =>
                              prev.map((item) =>
                                item.id === r.id
                                  ? { ...item, discussion: nextMsgs }
                                  : item
                              )
                            )
                          }
                          onPollRefresh={loadData}
                        />

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
                              className="h-7 w-7 rounded-lg border border-accent/30 dark:border-accent/35 bg-surface text-xs font-bold text-ink hover:bg-accent/10 dark:hover:bg-surface-2"
                            >
                              -
                            </button>
                            <span className="min-w-[2.2rem] text-center text-xs font-bold text-accent-text">
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
                              className="h-7 w-7 rounded-lg border border-accent/30 dark:border-accent/35 bg-surface text-xs font-bold text-ink hover:bg-accent/10 dark:hover:bg-surface-2"
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
                          className="w-full min-w-0 rounded-xl border border-accent/30 dark:border-accent/35 bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-accent-text focus:outline-none"
                        />

                        <div className="flex min-w-0 gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleResolveRequest(r, "approve")
                            }
                            className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-50"
                          >
                            <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                              Setujui ({quotaVal} slot)
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleResolveRequest(r, "reject")
                            }
                            className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl border border-accent/30 dark:border-accent/35 bg-surface px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-400 disabled:opacity-50"
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
          <section className="min-w-0 overflow-hidden rounded-2xl border border-accent/25 bg-surface shadow-2xs dark:border-accent/30">
            <button
              type="button"
              onClick={() => setMembersOpen((v) => !v)}
              aria-expanded={membersOpen}
              className="flex w-full min-w-0 items-center justify-between gap-2.5 px-4 py-3.5 text-left transition hover:bg-accent/10 dark:hover:bg-surface-2/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-sm font-bold text-accent-text">
                    Daftar Akun Admin &amp; Member
                  </h3>
                  <span className="shrink-0 rounded-full bg-accent/10 dark:bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-ink-soft">
                    {users.length} akun
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Atur kuota slot karakter &amp; peran Admin/Member per akun
                </p>
              </div>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-text ring-1 ring-accent/40 dark:text-accent-text dark:ring-accent/45">
                <ChevronDownIcon
                  strokeWidth={1.6}
                  className={`h-4 w-4 transition-transform duration-200 ${
                    membersOpen ? "rotate-180" : ""
                  }`}
                />
              </span>
            </button>

            {membersOpen && (
              <div className="min-w-0 space-y-3 border-t border-accent/25 p-4 dark:border-accent/30">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-accent/10 dark:bg-surface-2 px-3 py-2">
                    <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Cari nama atau email member..."
                      className="w-full min-w-0 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="shrink-0 text-muted hover:text-ink"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-accent/10 dark:bg-surface-2 p-1">
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
                        className={`min-w-0 truncate rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                          roleFilter === f.id
                            ? "bg-surface text-accent-text shadow-2xs ring-1 ring-accent/35 dark:text-accent-text dark:ring-accent/40"
                            : "text-ink-soft hover:text-accent-text"
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
                  <div className="min-w-0 space-y-2">
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
                          className="min-w-0 rounded-xl border border-accent/30 dark:border-accent/35 bg-accent/10 dark:bg-surface-2/30 p-3"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar name={label} src={u.avatarUrl} size={38} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-sm font-semibold text-accent-text">
                                  {label}
                                </span>
                                {u.isAdmin ? (
                                  <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent-text dark:bg-accent/15 dark:text-accent-text">
                                    Admin
                                  </span>
                                ) : (
                                  <span className="shrink-0 rounded-full bg-accent/10 dark:bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-ink-soft ring-1 ring-accent/30 dark:ring-accent/35">
                                    Member
                                  </span>
                                )}
                                {isSelf && (
                                  <span className="shrink-0 text-[10.5px] text-muted">
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

                          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-accent/30 dark:border-accent/35 pt-2.5">
                            {u.isAdmin ? (
                              <span className="text-[11px] text-muted">
                                Akses penuh Admin ({u.effectiveLimit} karakter)
                              </span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1.5">
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
                                  className="h-6 w-6 rounded-md border border-accent/30 dark:border-accent/35 bg-surface text-xs font-bold text-ink hover:bg-accent/10 dark:hover:bg-surface-2"
                                >
                                  -
                                </button>
                                <span className="min-w-[1.8rem] text-center text-xs font-bold text-accent-text">
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
                                  className="h-6 w-6 rounded-md border border-accent/30 dark:border-accent/35 bg-surface text-xs font-bold text-ink hover:bg-accent/10 dark:hover:bg-surface-2"
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
            <section className="min-w-0 overflow-hidden rounded-2xl border border-accent/25 bg-surface shadow-2xs dark:border-accent/30">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                aria-expanded={historyOpen}
                className="flex w-full min-w-0 items-center justify-between gap-2.5 px-4 py-3.5 text-left transition hover:bg-accent/10 dark:hover:bg-surface-2/50"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-accent-text">
                    Riwayat Keputusan Kuota Terakhir
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {resolved.length} keputusan persetujuan/penolakan terbaru
                  </p>
                </div>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-text ring-1 ring-accent/40 dark:text-accent-text dark:ring-accent/45">
                  <ChevronDownIcon
                  strokeWidth={1.6}
                    className={`h-4 w-4 transition-transform duration-200 ${
                      historyOpen ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </button>

              {historyOpen && (
                <div className="min-w-0 space-y-2 border-t border-accent/25 p-4 dark:border-accent/30">
                  {resolved.map((h) => (
                    <div
                      key={h.id}
                      className="min-w-0 space-y-1.5 rounded-lg bg-accent/10 dark:bg-surface-2/60 px-3 py-2 text-xs"
                    >
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-ink-soft">
                          {h.displayName || h.email} · {h.requestedQuota} slot
                          {h.adminNote ? ` — “${h.adminNote}”` : ""}
                        </span>
                        <span
                          className={`shrink-0 font-semibold ${
                            h.status === "approved"
                              ? "text-accent-text"
                              : "text-rose-500"
                          }`}
                        >
                          {h.status === "approved" ? "Disetujui" : "Ditolak"}
                        </span>
                      </div>
                      {h.discussion && h.discussion.length > 0 && (
                        <QuotaDiscussionBox
                          viewerRole="admin"
                          memberLabel={h.displayName || h.email.split("@")[0]}
                          messages={h.discussion}
                          readOnly
                        />
                      )}
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
