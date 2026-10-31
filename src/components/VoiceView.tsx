"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cleanVoiceId,
  FEMALE_VOICE_PRESETS,
  HD_TTS_MODELS,
  MALE_VOICE_PRESETS,
  resolveVoiceTarget,
  type HdTtsModelId,
  type TtsAccountSummary,
  type VoiceEngineChoice,
} from "@/lib/hdVoice";
import { MAX_BACKUP_KEYS } from "@/lib/limits";
import {
  VOICE_PRESETS,
  VOICE_TEST_TEXT,
  invalidateHdAudioCache,
  isNaturalVoice,
  isPresetActive,
  sortVoices,
  speak,
  stopSpeaking,
  useIsSpeaking,
  useSpeechSupported,
  useVoices,
  type VoiceSettings,
} from "@/lib/voice";
import { Switch } from "./Switch";
import { CheckIcon, PlusIcon, SpeakerIcon, TrashIcon, XIcon } from "./icons";

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (next: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-soft">{label}</span>
        <span className="text-xs text-muted">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full accent-ink"
      />
    </div>
  );
}

const ENGINE_OPTIONS: { id: VoiceEngineChoice; label: string; sub: string }[] = [
  { id: "device", label: "Perangkat", sub: "Gratis lokal" },
  { id: "hd_female", label: "HD Perempuan", sub: "ElevenLabs" },
  { id: "hd_male", label: "HD Laki-laki", sub: "ElevenLabs" },
];

function HdVoiceCard({
  ttsSummary,
  voiceSettings,
  onSaveTts,
  onNotice,
}: {
  ttsSummary: TtsAccountSummary;
  voiceSettings: VoiceSettings;
  onSaveTts: (patch: Record<string, unknown>) => Promise<TtsAccountSummary | null>;
  onNotice?: (msg: string) => void;
}) {
  const isSpeaking = useIsSpeaking();
  const [apiKey, setApiKey] = useState("");
  const [clearPrimary, setClearPrimary] = useState(false);
  const [keptBackupIndexes, setKeptBackupIndexes] = useState<number[]>(() =>
    ttsSummary.maskedBackupKeys.map((_, idx) => idx)
  );
  const [newBackups, setNewBackups] = useState<string[]>([]);
  const [modelId, setModelId] = useState<HdTtsModelId>(ttsSummary.modelId);
  const [femaleVoiceId, setFemaleVoiceId] = useState(ttsSummary.femaleVoiceId);
  const [maleVoiceId, setMaleVoiceId] = useState(ttsSummary.maleVoiceId);
  const [stability, setStability] = useState(ttsSummary.stability);
  const [similarityBoost, setSimilarityBoost] = useState(ttsSummary.similarityBoost);
  const [saving, setSaving] = useState(false);
  const [testingSlot, setTestingSlot] = useState<"female" | "male" | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const totalBackupSlots = keptBackupIndexes.length + newBackups.length;
  const canAddBackup = totalBackupSlots < MAX_BACKUP_KEYS;

  const hasPendingChanges =
    Boolean(apiKey.trim()) ||
    clearPrimary ||
    keptBackupIndexes.length !== ttsSummary.maskedBackupKeys.length ||
    newBackups.some((k) => Boolean(k.trim())) ||
    modelId !== ttsSummary.modelId ||
    femaleVoiceId.trim() !== ttsSummary.femaleVoiceId ||
    maleVoiceId.trim() !== ttsSummary.maleVoiceId ||
    Math.abs(stability - ttsSummary.stability) > 0.005 ||
    Math.abs(similarityBoost - ttsSummary.similarityBoost) > 0.005;

  async function persistChanges(silent = false): Promise<TtsAccountSummary | null> {
    if (!cleanVoiceId(femaleVoiceId)) {
      setFeedback({ kind: "err", text: "Voice ID Perempuan tidak valid (hindari spasi)." });
      return null;
    }
    if (!cleanVoiceId(maleVoiceId)) {
      setFeedback({ kind: "err", text: "Voice ID Laki-laki tidak valid (hindari spasi)." });
      return null;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        keepBackupIndexes: keptBackupIndexes,
        newBackupKeys: newBackups.map((k) => k.trim()).filter(Boolean),
        modelId,
        femaleVoiceId: femaleVoiceId.trim(),
        maleVoiceId: maleVoiceId.trim(),
        stability,
        similarityBoost,
      };
      if (clearPrimary && !apiKey.trim()) {
        payload.clearApiKey = true;
      } else if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }

      const updated = await onSaveTts(payload);
      if (updated) {
        invalidateHdAudioCache();
        if (!silent) {
          setFeedback({ kind: "ok", text: "Pengaturan Suara HD tersimpan." });
        }
      } else {
        setFeedback({ kind: "err", text: "Gagal menyimpan pengaturan Suara HD." });
      }
      return updated;
    } finally {
      setSaving(false);
    }
  }

  async function handleTestSlot(slot: "female" | "male") {
    if (isSpeaking && testingSlot === slot) {
      stopSpeaking();
      setTestingSlot(null);
      return;
    }

    stopSpeaking();
    setFeedback(null);

    const targetId = slot === "female" ? femaleVoiceId.trim() : maleVoiceId.trim();
    if (!cleanVoiceId(targetId)) {
      setFeedback({
        kind: "err",
        text: `Masukkan kode Voice ID ${slot === "female" ? "Perempuan" : "Laki-laki"} yang valid.`,
      });
      return;
    }

    let summaryNow = ttsSummary;
    if (hasPendingChanges) {
      const saved = await persistChanges(true);
      if (!saved) return;
      summaryNow = saved;
    }

    if (!summaryNow.hasKey) {
      setFeedback({
        kind: "err",
        text: "Tempel API key ElevenLabs terlebih dulu untuk mencoba suara HD.",
      });
      return;
    }

    setTestingSlot(slot);
    const sample =
      slot === "female"
        ? "Halo, ini contoh suara perempuan. Senang bisa ngobrol sama kamu hari ini."
        : "Halo, ini contoh suara laki-laki. Kita mau cerita soal apa malam ini?";

    speak(sample, voiceSettings, {
      target: { kind: "hd", slot },
      onFallback: (reason) => {
        setTestingSlot(null);
        setFeedback({ kind: "err", text: reason });
        onNotice?.(reason);
      },
    });
  }

  return (
    <section className="space-y-3.5 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-ink">Suara HD (ElevenLabs)</h2>
          <p className="text-xs text-ink-soft">
            1 slot perempuan & 1 slot laki-laki untuk dipakai bersama semua karakter
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            ttsSummary.hasKey && !clearPrimary
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-surface-2 text-muted"
          }`}
        >
          {ttsSummary.hasKey && !clearPrimary
            ? `Aktif${ttsSummary.backupCount ? ` +${ttsSummary.backupCount}` : ""}`
            : "Belum diatur"}
        </span>
      </div>

      {/* API Key & Cadangan */}
      <div className="space-y-2 rounded-xl border border-line bg-surface-2/60 p-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-ink">API Key ElevenLabs</label>
          <a
            href="https://elevenlabs.io/app/settings/api-keys"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-medium text-ink-soft underline decoration-dotted hover:text-ink"
          >
            Ambil key gratis ↗
          </a>
        </div>

        {ttsSummary.hasKey && !clearPrimary && (
          <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs">
            <span className="truncate font-mono text-[11px] text-ink-soft">
              Tersimpan: {ttsSummary.maskedKey}
            </span>
            <button
              type="button"
              onClick={() => setClearPrimary(true)}
              className="ml-2 shrink-0 text-[11px] font-medium text-rose-500 hover:underline"
            >
              Hapus
            </button>
          </div>
        )}

        <input
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            if (e.target.value.trim()) setClearPrimary(false);
          }}
          placeholder={
            ttsSummary.hasKey && !clearPrimary
              ? "Biarkan kosong jika tidak ingin mengganti key utama..."
              : "Tempel xi-api-key ElevenLabs..."
          }
          autoComplete="off"
          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
        />

        {/* Key cadangan yang tersimpan */}
        {keptBackupIndexes.length > 0 && (
          <div className="space-y-1 pt-1">
            <span className="block text-[11px] font-medium text-muted">
              Key cadangan otomatis (diputar saat kuota key utama habis):
            </span>
            {keptBackupIndexes.map((origIdx, pos) => (
              <div
                key={origIdx}
                className="flex items-center justify-between rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs"
              >
                <span className="truncate font-mono text-[11px] text-ink-soft">
                  #{pos + 1} · {ttsSummary.maskedBackupKeys[origIdx]}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setKeptBackupIndexes((prev) => prev.filter((i) => i !== origIdx))
                  }
                  aria-label="Hapus key cadangan"
                  className="rounded p-0.5 text-muted hover:text-rose-500"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input key cadangan baru */}
        {newBackups.map((val, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <input
              type="password"
              value={val}
              onChange={(e) =>
                setNewBackups((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
              }
              placeholder={`API key cadangan #${keptBackupIndexes.length + idx + 1}...`}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setNewBackups((prev) => prev.filter((_, i) => i !== idx))}
              aria-label="Batal tambah key cadangan"
              className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        ))}

        {canAddBackup && (
          <button
            type="button"
            onClick={() => setNewBackups((prev) => [...prev, ""])}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-soft hover:text-ink"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Tambah API key cadangan
          </button>
        )}
      </div>

      {/* Pilihan Model */}
      <div className="space-y-1.5">
        <span className="block text-xs font-semibold text-ink">Model ElevenLabs</span>
        <div className="grid grid-cols-2 gap-2">
          {HD_TTS_MODELS.map((m) => {
            const active = modelId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModelId(m.id)}
                className={`rounded-xl border p-2.5 text-left transition ${
                  active
                    ? "border-ink bg-surface-2 text-ink"
                    : "border-line text-ink-soft hover:bg-surface-2"
                }`}
              >
                <span className="block text-xs font-bold">{m.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">{m.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Slot 1: Perempuan */}
      <div className="space-y-2 rounded-xl border border-line p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink">Slot 1 · Suara HD Perempuan</span>
          <span className="text-[11px] text-muted">Gratis di Free Tier</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FEMALE_VOICE_PRESETS.map((p) => {
            const active = femaleVoiceId.trim() === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setFemaleVoiceId(p.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "border-ink bg-ink text-surface"
                    : "border-line bg-surface-2 text-ink-soft hover:text-ink"
                }`}
              >
                {p.label} · {p.hint}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={femaleVoiceId}
            onChange={(e) => setFemaleVoiceId(e.target.value)}
            placeholder="Voice ID Perempuan..."
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleTestSlot("female")}
            className="shrink-0 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-ink transition hover:bg-line/50"
          >
            {isSpeaking && testingSlot === "female" ? "Stop" : "▶ Tes"}
          </button>
        </div>
      </div>

      {/* Slot 2: Laki-laki */}
      <div className="space-y-2 rounded-xl border border-line p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink">Slot 2 · Suara HD Laki-laki</span>
          <span className="text-[11px] text-muted">Gratis di Free Tier</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MALE_VOICE_PRESETS.map((p) => {
            const active = maleVoiceId.trim() === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setMaleVoiceId(p.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? "border-ink bg-ink text-surface"
                    : "border-line bg-surface-2 text-ink-soft hover:text-ink"
                }`}
              >
                {p.label} · {p.hint}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={maleVoiceId}
            onChange={(e) => setMaleVoiceId(e.target.value)}
            placeholder="Voice ID Laki-laki..."
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleTestSlot("male")}
            className="shrink-0 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs font-semibold text-ink transition hover:bg-line/50"
          >
            {isSpeaking && testingSlot === "male" ? "Stop" : "▶ Tes"}
          </button>
        </div>
      </div>

      {/* Pengaturan Ekspresi Lanjutan */}
      <details className="rounded-xl border border-line px-3 py-2.5">
        <summary className="cursor-pointer text-xs font-semibold text-ink-soft">
          Pengaturan ekspresi suara HD
        </summary>
        <div className="mt-3 space-y-3">
          <Slider
            label="Stabilitas (makin rendah makin ekspresif)"
            value={stability}
            min={0.15}
            max={0.95}
            step={0.05}
            display={`${Math.round(stability * 100)}%`}
            onChange={setStability}
          />
          <Slider
            label="Kemiripan karakter vokal"
            value={similarityBoost}
            min={0.2}
            max={1}
            step={0.05}
            display={`${Math.round(similarityBoost * 100)}%`}
            onChange={setSimilarityBoost}
          />
        </div>
      </details>

      {feedback && (
        <p
          className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
            feedback.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300"
          }`}
        >
          {feedback.text}
        </p>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void persistChanges(false)}
        className="w-full rounded-xl bg-brand py-2.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.99] disabled:opacity-50"
      >
        {saving ? "Menyimpan..." : "Simpan Pengaturan Suara HD"}
      </button>
    </section>
  );
}

export function VoiceView({
  settings,
  onChange,
  ttsSummary,
  onSaveTts,
  onNotice,
}: {
  settings: VoiceSettings;
  onChange: (next: VoiceSettings) => void;
  ttsSummary: TtsAccountSummary;
  onSaveTts: (patch: Record<string, unknown>) => Promise<TtsAccountSummary | null>;
  onNotice?: (msg: string) => void;
}) {
  const supported = useSpeechSupported();
  const voices = useVoices();
  const isSpeaking = useIsSpeaking();

  // Hentikan contoh suara saat berpindah ke tab lain.
  useEffect(() => () => stopSpeaking(), []);

  const sorted = useMemo(() => sortVoices(voices), [voices]);
  const indonesianCount = useMemo(
    () => sorted.filter((v) => v.lang?.toLowerCase().startsWith("id")).length,
    [sorted]
  );
  const bestVoice = sorted[0] ?? null;

  function update(patch: Partial<VoiceSettings>) {
    onChange({ ...settings, ...patch });
  }

  function handleTestDefault() {
    const target = resolveVoiceTarget(null, settings.engine, ttsSummary.hasKey);
    speak(VOICE_TEST_TEXT, settings, {
      target,
      onFallback: (reason) => onNotice?.(`${reason} Beralih ke suara perangkat.`),
    });
  }

  const canTestDefault = supported || ttsSummary.hasKey;
  const cardResetKey = `${ttsSummary.maskedKey}|${ttsSummary.backupCount}|${ttsSummary.modelId}|${ttsSummary.femaleVoiceId}|${ttsSummary.maleVoiceId}|${ttsSummary.stability}|${ttsSummary.similarityBoost}`;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface">
      <div className="top-bar flex items-center justify-between px-5 pb-3.5 pt-[max(1rem,var(--safe-top))]">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">Suara</h1>
          <p className="text-xs text-ink-soft">
            Suara HD ElevenLabs & suara lokal perangkat
          </p>
        </div>
        {canTestDefault && (
          <button
            type="button"
            onClick={isSpeaking ? stopSpeaking : handleTestDefault}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              isSpeaking
                ? "border border-line bg-surface-2 text-ink hover:bg-line/60"
                : "bg-brand text-brand-ink hover:bg-brand-strong"
            }`}
          >
            {isSpeaking ? "Hentikan" : "Coba suara"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 pb-[calc(var(--tabbar-space)+0.75rem)]">
        <div className="mx-auto w-full max-w-2xl space-y-5">
          {/* Aktifkan */}
          <div className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-soft ring-1 ring-line">
              <SpeakerIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Bacakan balasan</span>
              <span className="block text-xs text-ink-soft">
                Balasan karakter dibacakan otomatis saat tiba di ruang chat
              </span>
            </div>
            <Switch
              checked={settings.enabled}
              onChange={(next) => update({ enabled: next })}
              label="Bacakan balasan"
            />
          </div>

          {/* Pilihan mesin suara bawaan */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Mesin suara bawaan
              </h2>
              <span className="text-[11px] text-muted">Bisa diatur per karakter</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {ENGINE_OPTIONS.map((opt) => {
                const active = settings.engine === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => update({ engine: opt.id })}
                    className={`rounded-xl border px-2.5 py-2 text-left transition ${
                      active
                        ? "border-ink bg-surface-2 text-ink"
                        : "border-line text-ink-soft hover:bg-surface-2"
                    }`}
                  >
                    <span className="block truncate text-xs font-bold">{opt.label}</span>
                    <span className="block truncate text-[11px] text-muted">{opt.sub}</span>
                  </button>
                );
              })}
            </div>
            {settings.engine !== "device" && !ttsSummary.hasKey && (
              <p className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-soft">
                Isi API key ElevenLabs di bawah agar suara HD aktif. Selama belum diisi, balasan
                tetap dibacakan memakai suara perangkat.
              </p>
            )}
          </section>

          {/* Pengaturan ElevenLabs HD */}
          <HdVoiceCard
            key={cardResetKey}
            ttsSummary={ttsSummary}
            voiceSettings={settings}
            onSaveTts={onSaveTts}
            onNotice={onNotice}
          />

          {/* Bagian Suara Lokal Perangkat */}
          <section className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Suara lokal perangkat (Gratis &amp; Cadangan)
              </h2>
              {supported && (
                <span className="text-xs text-muted">
                  {sorted.length} suara{indonesianCount ? ` · ${indonesianCount} Indonesia` : ""}
                </span>
              )}
            </div>

            {!supported && (
              <p className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
                Browser ini belum mendukung suara lokal (Web Speech API). Kamu tetap bisa memakai
                Suara HD ElevenLabs di atas.
              </p>
            )}

            {supported && bestVoice && (
              <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
                <p className="text-xs text-ink-soft">
                  Paling natural di perangkat ini:{" "}
                  <span className="font-semibold text-ink">{bestVoice.name}</span>
                  {isNaturalVoice(bestVoice) ? " (enhanced)" : ""}
                </p>
                {(settings.voiceURI !== bestVoice.voiceURI || settings.voiceURI === "") && (
                  <button
                    type="button"
                    onClick={() =>
                      update({ voiceURI: bestVoice.voiceURI, rate: 0.95, pitch: 1, pause: 150 })
                    }
                    className="mt-2 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong"
                  >
                    Pakai suara ini
                  </button>
                )}
              </div>
            )}

            <details className="rounded-xl border border-line px-3.5 py-2.5">
              <summary className="cursor-pointer text-xs font-semibold text-ink-soft">
                Cara bikin suara lokal iPhone lebih natural
              </summary>
              <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-soft">
                <p>
                  <b>iPhone:</b> Pengaturan → Aksesibilitas → Konten Terbaca → Suara → Indonesia,
                  lalu unduh suara bertanda <i>Enhanced</i>/<i>Premium</i>. Setelah terunduh, suara
                  itu muncul di daftar bawah dan jauh lebih halus.
                </p>
                <p>
                  Suara lokal ini juga dipakai otomatis sebagai <b>cadangan instan</b> bila kuota
                  bulanan ElevenLabs sedang habis.
                </p>
              </div>
            </details>

            {supported && (
              <div className="overflow-hidden rounded-xl border border-line">
                <button
                  type="button"
                  onClick={() => update({ voiceURI: "" })}
                  className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition ${
                    settings.voiceURI === "" ? "bg-ink/[0.06]" : "hover:bg-surface-2"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">Otomatis</span>
                    <span className="block truncate text-xs text-muted">
                      Utamakan bahasa Indonesia paling natural
                    </span>
                  </span>
                  {settings.voiceURI === "" && <CheckIcon className="h-4 w-4 shrink-0 text-ink" />}
                </button>

                {sorted.length > 0 && (
                  <div className="max-h-60 divide-y divide-line overflow-y-auto border-t border-line">
                    {sorted.map((v) => {
                      const active = settings.voiceURI === v.voiceURI;
                      const natural = isNaturalVoice(v);
                      return (
                        <button
                          type="button"
                          key={v.voiceURI}
                          onClick={() => update({ voiceURI: v.voiceURI })}
                          className={`flex w-full items-center gap-2 px-3.5 py-2 text-left transition ${
                            active ? "bg-ink/[0.06]" : "hover:bg-surface-2"
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink">{v.name}</span>
                            <span className="block truncate text-[11px] text-muted">{v.lang}</span>
                          </span>
                          {natural && (
                            <span className="shrink-0 rounded-full bg-ink/10 px-1.5 py-0.5 text-[11px] font-semibold text-ink">
                              natural
                            </span>
                          )}
                          {v.localService && !natural && (
                            <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                              lokal
                            </span>
                          )}
                          {active && <CheckIcon className="h-4 w-4 shrink-0 text-ink" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Preset + slider (Volume & Jeda berlaku juga untuk HD; Kecepatan & Nada untuk lokal) */}
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Pengaturan pemutaran
            </h2>

            <div className="grid grid-cols-5 gap-1.5">
              {VOICE_PRESETS.map((preset) => {
                const active = isPresetActive(settings, preset);
                return (
                  <button
                    type="button"
                    key={preset.label}
                    onClick={() => update({ rate: preset.rate, pitch: preset.pitch })}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                      active
                        ? "border-ink bg-surface-2 text-ink"
                        : "border-line text-ink-soft hover:bg-surface-2"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3 rounded-xl border border-line p-3.5">
              <Slider
                label="Volume (HD & lokal)"
                value={settings.volume}
                min={0.1}
                max={1}
                step={0.05}
                display={`${Math.round(settings.volume * 100)}%`}
                onChange={(volume) => update({ volume })}
              />
              <Slider
                label="Jeda antar kalimat / gelembung"
                value={settings.pause}
                min={0}
                max={400}
                step={20}
                display={`${Math.round(settings.pause)} ms`}
                onChange={(pause) => update({ pause })}
              />
              <Slider
                label="Kecepatan (suara lokal)"
                value={settings.rate}
                min={0.5}
                max={1.6}
                step={0.05}
                display={`${settings.rate.toFixed(2)}×`}
                onChange={(rate) => update({ rate })}
              />
              <Slider
                label="Nada (suara lokal)"
                value={settings.pitch}
                min={0.5}
                max={1.6}
                step={0.05}
                display={settings.pitch.toFixed(2)}
                onChange={(pitch) => update({ pitch })}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
