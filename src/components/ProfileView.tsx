"use client";

import { useRef, useState } from "react";
import type { UserProfile } from "@/lib/userProfile";
import { compressImageFile } from "@/lib/compressImage";
import { useKeepFieldVisible } from "@/lib/keepFieldVisible";
import {
  MAX_ABOUT_CHARS,
  MAX_AGE,
  MAX_DISPLAY_NAME_CHARS,
  MAX_NICKNAME_CHARS,
  MAX_OCCUPATION_CHARS,
  MIN_AGE,
} from "@/lib/limits";
import { Avatar } from "./Avatar";
import { CameraIcon, CheckIcon } from "./icons";

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
}: {
  profile: UserProfile;
  onSaved: (next: UserProfile) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [nickname, setNickname] = useState(profile.nickname);
  const [age, setAge] = useState(profile.age ? String(profile.age) : "");
  const [occupation, setOccupation] = useState(profile.occupation);
  const [about, setAbout] = useState(profile.about);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatarUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useKeepFieldVisible(scrollRef, true);

  async function handleAvatarPick(file: File) {
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImageFile(file, { maxSize: 384, quality: 0.82 });
      const fd = new FormData();
      fd.append("file", compressed);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengunggah foto.");
      setAvatarUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah foto.");
    } finally {
      setUploading(false);
    }
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

  const previewName = displayName || nickname || "Kamu";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-app">
      <div className="top-bar px-5 pb-3.5 pt-[max(1rem,var(--safe-top))]">
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">Profil saya</h1>
        <p className="text-xs text-ink-soft">
          Karakter membaca ini supaya tahu mereka sedang ngobrol sama siapa.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 pb-[calc(var(--tabbar-space)+0.75rem)] sm:p-6 sm:pb-[calc(var(--tabbar-space)+1rem)]"
      >
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
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="font-medium text-ink-soft transition hover:text-ink"
              >
                {uploading ? "Mengunggah..." : "Ganti foto"}
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => setAvatarUrl(null)}
                  className="text-ink-soft hover:text-rose-500"
                >
                  Hapus
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Nama</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Mis. Adi"
                className={FIELD}
              />
              <p className="mt-1 text-[11px]">{charCount(displayName, MAX_DISPLAY_NAME_CHARS)}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">
                Panggilan di chat
              </label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Mis. Mas Adi / Kak"
                className={FIELD}
              />
              <p className="mt-1 text-[11px]">{charCount(nickname, MAX_NICKNAME_CHARS)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Usia</label>
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
              <label className="mb-1 block text-xs font-medium text-ink-soft">Kesibukan</label>
              <input
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                placeholder="Mis. fotografer · Bogor"
                className={FIELD}
              />
              <p className="mt-1 text-[11px]">{charCount(occupation, MAX_OCCUPATION_CHARS)}</p>
            </div>
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

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

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
      </div>
    </div>
  );
}
