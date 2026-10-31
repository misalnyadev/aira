"use client";

import { useState } from "react";
import { MAX_MEMORY_SUMMARY_CHARS } from "@/lib/limits";

export type MemoryPatch = {
  memoryEnabled: boolean;
  memorySummary: string;
  memoryUpdatedAt: string | null;
};

const MEMORY_PLACEHOLDER = `1. RENCANA, PENGINGAT & JANJI
- [1 Nov 2026] Target olahraga pagi setiap Selasa & Kamis jam 06.30 WIB.

2. TENTANG DIA (FAKTA & KEBIASAAN)
- Lebih suka kopi susu gula aren dingin saat kerja siang.

3. RIWAYAT CERITA & KESEPAKATAN PENTING
- [28 Okt 2026] Bahas rencana liburan akhir tahun ke Bandung naik kereta pagi.`;

function formatUpdatedLabel(iso: string | null): string {
  if (!iso) return "Belum ada rangkuman tersimpan";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Belum ada rangkuman tersimpan";
  return `Diperbarui ${d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })} · ${d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function CharacterMemorySection({
  characterId,
  characterName,
  memoryEnabled,
  memorySummary,
  memoryUpdatedAt,
  onChange,
  onNotice,
}: {
  characterId: string;
  characterName: string;
  memoryEnabled: boolean;
  memorySummary: string;
  memoryUpdatedAt: string | null;
  onChange: (next: MemoryPatch) => void;
  onNotice?: (msg: string) => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [savingText, setSavingText] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [draft, setDraft] = useState(memorySummary);

  const busy = toggling || summarizing || savingText;
  const hasSummary = Boolean(memorySummary.trim());
  const overLimit = draft.trim().length > MAX_MEMORY_SUMMARY_CHARS;

  async function handleToggle() {
    if (busy) return;
    const nextEnabled = !memoryEnabled;
    setToggling(true);
    onChange({
      memoryEnabled: nextEnabled,
      memorySummary,
      memoryUpdatedAt,
    });

    try {
      const res = await fetch(`/api/characters/${characterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryEnabled: nextEnabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Gagal mengubah setelan ingatan.");
      }
      onNotice?.(
        nextEnabled
          ? `Ingatan panjang & sadar waktu aktif untuk ${characterName}.`
          : `Ingatan panjang ${characterName} dijeda.`
      );
    } catch (err) {
      onChange({
        memoryEnabled,
        memorySummary,
        memoryUpdatedAt,
      });
      onNotice?.(err instanceof Error ? err.message : "Gagal mengubah setelan ingatan.");
    } finally {
      setToggling(false);
    }
  }

  async function handleSummarizeNow() {
    if (busy) return;
    setSummarizing(true);
    try {
      const res = await fetch(`/api/characters/${characterId}/memory`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Gagal merangkum obrolan.");
      }
      const nextSummary = typeof data?.memorySummary === "string" ? data.memorySummary : "";
      const nextUpdatedAt = typeof data?.memoryUpdatedAt === "string" ? data.memoryUpdatedAt : null;
      setDraft(nextSummary);
      onChange({
        memoryEnabled: true,
        memorySummary: nextSummary,
        memoryUpdatedAt: nextUpdatedAt,
      });
      onNotice?.(
        `Buku Ingatan diperbarui dari ${data?.summarizedCount ?? 0} gelembung chat.`
      );
    } catch (err) {
      onNotice?.(err instanceof Error ? err.message : "Gagal merangkum obrolan.");
    } finally {
      setSummarizing(false);
    }
  }

  async function saveSummaryText(rawText: string, successToast: string) {
    if (busy) return;
    const trimmed = rawText.trim();
    if (trimmed.length > MAX_MEMORY_SUMMARY_CHARS) {
      onNotice?.(
        `Buku Ingatan maksimal ${MAX_MEMORY_SUMMARY_CHARS.toLocaleString("id-ID")} karakter.`
      );
      return;
    }

    setSavingText(true);
    try {
      const res = await fetch(`/api/characters/${characterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memorySummary: trimmed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Gagal menyimpan Buku Ingatan.");
      }
      const saved = data?.character;
      const nextSummary =
        typeof saved?.memorySummary === "string" ? saved.memorySummary : trimmed;
      const nextUpdated =
        typeof saved?.memoryUpdatedAt === "string"
          ? saved.memoryUpdatedAt
          : trimmed
            ? new Date().toISOString()
            : null;
      setDraft(nextSummary);
      setEditing(false);
      setConfirmClear(false);
      onChange({
        memoryEnabled,
        memorySummary: nextSummary,
        memoryUpdatedAt: nextUpdated,
      });
      onNotice?.(successToast);
    } catch (err) {
      onNotice?.(err instanceof Error ? err.message : "Gagal menyimpan Buku Ingatan.");
    } finally {
      setSavingText(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-2/65 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-ink">
              🧠 Teman Perencanaan & Sadar Waktu
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Tahu hari & jam WIB saat ini, mencatat rencana ber-tanggal secara otomatis, dan bisa
            mengingat pembahasan minggu-minggu lalu.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={memoryEnabled}
          aria-label="Aktifkan ingatan jangka panjang dan sadar waktu"
          disabled={busy}
          onClick={handleToggle}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
            memoryEnabled ? "bg-emerald-500" : "bg-line"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
              memoryEnabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {(memoryEnabled || hasSummary) && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted">{formatUpdatedLabel(memoryUpdatedAt)}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={handleSummarizeNow}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:bg-surface-2 active:scale-95 disabled:opacity-50"
              >
                {summarizing ? "Merangkum..." : "✨ Rangkum dari chat"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDraft(memorySummary);
                  setConfirmClear(false);
                  setEditing((v) => !v);
                }}
                className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-soft transition hover:text-ink disabled:opacity-50"
              >
                {editing ? "Tutup" : hasSummary ? "Lihat / Edit" : "Tulis manual"}
              </button>
            </div>
          </div>

          {!editing && hasSummary && (
            <pre className="mt-2.5 max-h-44 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-line bg-surface p-3 font-sans text-xs leading-relaxed text-ink">
              {memorySummary}
            </pre>
          )}

          {!editing && !hasSummary && memoryEnabled && (
            <p className="mt-2 rounded-xl border border-dashed border-line bg-surface/60 px-3 py-2 text-[11px] leading-relaxed text-muted">
              Buku Ingatan akan terisi otomatis seiring obrolan berjalan, atau ketuk{" "}
              <strong className="font-semibold text-ink-soft">✨ Rangkum dari chat</strong> untuk
              langsung merangkum percakapan yang sudah ada.
            </p>
          )}

          {editing && (
            <div className="mt-2.5 space-y-2">
              <textarea
                rows={7}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={MEMORY_PLACEHOLDER}
                className="w-full rounded-xl border border-line bg-surface p-3 text-base leading-relaxed text-ink outline-none transition placeholder:text-muted focus:border-ink sm:text-xs"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`text-[11px] ${
                    overLimit ? "font-semibold text-rose-500" : "text-muted"
                  }`}
                >
                  {draft.trim().length.toLocaleString("id-ID")} /{" "}
                  {MAX_MEMORY_SUMMARY_CHARS.toLocaleString("id-ID")} karakter
                </span>

                <div className="flex items-center gap-1.5">
                  {hasSummary && !confirmClear && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmClear(true)}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      Kosongkan
                    </button>
                  )}
                  {confirmClear && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => saveSummaryText("", "Buku Ingatan dikosongkan.")}
                      className="rounded-lg bg-rose-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50"
                    >
                      Yakin kosongkan?
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || overLimit}
                    onClick={() => saveSummaryText(draft, "Buku Ingatan disimpan.")}
                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-95 disabled:opacity-50"
                  >
                    {savingText ? "Menyimpan..." : "Simpan Catatan"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
