"use client";

import { useEffect, useRef, useState } from "react";
import type { CharacterDetail, ProviderSummary } from "@/types/chat";
import { compressImageFile } from "@/lib/compressImage";
import { parseBibleFile } from "@/lib/characterBible";
import {
  MAX_BIBLE_CHARS,
  MAX_PERSONALITY_CHARS,
  MAX_SHORT_BIO_CHARS,
} from "@/lib/limits";
import { Avatar } from "./Avatar";
import { CameraIcon, XIcon } from "./icons";

const FIELD =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink outline-none transition placeholder:text-muted focus:border-ink sm:py-2 sm:text-sm";

const PERSONALITY_PLACEHOLDER = `Contoh:
Nama: Kirana, 24 tahun, beauty talent di AK Talent.
Latar belakang: Asli Bogor, kos di Jakarta, sering syuting skincare.
Kepribadian: Ceria di depan kamera, aslinya overthinking, gampang gugup.
Gaya bicara: Kalimat pendek, beberapa pesan beruntun, kadang "wkwk".
Hubungan dengan lawan bicara: Teman dekat yang dia percaya.`;

const BIBLE_PLACEHOLDER = `Tempel naskah bible di sini, atau klik "Impor berkas".

Bebas formatnya. Yang paling berpengaruh biasanya:
PERAN / LATAR / CARA BICARA / HUBUNGAN / RAHASIA.`;

function charCount(value: string, max: number) {
  const over = value.length > max;
  return (
    <span className={over ? "text-rose-500" : "text-muted"}>
      {value.length.toLocaleString("id-ID")} / {max.toLocaleString("id-ID")}
    </span>
  );
}

export function CharacterModal({
  initial,
  providers,
  onClose,
  onSaved,
}: {
  initial?: CharacterDetail | null;
  providers: ProviderSummary[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [shortBio, setShortBio] = useState(initial?.shortBio ?? "");
  const [personality, setPersonality] = useState(initial?.personality ?? "");
  const [bible, setBible] = useState(initial?.bible ?? "");
  const [greeting, setGreeting] = useState(initial?.greeting ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial?.avatarUrl ?? null);
  const [providerId, setProviderId] = useState<string>(initial?.providerId ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bibleFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleAvatarPick(file: File) {
    setUploading(true);
    try {
      const compressed = await compressImageFile(file, { maxSize: 512, quality: 0.8 });
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

  async function handleBibleFile(file: File) {
    setError(null);
    setImported(null);

    const text = await file.text();
    const result = parseBibleFile(file.name, text);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setBible(result.data.bible);

    const filled: string[] = [];
    if (result.data.name && !name.trim()) {
      setName(result.data.name);
      filled.push("nama");
    }
    if (result.data.personality && !personality.trim()) {
      setPersonality(result.data.personality);
      filled.push("kepribadian");
    }
    if (result.data.greeting && !greeting.trim()) {
      setGreeting(result.data.greeting);
      filled.push("pesan pembuka");
    }
    if (result.data.shortBio && !shortBio.trim()) {
      setShortBio(result.data.shortBio);
      filled.push("status");
    }

    setImported(
      filled.length
        ? `Bible diimpor. Sekalian terisi: ${filled.join(", ")}.`
        : "Bible diimpor."
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Nama karakter wajib diisi.");
    if (!personality.trim()) return setError("Deskripsi kepribadian wajib diisi.");
    if (bible.length > MAX_BIBLE_CHARS) {
      return setError(
        `Bible terlalu panjang: ${bible.length.toLocaleString("id-ID")} dari maksimal ${MAX_BIBLE_CHARS.toLocaleString("id-ID")} karakter.`
      );
    }

    setBusy(true);
    try {
      const payload = {
        name,
        shortBio,
        personality,
        bible,
        greeting,
        avatarUrl,
        providerId: providerId || null,
        model: model || null,
      };
      const res = await fetch(initial ? `/api/characters/${initial.id}` : "/api/characters", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan karakter.");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="pop-in flex max-h-[90vh] w-full max-w-lg flex-col rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={initial ? "Edit Karakter" : "Buat Karakter Baru"}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-bold text-ink">
            {initial ? "Edit Karakter" : "Buat Karakter Baru"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-ink-soft transition hover:bg-surface-2 hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative rounded-full"
              title="Unggah foto profil"
            >
              <Avatar name={name || "?"} src={avatarUrl} size={88} ring />
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
            {uploading && <span className="text-xs text-muted">Mengunggah...</span>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Nama Karakter</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mis. Kirana"
              className={FIELD}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">
              Status singkat (tampil di bawah nama)
            </label>
            <input
              value={shortBio}
              onChange={(e) => setShortBio(e.target.value)}
              placeholder="Mis. beauty talent · AK Talent"
              className={FIELD}
            />
            <p className="mt-1 text-[11px]">{charCount(shortBio, MAX_SHORT_BIO_CHARS)}</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">
              Kepribadian & latar belakang karakter
            </label>
            <textarea
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder={PERSONALITY_PLACEHOLDER}
              rows={5}
              className={`${FIELD} resize-none`}
            />
            <p className="mt-1 text-[11px]">{charCount(personality, MAX_PERSONALITY_CHARS)}</p>
          </div>

          <div className="rounded-2xl border border-line bg-surface-2/70 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-ink">
                📖 Bible peran (acuan utama)
              </label>
              <button
                type="button"
                onClick={() => bibleFileRef.current?.click()}
                className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-semibold text-ink transition hover:bg-surface-2"
              >
                Impor berkas
              </button>
              <input
                ref={bibleFileRef}
                type="file"
                accept=".txt,.md,.markdown,.json,text/plain,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleBibleFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            <textarea
              value={bible}
              onChange={(e) => setBible(e.target.value)}
              placeholder={BIBLE_PLACEHOLDER}
              rows={6}
              className={`${FIELD} resize-none`}
            />
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted">
                .txt / .md / .json — kalau kosong, cukup pakai kepribadian di atas.
              </span>
              {charCount(bible, MAX_BIBLE_CHARS)}
            </div>
            {imported && <p className="mt-1 text-[11px] font-medium text-ink">{imported}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">
              Pesan pembuka pertama (opsional)
            </label>
            <textarea
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Mis. eh halo, gimana hari ini?"
              rows={2}
              className={`${FIELD} resize-none`}
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Provider AI</label>
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className={FIELD}
              >
                <option value="">Gunakan default</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">
                Model (opsional)
              </label>
              <input
                value={model ?? ""}
                onChange={(e) => setModel(e.target.value)}
                placeholder="override model"
                className={FIELD}
              />
            </div>
          </div>

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? "Menyimpan..." : initial ? "Simpan Perubahan" : "Buat Karakter"}
          </button>
        </form>
      </div>
    </div>
  );
}
