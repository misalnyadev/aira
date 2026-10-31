"use client";

import { useEffect, useState } from "react";
import {
  MAX_ABOUT_CHARS,
  MAX_AGE,
  MAX_DISPLAY_NAME_CHARS,
  MAX_NICKNAME_CHARS,
  MAX_OCCUPATION_CHARS,
  MIN_AGE,
} from "@/lib/limits";
import type { UserProfile } from "@/lib/userProfile";
import { XIcon } from "./icons";

const EMPTY: UserProfile = {
  displayName: "",
  nickname: "",
  age: null,
  occupation: "",
  about: "",
};

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const [profile, setProfile] = useState<UserProfile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/profile", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (alive && data?.profile) setProfile({ ...EMPTY, ...data.profile });
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  function set<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan profil.");
      setProfile({ ...EMPTY, ...data.profile });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  const counter = (value: string, max: number) => (
    <span className={value.length > max ? "text-rose-600" : "text-slate-400"}>
      {value.length}/{max}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Profil Saya</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">Memuat profil...</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-800">
              Semua karakter membacanya sebelum membalas, jadi mereka tahu sedang ngobrol dengan
              siapa dan memanggilmu dengan benar. Tidak wajib diisi.
            </p>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Nama</label>
              <input
                value={profile.displayName}
                onChange={(e) => set("displayName", e.target.value)}
                placeholder="Mis. Hana"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-emerald-400"
              />
              <p className="mt-1 text-[11px]">{counter(profile.displayName, MAX_DISPLAY_NAME_CHARS)}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Panggilan sehari-hari
                </label>
                <input
                  value={profile.nickname}
                  onChange={(e) => set("nickname", e.target.value)}
                  placeholder="Mis. Han"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-emerald-400"
                />
                <p className="mt-1 text-[11px]">{counter(profile.nickname, MAX_NICKNAME_CHARS)}</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Usia</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_AGE}
                  max={MAX_AGE}
                  value={profile.age ?? ""}
                  onChange={(e) => set("age", e.target.value === "" ? null : Number(e.target.value))}
                  placeholder="Mis. 27"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-emerald-400"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  {MIN_AGE}–{MAX_AGE}
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Kesibukan</label>
              <input
                value={profile.occupation}
                onChange={(e) => set("occupation", e.target.value)}
                placeholder="Mis. kerja di studio foto, sering lembur"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-emerald-400"
              />
              <p className="mt-1 text-[11px]">{counter(profile.occupation, MAX_OCCUPATION_CHARS)}</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Cerita tentang dirimu
              </label>
              <textarea
                value={profile.about}
                onChange={(e) => set("about", e.target.value)}
                rows={5}
                placeholder="Hal yang perlu karakter tahu: kebiasaanmu, hal yang sedang kamu kejar, apa yang bikin kamu capek minggu ini."
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
              <p className="mt-1 text-[11px]">{counter(profile.about, MAX_ABOUT_CHARS)}</p>
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}
            {saved && <p className="text-sm font-medium text-emerald-600">Profil tersimpan.</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy ? "Menyimpan..." : "Simpan Profil"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
