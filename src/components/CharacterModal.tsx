"use client";

import { useRef, useState } from "react";
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
    <span className={over ? "text-rose-600" : "text-slate-400"}>
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

  /**
   * Impor bible dari berkas. Pembacaan dan pemeriksaannya memakai modul yang
   * sama dengan server (`parseBibleFile`), jadi hasil di layar tidak mungkin
   * berbeda dengan yang nanti diterima API.
   */
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

    // JSON boleh sekalian membawa data lain; isi yang masih kosong saja,
    // supaya tidak menimpa yang sudah diketik pengguna.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {initial ? "Edit Karakter" : "Buat Karakter Baru"}
          </h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative"
              title="Unggah foto profil"
            >
              <Avatar name={name || "?"} src={avatarUrl} size={88} />
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
              }}
            />
            {uploading && <span className="text-xs text-slate-400">Mengunggah...</span>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Nama Karakter</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mis. Kirana"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-emerald-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Status singkat (tampil di bawah nama)
            </label>
            <input
              value={shortBio}
              onChange={(e) => setShortBio(e.target.value)}
              placeholder="Mis. beauty talent · AK Talent"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-emerald-400"
            />
            <p className="mt-1 text-[11px]">{charCount(shortBio, MAX_SHORT_BIO_CHARS)}</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Kepribadian & latar belakang karakter
            </label>
            <textarea
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder={PERSONALITY_PLACEHOLDER}
              rows={5}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
            <p className="mt-1 text-[11px]">{charCount(personality, MAX_PERSONALITY_CHARS)}</p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-emerald-800">
                📖 Bible peran (acuan utama)
              </label>
              <button
                type="button"
                onClick={() => bibleFileRef.current?.click()}
                className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
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
              className="w-full resize-none rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
            <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-500">
                .txt / .md / .json — kalau kosong, cukup pakai kepribadian di atas.
              </span>
              {charCount(bible, MAX_BIBLE_CHARS)}
            </div>
            {imported && <p className="mt-1 text-[11px] font-medium text-emerald-700">{imported}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Pesan pembuka pertama (opsional)
            </label>
            <textarea
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Mis. eh halo, gimana hari ini?"
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Provider AI</label>
              <select
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
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
              <label className="mb-1 block text-xs font-medium text-slate-600">Model (opsional)</label>
              <input
                value={model ?? ""}
                onChange={(e) => setModel(e.target.value)}
                placeholder="override model"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? "Menyimpan..." : initial ? "Simpan Perubahan" : "Buat Karakter"}
          </button>
        </form>
      </div>
    </div>
  );
}
