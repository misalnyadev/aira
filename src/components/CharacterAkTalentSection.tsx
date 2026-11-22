"use client";

import { useCallback, useEffect, useState } from "react";

type LinkStatus = { linked: boolean; version?: number; lastSyncAt?: string | null };

/** Tautan karakter ke AK Talent: buat kode sekali pakai, lalu tempel di AK Talent (Pengaturan → HeyTalent). */
export function CharacterAkTalentSection({ characterId, characterName }: { characterId: string; characterName: string }) {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [code, setCode] = useState<{ value: string; expiresAt: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/aktalent/status?characterId=${encodeURIComponent(characterId)}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data) setStatus(data as LinkStatus);
    } catch {
      /* status tidak penting untuk fungsi lain */
    }
  }, [characterId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Setelah kode dibuat, cek berkala apakah sudah ditukar di AK Talent.
  useEffect(() => {
    if (!code || status?.linked) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [code, status?.linked, load]);

  async function makeCode() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/aktalent/link-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Gagal membuat kode tautan.");
      setCode({ value: data.code, expiresAt: new Date(data.expiresAt).getTime() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat kode tautan.");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (busy || !window.confirm(`Putuskan tautan ${characterName} ke AK Talent?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/aktalent/link?characterId=${encodeURIComponent(characterId)}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Gagal memutus tautan.");
      setStatus({ linked: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memutus tautan.");
    } finally {
      setBusy(false);
    }
  }

  const minutes = code ? Math.max(0, Math.ceil((code.expiresAt - Date.now()) / 60000)) : 0;

  return (
    <section className="rounded-2xl border border-accent/30 dark:border-accent/35 bg-accent/10 p-3.5">
      <h4 className="text-sm font-semibold text-accent-text">Tautan AK Talent</h4>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Hubungkan {characterName} ke AK Talent agar karakter yang sama dipakai di kedua aplikasi. Buat kode di sini, lalu tempel di
        AK Talent (Pengaturan → HeyTalent).
      </p>
      {status?.linked ? (
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-ink-soft">
          <span>Tertaut ke AK Talent{status.version ? ` · paket versi ${status.version}` : " · menunggu paket pertama"}</span>
          <button type="button" onClick={unlink} disabled={busy} className="rounded-xl border border-accent/30 px-3 py-1.5 text-xs disabled:opacity-50">
            Putuskan
          </button>
        </div>
      ) : code ? (
        <div className="mt-2 text-xs text-ink-soft">
          <div className="select-all font-mono text-base tracking-wider text-accent-text">{code.value}</div>
          <div className="mt-1">Berlaku sekitar {minutes} menit dan hanya bisa dipakai sekali. Menunggu ditempel di AK Talent…</div>
          <button type="button" onClick={makeCode} disabled={busy} className="mt-2 rounded-xl border border-accent/30 px-3 py-1.5 text-xs disabled:opacity-50">
            Buat kode baru
          </button>
        </div>
      ) : (
        <button type="button" onClick={makeCode} disabled={busy} className="mt-2 rounded-xl border border-accent/30 px-3 py-1.5 text-xs disabled:opacity-50">
          Buat kode tautan
        </button>
      )}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </section>
  );
}
