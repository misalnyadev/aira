"use client";

import { useRef, useState } from "react";
import type { QuotaRequestSummary } from "@/types/chat";
import type { UserProfile } from "@/lib/userProfile";
import { GENDER_OPTIONS, type Gender } from "@/lib/gender";
import { compressImageFile } from "@/lib/compressImage";
import { uploadAvatarImage } from "@/lib/avatarUploadClient";
import { useKeepFieldVisible } from "@/lib/keepFieldVisible";
import {
  MAX_ABOUT_CHARS,
  MAX_AGE,
  MAX_CHARACTERS,
  MAX_DISPLAY_NAME_CHARS,
  MAX_NICKNAME_CHARS,
  MAX_OCCUPATION_CHARS,
  MIN_AGE,
} from "@/lib/limits";
import { AdminPanelSection } from "./AdminPanelSection";
import { useAuth } from "./AuthGate";
import { Avatar } from "./Avatar";
import { AvatarCropModal } from "./AvatarCropModal";
import { MenuHeader, MenuHeaderIconButton } from "./MenuHeader";
import {
  BibleOutlineIcon,
  CameraIcon,
  ChatSquareIcon,
  CheckIcon,
  ChevronDownIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SettingsIcon,
  TrashIcon,
} from "./icons";
import { QuotaDiscussionBox } from "./QuotaDiscussionBox";
import type { CharacterSummary } from "@/types/chat";

export type ProfileTab = "identity" | "account" | "admin";

const FIELD =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink outline-none transition placeholder:text-muted focus:border-ink sm:text-sm";

function charCount(value: string, max: number) {
  const over = value.length > max;
  return (
    <span className={over ? "text-rose-500" : "text-muted"}>
      {value.length} / {max}
    </span>
  );
}

export function ProfileView({
  profile,
  onSaved,
  onOpenSettings,
  initialTab = "identity",
  onTabChange,
  isAdmin = false,
  characterCount = 0,
  characterLimit = MAX_CHARACTERS,
  latestQuotaRequest = null,
  pendingQuotaRequestsCount = 0,
  pendingOwnerContactsCount = 0,
  characters = [],
  onQuotaChanged,
  onChatCharacter,
  onNewCharacter,
  onOpenCharacterProfile,
  onEditCharacter,
  onDeleteCharacter,
  onOpenContactsModal,
}: {
  profile: UserProfile;
  onSaved: (next: UserProfile) => void;
  onOpenSettings: () => void;
  initialTab?: ProfileTab;
  onTabChange?: (tab: ProfileTab) => void;
  isAdmin?: boolean;
  characterCount?: number;
  characterLimit?: number;
  latestQuotaRequest?: QuotaRequestSummary | null;
  pendingQuotaRequestsCount?: number;
  pendingOwnerContactsCount?: number;
  characters?: CharacterSummary[];
  onQuotaChanged?: () => Promise<void> | void;
  onChatCharacter?: (id: string) => void;
  onNewCharacter?: () => void;
  onOpenCharacterProfile?: (id: string) => void;
  onEditCharacter?: (id: string) => void;
  onDeleteCharacter?: (id: string) => void;
  onOpenContactsModal?: () => void;
}) {
  const { user, signOut } = useAuth();
  const effectiveIsAdmin = Boolean(isAdmin || user.isAdmin);

  const [tab, setTab] = useState<ProfileTab>(() =>
    initialTab === "admin" && !effectiveIsAdmin ? "account" : initialTab
  );

  const [displayName, setDisplayName] = useState(
    profile.displayName.slice(0, MAX_DISPLAY_NAME_CHARS)
  );
  const [nickname, setNickname] = useState(
    profile.nickname.slice(0, MAX_NICKNAME_CHARS)
  );
  const [gender, setGender] = useState<Gender>(profile.gender ?? "");
  const [age, setAge] = useState(profile.age ? String(profile.age) : "");
  const [occupation, setOccupation] = useState(profile.occupation);
  const [about, setAbout] = useState(profile.about);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    profile.avatarUrl ?? null
  );
  const [cropSource, setCropSource] = useState<File | string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State tab Akun & Kuota Member
  const [signingOut, setSigningOut] = useState(false);
  const [addSlots, setAddSlots] = useState(1);
  const [reqReason, setReqReason] = useState("");
  const [reqBusy, setReqBusy] = useState(false);
  const [reqFeedback, setReqFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const [charsOpen, setCharsOpen] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useKeepFieldVisible(scrollRef, true);

  function selectTab(next: ProfileTab) {
    const resolved = next === "admin" && !effectiveIsAdmin ? "account" : next;
    setTab(resolved);
    onTabChange?.(resolved);
  }

  async function uploadCroppedAvatar(file: File) {
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImageFile(file, {
        maxSize: 512,
        quality: 0.86,
      });
      const url = await uploadAvatarImage(compressed);
      setAvatarUrl(url);
      setCropSource(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah foto.");
    } finally {
      setUploading(false);
    }
  }

  function handleAvatarPick(file: File) {
    setError(null);
    if (file.type === "image/gif") {
      void uploadCroppedAvatar(file);
      return;
    }
    setCropSource(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          nickname,
          gender,
          age: age.trim() === "" ? null : age.trim(),
          occupation,
          about,
          avatarUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan profil.");
      onSaved(data.profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan profil.");
    } finally {
      setSaving(false);
    }
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
          reason: reqReason.trim(),
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
      setReqReason("");
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

  const previewName = displayName || nickname || "Kamu";
  const hasPendingReq = latestQuotaRequest?.status === "pending";
  const usageRatio = Math.min(
    100,
    Math.round((characterCount / Math.max(1, characterLimit)) * 100)
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-app">
      <MenuHeader
        title={
          tab === "admin"
            ? "Panel Admin"
            : tab === "account"
              ? "Pengelolaan Akun"
              : "Profil saya"
        }
        description={
          tab === "admin"
            ? "Kelola akun member, peran, dan persetujuan kuota karakter."
            : tab === "account"
              ? "Status keanggotaan, kuota slot karakter, dan sesi akunmu."
              : "Karakter membaca ini supaya tahu mereka sedang ngobrol sama siapa."
        }
        actions={
          <MenuHeaderIconButton
            onClick={onOpenSettings}
            title="Buka Setelan"
            aria-label="Buka Setelan"
          >
            <SettingsIcon className="h-5 w-5" />
          </MenuHeaderIconButton>
        }
      />

      <div className="shrink-0 px-4 pb-3 pt-2 sm:px-5">
        {/* Tab Menu: Profil Diri · Akun · Panel Admin (khusus Admin) */}
        <div
          className={`mx-auto grid w-full min-w-0 max-w-2xl gap-1 rounded-xl bg-surface-2 p-1 ${
            effectiveIsAdmin ? "grid-cols-3" : "grid-cols-2"
          }`}
        >
          <button
            type="button"
            onClick={() => selectTab("identity")}
            className={`min-w-0 truncate rounded-lg px-2 py-2 text-[11.5px] font-semibold transition sm:px-2.5 sm:text-xs ${
              tab === "identity"
                ? "bg-surface text-[#205ac4] shadow-xs ring-1 ring-[#4687fe]/35 dark:ring-[#d5b767]/40 dark:text-[#e8cf75]"
                : "text-ink-soft hover:text-[#205ac4] dark:hover:text-[#e8cf75]"
            }`}
          >
            Profil Diri
          </button>

          <button
            type="button"
            onClick={() => selectTab("account")}
            className={`min-w-0 truncate rounded-lg px-2 py-2 text-[11.5px] font-semibold transition sm:px-2.5 sm:text-xs ${
              tab === "account"
                ? "bg-surface text-[#205ac4] shadow-xs ring-1 ring-[#4687fe]/35 dark:ring-[#d5b767]/40 dark:text-[#e8cf75]"
                : "text-ink-soft hover:text-[#205ac4] dark:hover:text-[#e8cf75]"
            }`}
          >
            {effectiveIsAdmin ? "Akun Saya" : "Akun & Kuota"}
          </button>

          {effectiveIsAdmin && (
            <button
              type="button"
              onClick={() => selectTab("admin")}
              className={`inline-flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11.5px] font-semibold transition sm:gap-1.5 sm:px-2.5 sm:text-xs ${
                tab === "admin"
                  ? "bg-surface text-[#205ac4] shadow-xs ring-1 ring-[#4687fe]/35 dark:ring-[#d5b767]/40 dark:text-[#e8cf75]"
                  : "text-ink-soft hover:text-[#205ac4] dark:hover:text-[#e8cf75]"
              }`}
            >
              <span className="truncate">Panel Admin</span>
              {pendingQuotaRequestsCount > 0 && (
                <span className="shrink-0 rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-extrabold text-white">
                  {pendingQuotaRequestsCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3.5 pb-[calc(var(--tabbar-space)+1.25rem)] sm:p-6 sm:pb-[calc(var(--tabbar-space)+1.5rem)]"
      >
        {tab === "identity" && (
          <form
            onSubmit={handleSubmit}
            className="mx-auto max-w-xl space-y-5 rounded-3xl border border-line bg-surface p-5 shadow-xs sm:p-6"
          >
            {/* Avatar */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="group relative rounded-full"
                title="Unggah foto profil"
              >
                <Avatar name={previewName} src={avatarUrl} size={96} ring />
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition group-hover:bg-black/35">
                  <CameraIcon className="h-6 w-6 text-white opacity-0 transition group-hover:opacity-100" />
                </div>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarPick(file);
                  e.target.value = "";
                }}
              />
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="font-medium text-ink-soft transition hover:text-ink"
                >
                  {uploading
                    ? "Mengunggah..."
                    : avatarUrl
                      ? "Ganti foto"
                      : "Pilih foto"}
                </button>
                {avatarUrl && (
                  <>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => setCropSource(avatarUrl)}
                      className="font-medium text-ink-soft transition hover:text-ink disabled:opacity-50"
                    >
                      Atur posisi
                    </button>
                    <button
                      type="button"
                      onClick={() => setAvatarUrl(null)}
                      className="text-ink-soft hover:text-rose-500"
                    >
                      Hapus
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">
                  Nama
                </label>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={MAX_DISPLAY_NAME_CHARS}
                  placeholder="Mis. Adi"
                  className={FIELD}
                />
                <p className="mt-1 text-[11px]">
                  {charCount(displayName, MAX_DISPLAY_NAME_CHARS)}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">
                  Panggilan di chat
                </label>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={MAX_NICKNAME_CHARS}
                  placeholder="Mis. Mas Adi / Kak"
                  className={FIELD}
                />
                <p className="mt-1 text-[11px]">
                  {charCount(nickname, MAX_NICKNAME_CHARS)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">
                  Usia
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_AGE}
                  max={MAX_AGE}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="Opsional"
                  className={FIELD}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">
                  Kesibukan
                </label>
                <input
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="Mis. fotografer · Bogor"
                  className={FIELD}
                />
                <p className="mt-1 text-[11px]">
                  {charCount(occupation, MAX_OCCUPATION_CHARS)}
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">
                Jenis kelamin / gender (opsional)
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
                className={FIELD}
              >
                {GENDER_OPTIONS.map(({ value, label }) => (
                  <option key={value || "unspecified"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted">
                Kalau tidak diisi, karakter tidak akan menebak dari nama atau foto. Untuk “Lainnya”, kamu bisa menambahkan detail di cerita singkat.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">
                Cerita singkat tentang kamu
              </label>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                rows={4}
                placeholder="Hobi, kebiasaan, selera obrolan, atau hubunganmu dengan karakter..."
                className={`${FIELD} resize-none`}
              />
              <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                <span className="text-muted">Boleh dikosongkan kapan saja.</span>
                {charCount(about, MAX_ABOUT_CHARS)}
              </div>
            </div>

            {error && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-muted">Tersimpan di akunmu</span>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.98] disabled:opacity-60"
              >
                {saved ? (
                  <>
                    <CheckIcon className="h-4 w-4" /> Tersimpan
                  </>
                ) : saving ? (
                  "Menyimpan..."
                ) : (
                  "Simpan profil"
                )}
              </button>
            </div>
          </form>
        )}

        {tab === "account" && (
          <div className="mx-auto max-w-xl space-y-4">
            {/* Kartu Status Akun */}
            <section className="rounded-2xl border border-line bg-surface p-4 shadow-2xs sm:p-5">
              <div className="flex items-center gap-3">
                <Avatar name={previewName} src={avatarUrl} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-base font-bold text-[#205ac4] dark:text-[#e8cf75]">
                      {previewName}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                        effectiveIsAdmin
                          ? "bg-ink text-surface"
                          : "bg-surface-2 text-ink-soft ring-1 ring-line"
                      }`}
                    >
                      {effectiveIsAdmin ? "Admin" : "Member"}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                </div>
              </div>

              {/* Pemakaian Slot Karakter */}
              <div className="mt-4 rounded-xl bg-surface-2/70 p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#205ac4] dark:text-[#e8cf75]">
                    Kuota Karakter Milik Sendiri
                  </span>
                  <span className="font-bold text-[#205ac4] dark:text-[#e8cf75]">
                    {characterCount} / {characterLimit} slot
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-ink transition-all"
                    style={{ width: `${usageRatio}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
                  {effectiveIsAdmin
                    ? "Sebagai Admin, kamu bebas membuat banyak karakter dan dapat mengatur kuota seluruh member."
                    : "Setiap akun Member diberikan 1 slot karakter bawaan. Untuk menambah slot karakter baru, ajukan permintaan ke Admin di bawah."}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3.5">
                <span className="text-xs text-muted">Sesi login aktif</span>
                <button
                  type="button"
                  disabled={signingOut}
                  onClick={async () => {
                    setSigningOut(true);
                    await signOut();
                  }}
                  className="rounded-xl border border-line px-4 py-2 text-xs font-semibold text-ink-soft transition hover:border-rose-300 hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-60"
                >
                  {signingOut ? "Keluar..." : "Keluar Akun"}
                </button>
              </div>
            </section>

            {/* Menu Karakter — compact dropdown “v” (pengganti shortcut Panel Admin) */}
            <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-2xs">
              <button
                type="button"
                onClick={() => setCharsOpen((v) => !v)}
                aria-expanded={charsOpen}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2/50 sm:px-5"
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-[#205ac4] dark:text-[#e8cf75]">
                    Karakter Saya
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {characters.length === 0
                      ? "Kelola karakter — buat baru, atur profil & PIN."
                      : `${characters.length} karakter · ${characters.length}/${characterLimit} slot terpakai`}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  {pendingOwnerContactsCount > 0 && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">
                      {pendingOwnerContactsCount} baru
                    </span>
                  )}
                  {pendingQuotaRequestsCount > 0 && effectiveIsAdmin && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">
                      {pendingQuotaRequestsCount} slot
                    </span>
                  )}
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full border border-line bg-surface-2 text-ink-soft transition ${charsOpen ? "rotate-180 bg-surface text-ink" : ""}`}
                  >
                    <ChevronDownIcon className="h-3.5 w-3.5" />
                  </span>
                </span>
              </button>

              {charsOpen && (
                <div className="border-t border-line bg-surface-2/40 px-3 py-3 sm:px-4">
                  {pendingOwnerContactsCount > 0 && onOpenContactsModal && (
                    <button
                      type="button"
                      onClick={onOpenContactsModal}
                      className="mb-3 flex w-full items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-left transition hover:bg-amber-500/15"
                    >
                      <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                        Ada {pendingOwnerContactsCount} permintaan kontak menunggu persetujuanmu.
                      </span>
                      <span className="shrink-0 text-[11px] font-bold text-amber-800 underline decoration-dotted dark:text-amber-300">
                        Tinjau →
                      </span>
                    </button>
                  )}

                  {characters.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-line bg-surface p-4 text-center">
                      <p className="text-xs font-medium text-ink-soft">
                        Belum ada karakter. Buat karakter pertamamu untuk mulai chat.
                      </p>
                      {onNewCharacter && (
                        <button
                          type="button"
                          onClick={onNewCharacter}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong"
                        >
                          <PlusIcon className="h-3.5 w-3.5" /> Buat Karakter
                        </button>
                      )}
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {characters.map((ch) => (
                        <li
                          key={ch.id}
                          className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-2xs"
                        >
                          <Avatar name={ch.name} src={ch.avatarUrl} size={40} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-[#205ac4] dark:text-[#e8cf75]">
                              {ch.name}
                            </p>
                            <p className="truncate text-[11px] text-ink-soft">
                              {ch.shortBio || ch.invitePin || "Tanpa deskripsi"}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-full bg-line px-1.5 py-0.5 text-[10px] font-bold text-ink-soft">
                                PIN {ch.invitePin}
                              </span>
                              {ch.hasBible && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#4687fe]/10 dark:bg-[#d5b767]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#205ac4] dark:text-[#e8cf75]">
                                  <BibleOutlineIcon className="h-3 w-3 text-ink" /> Bible
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1">
                            <div className="flex items-center gap-1">
                              {onChatCharacter && (
                                <button
                                  type="button"
                                  onClick={() => onChatCharacter(ch.id)}
                                  className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-ink-soft transition hover:border-ink hover:text-ink"
                                  title="Chat"
                                  aria-label={`Chat dengan ${ch.name}`}
                                >
                                  <ChatSquareIcon className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {onOpenCharacterProfile && (
                                <button
                                  type="button"
                                  onClick={() => onOpenCharacterProfile(ch.id)}
                                  className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-ink-soft transition hover:border-ink hover:text-ink"
                                  title="Profil"
                                  aria-label={`Profil ${ch.name}`}
                                >
                                  <SettingsIcon className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {onEditCharacter && (
                                <button
                                  type="button"
                                  onClick={() => onEditCharacter(ch.id)}
                                  className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-ink-soft transition hover:border-ink hover:text-ink"
                                  title="Edit"
                                  aria-label={`Edit ${ch.name}`}
                                >
                                  <PencilIcon className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {onDeleteCharacter && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteCharacter(ch.id)}
                                  className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-rose-500 transition hover:border-rose-300 hover:bg-rose-500/10"
                                  title="Hapus"
                                  aria-label={`Hapus ${ch.name}`}
                                >
                                  <TrashIcon className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {characters.length > 0 && onNewCharacter && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {characters.length < characterLimit || effectiveIsAdmin ? (
                        <button
                          type="button"
                          onClick={onNewCharacter}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:bg-surface-2"
                        >
                          <PlusIcon className="h-3.5 w-3.5" /> Buat Karakter Baru
                        </button>
                      ) : (
                        <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-ink-soft">
                          Slot penuh ({characterLimit}). Ajukan tambah slot di bawah untuk buat lagi.
                        </p>
                      )}
                      {onOpenContactsModal && (
                        <button
                          type="button"
                          onClick={onOpenContactsModal}
                          className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-soft transition hover:bg-surface-2"
                        >
                          Kelola Kontak Masuk
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {!effectiveIsAdmin && (
              /* Khusus Member: Pengajuan Tambah Slot Karakter ke Admin */
              <section className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-2xs sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#205ac4] dark:text-[#e8cf75]">
                      Permintaan Tambah Slot Karakter
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-soft">
                      Ingin membuat lebih dari {characterLimit} karakter? Ajukan tambahan slot ke Admin.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onQuotaChanged?.()}
                    title="Muat ulang status kuota"
                    aria-label="Muat ulang status kuota"
                    className="rounded-full bg-surface-2 p-2 text-ink-soft transition hover:bg-line hover:text-ink"
                  >
                    <RefreshIcon className="h-4 w-4" />
                  </button>
                </div>

                {hasPendingReq ? (
                  <div className="min-w-0 space-y-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5">
                    <span className="inline-block rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                      Menunggu Persetujuan Admin
                    </span>
                    <p className="break-words text-xs leading-relaxed text-ink">
                      Kamu mengajukan penambahan kuota menjadi{" "}
                      <b>{latestQuotaRequest?.requestedQuota} slot karakter</b>.
                      {latestQuotaRequest?.reason
                        ? ` (“${latestQuotaRequest.reason}”)`
                        : ""}
                    </p>
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
                      className="text-xs font-semibold text-rose-600 underline decoration-dotted hover:text-rose-500 dark:text-rose-400"
                    >
                      Batalkan pengajuan ini
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
                            ? `✓ Pengajuan terakhir disetujui Admin (kuota aktif: ${characterLimit} slot).`
                            : "Pengajuan tambah slot sebelumnya belum disetujui Admin."}
                          {latestQuotaRequest.adminNote
                            ? ` Catatan Admin: “${latestQuotaRequest.adminNote}”`
                            : ""}
                        </div>
                      )}

                    <form
                      onSubmit={handleSubmitQuotaRequest}
                      className="space-y-3 pt-1"
                    >
                      <div>
                        <span className="mb-1.5 block text-xs font-medium text-ink-soft">
                          Pilih tambahan slot (kuota saat ini: {characterLimit})
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          {[1, 2, 3].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setAddSlots(n)}
                              className={`rounded-xl border py-2 text-xs font-semibold transition ${
                                addSlots === n
                                  ? "border-ink bg-surface-2 text-ink shadow-2xs"
                                  : "border-line text-ink-soft hover:bg-surface-2"
                              }`}
                            >
                              +{n} slot (jadi {characterLimit + n})
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
                          value={reqReason}
                          onChange={(e) => setReqReason(e.target.value)}
                          placeholder="Mis. ingin tambah karakter teman diskusi naskah..."
                          maxLength={300}
                          className={FIELD}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={reqBusy}
                        className="w-full rounded-xl bg-brand py-2.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-50"
                      >
                        {reqBusy
                          ? "Mengirim..."
                          : "Kirim Permintaan Slot ke Admin"}
                      </button>
                    </form>
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
              </section>
            )}
          </div>
        )}

        {tab === "admin" && effectiveIsAdmin && (
          <AdminPanelSection
            currentAdminId={user.id}
            onAfterAction={onQuotaChanged}
          />
        )}
      </div>

      {cropSource && (
        <AvatarCropModal
          source={cropSource}
          title="Atur Foto Profil Saya"
          busy={uploading}
          error={error}
          onCancel={() => setCropSource(null)}
          onConfirm={uploadCroppedAvatar}
          onPickAnother={() => fileRef.current?.click()}
        />
      )}
    </div>
  );
}
