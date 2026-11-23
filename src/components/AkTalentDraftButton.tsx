"use client";

import { useEffect, useState } from "react";

type Draft = { title: string; summary: string; requirements: string; budget: string; deadline: string };
const EMPTY: Draft = { title: "", summary: "", requirements: "", budget: "", deadline: "" };

/**
 * Tombol "Susun draf AK Talent" di obrolan menu Panggilan (klien yang masuk lewat PIN undangan). Hanya tampil bila karakter sudah tertaut.
 * Model menyusun usulan dari obrolan; pemilik memeriksa lalu mengirim. Di AK Talent draf masuk
 * ke Pesanan dan baru jadi proyek setelah pemilik menerimanya di sana.
 */
export function AkTalentDraftButton({ characterId, contactId, characterName, clientName }: { characterId: string; contactId: string; characterName: string; clientName?: string }) {
  const [linked, setLinked] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let alive = true;
    setLinked(false);
    fetch(`/api/integrations/aktalent/status?characterId=${encodeURIComponent(characterId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.linked) setLinked(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [characterId]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/integrations/aktalent/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(String(data.error || "Gagal. Coba lagi."));
    return data;
  }

  async function start() {
    setOpen(true);
    setSent(false);
    setError(null);
    setDraft(EMPTY);
    setBusy(true);
    try {
      const { draft: d } = await post({ action: "generate" });
      setDraft({
        title: d.title ?? "",
        summary: d.summary ?? "",
        requirements: (d.requirements ?? []).join("\n"),
        budget: d.budget ?? "",
        deadline: d.deadline ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyusun draf.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await post({
        action: "send",
        brief: {
          title: draft.title,
          summary: draft.summary,
          requirements: draft.requirements.split("\n").map((s) => s.trim()).filter(Boolean),
          budget: draft.budget,
          deadline: draft.deadline,
        },
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim draf.");
    } finally {
      setBusy(false);
    }
  }

  if (!linked) return null;
  const field = "w-full rounded-lg bg-surface/60 px-3 py-2 text-sm text-ink ring-1 ring-accent/30 outline-none focus:ring-accent/60";
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 z-20 px-3 sm:px-4" style={{ top: "calc(max(0.625rem, var(--safe-top)) + 6.25rem)" }}>
        <div className="mx-auto flex w-full max-w-3xl justify-end">
          <button
            type="button"
            onClick={() => void start()}
            title="Susun draf AK Talent"
            aria-label={`Susun draf AK Talent bersama ${characterName}`}
            className="pointer-events-auto grid h-8 w-8 place-items-center rounded-full bg-surface/45 text-accent-text ring-1 ring-accent/40 shadow-md backdrop-blur-md transition hover:bg-surface/60 active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5M9 14h6M9 17h4" />
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-surface p-4 shadow-xl ring-1 ring-accent/30" onClick={(e) => e.stopPropagation()}>
            <p className="text-base text-ink">Draf proyek untuk AK Talent</p>
            {sent ? (
              <p className="text-sm text-ink/80">
                Draf terkirim. Buka AK Talent → Pesanan, lalu terima untuk menjadikannya Project berstatus Brief.
              </p>
            ) : busy && !draft.title && !error ? (
              <p className="text-sm text-ink/70">{characterName} sedang menyusun draf dari obrolan{clientName ? ` dengan ${clientName}` : ""}…</p>
            ) : (
              <>
                <p className="text-xs text-ink/60">Periksa dan ubah dulu. Tidak ada yang terkirim sebelum kamu menekan Kirim.</p>
                <input className={field} placeholder="Judul" maxLength={80} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                <textarea className={field} rows={4} placeholder="Ringkasan" maxLength={900} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
                <textarea className={field} rows={3} placeholder="Kebutuhan (satu per baris)" value={draft.requirements} onChange={(e) => setDraft({ ...draft, requirements: e.target.value })} />
                <div className="grid grid-cols-2 gap-2">
                  <input className={field} placeholder="Anggaran" maxLength={60} value={draft.budget} onChange={(e) => setDraft({ ...draft, budget: e.target.value })} />
                  <input className={field} type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} />
                </div>
              </>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-full px-4 py-2 text-sm text-ink/70 hover:bg-ink/5" disabled={busy} onClick={() => setOpen(false)}>
                {sent ? "Tutup" : "Batal"}
              </button>
              {!sent && (
                <>
                  <button type="button" className="rounded-full px-4 py-2 text-sm text-accent-text ring-1 ring-accent/40 disabled:opacity-50" disabled={busy} onClick={() => void start()}>
                    Susun ulang
                  </button>
                  <button type="button" className="rounded-full bg-accent/90 px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy || !draft.title.trim() || !draft.summary.trim()} onClick={() => void send()}>
                    {busy ? "Mengirim…" : "Kirim"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
