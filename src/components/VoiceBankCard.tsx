"use client";

import { useCallback, useEffect, useState } from "react";
import {
  COMMON_VOICE_PHRASES,
  FEMALE_VOICE_PRESETS,
  MALE_VOICE_PRESETS,
} from "@/lib/hdVoice";
import {
  clearLocalTtsCache,
  getLocalTtsStats,
  removeLocalTtsBlob,
} from "@/lib/ttsCache";
import {
  invalidateHdAudioCache,
  playSavedBankClip,
  prewarmVoicePhrases,
  stopSpeaking,
  useIsSpeaking,
} from "@/lib/voice";
import { TrashIcon } from "./icons";

type SavedClipRow = {
  id: string;
  clipHash: string;
  provider: string;
  voice: string;
  text: string;
  mimeType: string;
  bytes: number;
  createdAt: string;
};

const ELEVEN_LABELS = new Map<string, string>(
  [...FEMALE_VOICE_PRESETS, ...MALE_VOICE_PRESETS].map((p) => [p.id, p.label])
);

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatVoiceBadge(provider: string, voice: string): string {
  const friendlyVoice = ELEVEN_LABELS.get(voice) ?? (voice.length > 12 ? `${voice.slice(0, 8)}…` : voice);
  const prov = provider === "elevenlabs" ? "ElevenLabs" : "Gemini";
  return `${prov} · ${friendlyVoice}`;
}

export function VoiceBankCard({
  userId,
  volume,
  hasActiveKey,
}: {
  userId: string;
  volume: number;
  hasActiveKey: boolean;
}) {
  const isSpeaking = useIsSpeaking();
  const [r2Enabled, setR2Enabled] = useState(false);
  const [cloudCount, setCloudCount] = useState(0);
  const [cloudBytes, setCloudBytes] = useState(0);
  const [clips, setClips] = useState<SavedClipRow[]>([]);
  const [localStats, setLocalStats] = useState<{ count: number; bytes: number }>({
    count: 0,
    bytes: 0,
  });

  const [openList, setOpenList] = useState(false);
  const [prewarmSlot, setPrewarmSlot] = useState<"female" | "male">("female");
  const [busy, setBusy] = useState<"prewarm" | "clearR2" | "clearLocal" | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const [cloudRes, local] = await Promise.all([
      fetch("/api/tts/clips").catch(() => null),
      getLocalTtsStats(userId),
    ]);
    setLocalStats(local);
    if (cloudRes && cloudRes.ok) {
      const data = await cloudRes.json().catch(() => null);
      if (data) {
        setR2Enabled(Boolean(data.r2Enabled));
        setCloudCount(Number(data.totalCount ?? 0));
        setCloudBytes(Number(data.totalBytes ?? 0));
        setClips(Array.isArray(data.clips) ? data.clips : []);
      }
    }
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function handlePrewarm() {
    if (!hasActiveKey) {
      setNote({
        kind: "err",
        text: "Aktifkan API key Gemini (di Setelan/Suara) atau ElevenLabs dulu untuk menyiapkan frasa baru.",
      });
      return;
    }

    stopSpeaking();
    setBusy("prewarm");
    setNote({ kind: "ok", text: `Menyiapkan 0/${COMMON_VOICE_PHRASES.length} frasa...` });

    const result = await prewarmVoicePhrases(
      COMMON_VOICE_PHRASES,
      { kind: "hd", slot: prewarmSlot },
      (done, total) => {
        setNote({ kind: "ok", text: `Menyiapkan ${done}/${total} frasa...` });
      }
    );

    await refresh();
    setBusy(null);

    if (result.quotaHit) {
      setNote({
        kind: "err",
        text: `Kuota API habis di tengah jalan (${result.ready}/${result.total} siap). Yang sudah jadi tetap aman tersimpan.`,
      });
    } else if (result.failed > 0 && result.ready === 0) {
      setNote({
        kind: "err",
        text: result.lastError ?? "Gagal menyiapkan frasa umum.",
      });
    } else {
      setNote({
        kind: "ok",
        text: `${result.ready} frasa umum siap di R2 & perangkat ini — bisa diputar tanpa kuota API.`,
      });
    }
  }

  async function handlePlayClip(clip: SavedClipRow) {
    if (isSpeaking && playingId === clip.id) {
      stopSpeaking();
      setPlayingId(null);
      return;
    }
    setPlayingId(clip.id);
    const ok = await playSavedBankClip({ id: clip.id, clipHash: clip.clipHash }, volume);
    setPlayingId(null);
    if (!ok) {
      setNote({ kind: "err", text: "Gagal memutar rekaman ini." });
    } else {
      // Segarkan hitungan lokal bila klip baru saja diunduh dari R2 ke perangkat ini.
      const local = await getLocalTtsStats(userId);
      setLocalStats(local);
    }
  }

  async function handleDeleteOne(clip: SavedClipRow) {
    stopSpeaking();
    const res = await fetch(`/api/tts/clips?id=${encodeURIComponent(clip.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setNote({ kind: "err", text: "Gagal menghapus rekaman." });
      return;
    }
    await removeLocalTtsBlob(userId, clip.clipHash);
    invalidateHdAudioCache();
    await refresh();
  }

  async function handleClearLocal() {
    setBusy("clearLocal");
    stopSpeaking();
    await clearLocalTtsCache(userId);
    invalidateHdAudioCache();
    await refresh();
    setBusy(null);
    setNote({
      kind: "ok",
      text: "Cache lokal perangkat dibersihkan. Rekaman di Cloud R2 tetap aman.",
    });
  }

  async function handleClearR2() {
    if (!confirm("Hapus seluruh rekaman suara HD dari Cloud R2 dan perangkat ini?")) return;
    setBusy("clearR2");
    stopSpeaking();
    const res = await fetch("/api/tts/clips?all=1", { method: "DELETE" });
    await clearLocalTtsCache(userId);
    invalidateHdAudioCache();
    await refresh();
    setBusy(null);
    if (res.ok) {
      setNote({ kind: "ok", text: "Seluruh Bank Rekaman Suara dikosongkan." });
    } else {
      setNote({ kind: "err", text: "Gagal mengosongkan Bank Rekaman R2." });
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-ink">Bank Rekaman Suara</h2>
          <p className="text-xs text-ink-soft">
            Tersimpan di Cloud R2 &amp; lokal perangkat — tetap berbunyi walau tanpa API key
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            r2Enabled
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-surface-2 text-muted"
          }`}
        >
          {r2Enabled ? "Sinkron PC & HP" : "Lokal saja"}
        </span>
      </div>

      {/* Ringkasan Kapasitas */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2">
          <span className="block text-[11px] text-muted">Cloudflare R2 (PC &amp; HP)</span>
          <span className="mt-0.5 block text-xs font-bold text-ink">
            {cloudCount} klip · {formatBytes(cloudBytes)}
          </span>
        </div>
        <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2">
          <span className="block text-[11px] text-muted">Lokal perangkat ini</span>
          <span className="mt-0.5 block text-xs font-bold text-ink">
            {localStats.count} klip · {formatBytes(localStats.bytes)}
          </span>
        </div>
      </div>

      {/* Siapkan 12 Frasa Umum */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="inline-flex rounded-xl border border-line bg-surface-2 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setPrewarmSlot("female")}
            className={`rounded-lg px-2.5 py-1 font-semibold transition ${
              prewarmSlot === "female" ? "bg-surface text-ink shadow-sm" : "text-muted"
            }`}
          >
            Slot Perempuan
          </button>
          <button
            type="button"
            onClick={() => setPrewarmSlot("male")}
            className={`rounded-lg px-2.5 py-1 font-semibold transition ${
              prewarmSlot === "male" ? "bg-surface text-ink shadow-sm" : "text-muted"
            }`}
          >
            Slot Laki-laki
          </button>
        </div>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void handlePrewarm()}
          className="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-line/50 disabled:opacity-50"
        >
          {busy === "prewarm"
            ? "Menyiapkan..."
            : `Siapkan ${COMMON_VOICE_PHRASES.length} frasa umum`}
        </button>

        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-surface-2 hover:text-ink"
        >
          Segarkan
        </button>
      </div>

      {/* Daftar Rekaman */}
      {clips.length > 0 && (
        <div className="rounded-xl border border-line">
          <button
            type="button"
            onClick={() => setOpenList((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-ink-soft hover:text-ink"
          >
            <span>
              {openList ? "Sembunyikan daftar rekaman" : `Lihat daftar rekaman (${clips.length})`}
            </span>
            <span className="text-[11px] text-muted">{openList ? "▲" : "▼"}</span>
          </button>

          {openList && (
            <div className="max-h-60 divide-y divide-line overflow-y-auto border-t border-line">
              {clips.map((clip) => {
                const active = isSpeaking && playingId === clip.id;
                return (
                  <div
                    key={clip.id}
                    className="flex items-center gap-2 px-3 py-2 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => void handlePlayClip(clip)}
                      className="shrink-0 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[11px] font-bold text-ink transition hover:bg-line/50"
                    >
                      {active ? "Stop" : "▶"}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{clip.text}</p>
                      <p className="truncate text-[11px] text-muted">
                        {formatVoiceBadge(clip.provider, clip.voice)} · {formatBytes(clip.bytes)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteOne(clip)}
                      aria-label="Hapus rekaman"
                      className="shrink-0 rounded p-1 text-muted hover:text-rose-500"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Aksi Pembersihan */}
      {(localStats.count > 0 || cloudCount > 0) && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {localStats.count > 0 && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleClearLocal()}
              className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
            >
              Bersihkan cache lokal perangkat
            </button>
          )}
          {cloudCount > 0 && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void handleClearR2()}
              className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-rose-500 transition hover:border-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
            >
              Kosongkan Bank R2
            </button>
          )}
        </div>
      )}

      {note && (
        <p
          className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
            note.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300"
          }`}
        >
          {note.text}
        </p>
      )}
    </section>
  );
}
