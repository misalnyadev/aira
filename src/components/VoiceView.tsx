"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { readClipboardText } from "@/lib/clipboard";
import { useKeepFieldVisible } from "@/lib/keepFieldVisible";
import {
  cleanVoiceId,
  FEMALE_VOICE_PRESETS,
  GEMINI_FEMALE_PRESETS,
  GEMINI_MALE_PRESETS,
  GEMINI_TTS_MODELS,
  HD_TTS_MODELS,
  MALE_VOICE_PRESETS,
  resolveVoiceTarget,
  type GeminiTtsModelId,
  type HdTtsModelId,
  type HdTtsProvider,
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
import { VoiceBankCard } from "./VoiceBankCard";
import { CheckIcon, ChevronDownIcon, PlusIcon, SpeakerIcon, TrashIcon, XIcon } from "./icons";

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
  { id: "hd_female", label: "HD Perempuan", sub: "Suara HD" },
  { id: "hd_male", label: "HD Laki-laki", sub: "Suara HD" },
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
  const [provider, setProvider] = useState<HdTtsProvider>(ttsSummary.provider);

  // State Gemini TTS
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [clearGeminiPrimary, setClearGeminiPrimary] = useState(false);
  const [keptGeminiBackups, setKeptGeminiBackups] = useState<number[]>(() =>
    ttsSummary.maskedGeminiBackupKeys.map((_, idx) => idx)
  );
  const [newGeminiBackups, setNewGeminiBackups] = useState<string[]>([]);
  const [geminiModelId, setGeminiModelId] = useState<GeminiTtsModelId>(ttsSummary.geminiModelId);
  const [geminiFemaleVoice, setGeminiFemaleVoice] = useState(ttsSummary.geminiFemaleVoice);
  const [geminiMaleVoice, setGeminiMaleVoice] = useState(ttsSummary.geminiMaleVoice);
  const [geminiStyle, setGeminiStyle] = useState(ttsSummary.geminiStyle);

  // State ElevenLabs TTS
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
  const [showHdKeys, setShowHdKeys] = useState(false);
  const [geminiKeyOpen, setGeminiKeyOpen] = useState(
    () => !ttsSummary.hasSharedGeminiKey && !ttsSummary.hasGeminiKey
  );

  async function pasteInto(setter: (val: string) => void, onFilled?: () => void) {
    const pasted = await readClipboardText();
    if (!pasted) {
      setFeedback({
        kind: "err",
        text: "Clipboard kosong atau belum diizinkan. Salin API key dulu lalu coba lagi.",
      });
      return;
    }
    setter(pasted);
    onFilled?.();
  }

  const totalGeminiBackupSlots = keptGeminiBackups.length + newGeminiBackups.length;
  const canAddGeminiBackup = totalGeminiBackupSlots < MAX_BACKUP_KEYS;

  const totalBackupSlots = keptBackupIndexes.length + newBackups.length;
  const canAddBackup = totalBackupSlots < MAX_BACKUP_KEYS;

  const hasPendingChanges =
    provider !== ttsSummary.provider ||
    Boolean(geminiApiKey.trim()) ||
    clearGeminiPrimary ||
    keptGeminiBackups.length !== ttsSummary.maskedGeminiBackupKeys.length ||
    newGeminiBackups.some((k) => Boolean(k.trim())) ||
    geminiModelId !== ttsSummary.geminiModelId ||
    geminiFemaleVoice.trim() !== ttsSummary.geminiFemaleVoice ||
    geminiMaleVoice.trim() !== ttsSummary.geminiMaleVoice ||
    geminiStyle.trim() !== ttsSummary.geminiStyle ||
    Boolean(apiKey.trim()) ||
    clearPrimary ||
    keptBackupIndexes.length !== ttsSummary.maskedBackupKeys.length ||
    newBackups.some((k) => Boolean(k.trim())) ||
    modelId !== ttsSummary.modelId ||
    femaleVoiceId.trim() !== ttsSummary.femaleVoiceId ||
    maleVoiceId.trim() !== ttsSummary.maleVoiceId ||
    Math.abs(stability - ttsSummary.stability) > 0.005 ||
    Math.abs(similarityBoost - ttsSummary.similarityBoost) > 0.005;

  async function persistChanges(
    silent = false,
    overrideProvider?: HdTtsProvider
  ): Promise<TtsAccountSummary | null> {
    const nextProvider = overrideProvider ?? provider;

    if (!cleanVoiceId(geminiFemaleVoice) || !cleanVoiceId(geminiMaleVoice)) {
      setFeedback({ kind: "err", text: "Nama suara Gemini tidak valid." });
      return null;
    }
    if (!cleanVoiceId(femaleVoiceId) || !cleanVoiceId(maleVoiceId)) {
      setFeedback({ kind: "err", text: "Voice ID ElevenLabs tidak valid (hindari spasi)." });
      return null;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        provider: nextProvider,
        keepGeminiBackupIndexes: keptGeminiBackups,
        newGeminiBackupKeys: newGeminiBackups.map((k) => k.trim()).filter(Boolean),
        geminiModelId,
        geminiFemaleVoice: geminiFemaleVoice.trim(),
        geminiMaleVoice: geminiMaleVoice.trim(),
        geminiStyle: geminiStyle.trim(),
        keepBackupIndexes: keptBackupIndexes,
        newBackupKeys: newBackups.map((k) => k.trim()).filter(Boolean),
        modelId,
        femaleVoiceId: femaleVoiceId.trim(),
        maleVoiceId: maleVoiceId.trim(),
        stability,
        similarityBoost,
      };

      if (clearGeminiPrimary && !geminiApiKey.trim()) {
        payload.clearGeminiApiKey = true;
      } else if (geminiApiKey.trim()) {
        payload.geminiApiKey = geminiApiKey.trim();
      }

      if (clearPrimary && !apiKey.trim()) {
        payload.clearApiKey = true;
      } else if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }

      const updated = await onSaveTts(payload);
      if (updated) {
        invalidateHdAudioCache();
        setProvider(updated.provider);
        setGeminiApiKey("");
        setClearGeminiPrimary(false);
        setNewGeminiBackups([]);
        setKeptGeminiBackups(updated.maskedGeminiBackupKeys.map((_, idx) => idx));
        setGeminiFemaleVoice(updated.geminiFemaleVoice);
        setGeminiMaleVoice(updated.geminiMaleVoice);
        setGeminiStyle(updated.geminiStyle);
        setApiKey("");
        setClearPrimary(false);
        setNewBackups([]);
        setKeptBackupIndexes(updated.maskedBackupKeys.map((_, idx) => idx));
        setFemaleVoiceId(updated.femaleVoiceId);
        setMaleVoiceId(updated.maleVoiceId);
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

  async function handleSwitchProvider(next: HdTtsProvider) {
    stopSpeaking();
    setTestingSlot(null);
    setProvider(next);
    await persistChanges(true, next);
  }

  async function handleTestSlot(slot: "female" | "male") {
    if (isSpeaking && testingSlot === slot) {
      stopSpeaking();
      setTestingSlot(null);
      return;
    }

    stopSpeaking();
    setFeedback(null);

    const targetId =
      provider === "gemini"
        ? slot === "female"
          ? geminiFemaleVoice.trim()
          : geminiMaleVoice.trim()
        : slot === "female"
          ? femaleVoiceId.trim()
          : maleVoiceId.trim();

    if (!cleanVoiceId(targetId)) {
      setFeedback({
        kind: "err",
        text: `Pilih atau isi suara ${slot === "female" ? "Perempuan" : "Laki-laki"} yang valid.`,
      });
      return;
    }

    let summaryNow = ttsSummary;
    if (hasPendingChanges) {
      const saved = await persistChanges(true);
      if (!saved) return;
      summaryNow = saved;
    }

    if (!summaryNow.hasActiveKey) {
      setFeedback({
        kind: "err",
        text:
          provider === "gemini"
            ? "Tambahkan API key Gemini di Setelan atau di kolom API key Gemini di bawah dulu."
            : "Tempel API key ElevenLabs terlebih dulu untuk mencoba suara ElevenLabs.",
      });
      return;
    }

    setTestingSlot(slot);
    const sample =
      slot === "female"
        ? "Hai, aku udah siap nemenin obrolan kamu hari ini. Mau cerita soal apa dulu nih?"
        : "Halo, santai aja cerita sama aku. Kita mau ngobrol soal apa malam ini?";

    speak(sample, voiceSettings, {
      target: { kind: "hd", slot },
      allowDeviceFallback: false,
      onFallback: (reason) => {
        setTestingSlot(null);
        setFeedback({ kind: "err", text: reason });
        onNotice?.(reason);
      },
    });
  }

  const geminiReadyNow =
    (ttsSummary.hasGeminiKey && !clearGeminiPrimary) ||
    Boolean(geminiApiKey.trim()) ||
    ttsSummary.hasSharedGeminiKey;
  const elevenReadyNow = (ttsSummary.hasKey && !clearPrimary) || Boolean(apiKey.trim());
  const activeBadgeReady = provider === "gemini" ? geminiReadyNow : elevenReadyNow;

  const badgeLabel = (() => {
    if (!activeBadgeReady) return "Belum diatur";
    if (provider === "gemini") {
      if ((ttsSummary.hasGeminiKey && !clearGeminiPrimary) || Boolean(geminiApiKey.trim())) {
        return `Aktif${ttsSummary.geminiBackupCount ? ` +${ttsSummary.geminiBackupCount}` : ""}`;
      }
      return "Aktif · Key Setelan";
    }
    return `Aktif${ttsSummary.backupCount ? ` +${ttsSummary.backupCount}` : ""}`;
  })();

  return (
    <section className="space-y-3.5 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-ink">Suara HD</h2>
          <p className="text-xs text-ink-soft">
            {provider === "gemini"
              ? "Gemini TTS — logat Indonesia natural seperti WaiChat"
              : "ElevenLabs — mendukung Voice Design & Voice ID kustom"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            activeBadgeReady
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-surface-2 text-muted"
          }`}
        >
          {badgeLabel}
        </span>
      </div>

      {/* Pilihan Penyedia Suara HD */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-surface-2 p-1">
        <button
          type="button"
          onClick={() => void handleSwitchProvider("gemini")}
          className={`rounded-lg px-3 py-2 text-left transition ${
            provider === "gemini"
              ? "bg-surface text-ink shadow-sm ring-1 ring-line"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          <span className="block text-xs font-bold">Gemini TTS</span>
          <span className="block text-[11px] text-muted">Natural Indonesia · Gratis</span>
        </button>
        <button
          type="button"
          onClick={() => void handleSwitchProvider("elevenlabs")}
          className={`rounded-lg px-3 py-2 text-left transition ${
            provider === "elevenlabs"
              ? "bg-surface text-ink shadow-sm ring-1 ring-line"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          <span className="block text-xs font-bold">ElevenLabs</span>
          <span className="block text-[11px] text-muted">Voice Clone &amp; ID</span>
        </button>
      </div>

      {provider === "gemini" ? (
        <>
          {/* API Key Gemini (otomatis ikut Setelan bila sudah ada) */}
          <div className="rounded-xl border border-line bg-surface-2/60 p-3">
            <button
              type="button"
              onClick={() => setGeminiKeyOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-ink"
            >
              <span>
                {ttsSummary.hasSharedGeminiKey && !ttsSummary.hasGeminiKey
                  ? "Otomatis memakai API key Gemini dari Setelan (ketuk untuk key terpisah)"
                  : "API Key Gemini Suara"}
              </span>
              <ChevronDownIcon
                className={`h-4 w-4 shrink-0 text-muted transition ${geminiKeyOpen ? "rotate-180" : ""}`}
              />
            </button>

            {geminiKeyOpen && (
              <div className="mt-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">
                    {ttsSummary.hasSharedGeminiKey
                      ? "Opsional: isi jika ingin memisahkan kuota suara dari kuota chat."
                      : "Buat key gratis di Google AI Studio:"}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void pasteInto(setGeminiApiKey, () => setClearGeminiPrimary(false))
                      }
                      className="rounded-lg border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink transition hover:bg-line/50"
                    >
                      Tempel
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowHdKeys((v) => !v)}
                      className="text-[11px] font-medium text-ink-soft hover:text-ink"
                    >
                      {showHdKeys ? "Sembunyikan" : "Tampilkan"}
                    </button>
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-[11px] font-medium text-ink-soft underline decoration-dotted hover:text-ink"
                    >
                      Ambil key ↗
                    </a>
                  </div>
                </div>

                {ttsSummary.hasGeminiKey && !clearGeminiPrimary && (
                  <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs">
                    <span className="truncate font-mono text-[11px] text-ink-soft">
                      Key khusus suara: {ttsSummary.maskedGeminiKey}
                    </span>
                    <button
                      type="button"
                      onClick={() => setClearGeminiPrimary(true)}
                      className="ml-2 shrink-0 text-[11px] font-medium text-rose-500 hover:underline"
                    >
                      Hapus
                    </button>
                  </div>
                )}

                <input
                  type="text"
                  value={geminiApiKey}
                  onChange={(e) => {
                    setGeminiApiKey(e.target.value);
                    if (e.target.value.trim()) setClearGeminiPrimary(false);
                  }}
                  placeholder={
                    ttsSummary.hasGeminiKey && !clearGeminiPrimary
                      ? "Biarkan kosong jika tidak ingin mengganti key..."
                      : "AIza... (kosongkan untuk ikut key Gemini di Setelan)"
                  }
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  className={`w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none ${showHdKeys ? "" : "masked-key"}`}
                />

                {keptGeminiBackups.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="block text-[11px] font-medium text-muted">
                      Key cadangan suara Gemini:
                    </span>
                    {keptGeminiBackups.map((origIdx, pos) => (
                      <div
                        key={origIdx}
                        className="flex items-center justify-between rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs"
                      >
                        <span className="truncate font-mono text-[11px] text-ink-soft">
                          #{pos + 1} · {ttsSummary.maskedGeminiBackupKeys[origIdx]}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setKeptGeminiBackups((prev) => prev.filter((i) => i !== origIdx))
                          }
                          aria-label="Hapus key cadangan Gemini"
                          className="rounded p-0.5 text-muted hover:text-rose-500"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {newGeminiBackups.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={val}
                      onChange={(e) =>
                        setNewGeminiBackups((prev) =>
                          prev.map((v, i) => (i === idx ? e.target.value : v))
                        )
                      }
                      placeholder={`Key Gemini cadangan #${keptGeminiBackups.length + idx + 1}...`}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-1p-ignore="true"
                      data-lpignore="true"
                      className={`min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none ${showHdKeys ? "" : "masked-key"}`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void pasteInto((pasted) =>
                          setNewGeminiBackups((prev) =>
                            prev.map((v, i) => (i === idx ? pasted : v))
                          )
                        )
                      }
                      className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-semibold text-ink hover:bg-line/50"
                    >
                      Tempel
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNewGeminiBackups((prev) => prev.filter((_, i) => i !== idx))
                      }
                      aria-label="Batal tambah key cadangan"
                      className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {canAddGeminiBackup && (
                  <button
                    type="button"
                    onClick={() => setNewGeminiBackups((prev) => [...prev, ""])}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-soft hover:text-ink"
                  >
                    <PlusIcon className="h-3.5 w-3.5" /> Tambah key Gemini cadangan
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Model Gemini TTS */}
          <div className="space-y-1.5">
            <span className="block text-xs font-semibold text-ink">Model Gemini TTS</span>
            <div className="grid grid-cols-3 gap-1.5">
              {GEMINI_TTS_MODELS.map((m) => {
                const active = geminiModelId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setGeminiModelId(m.id)}
                    className={`rounded-xl border p-2.5 text-left transition ${
                      active
                        ? "border-ink bg-surface-2 text-ink"
                        : "border-line text-ink-soft hover:bg-surface-2"
                    }`}
                  >
                    <span className="block text-xs font-bold">{m.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                      {m.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Gaya Bicara (seperti WaiChat) */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-ink">
              Gaya bicara (opsional)
            </label>
            <input
              type="text"
              value={geminiStyle}
              onChange={(e) => setGeminiStyle(e.target.value)}
              placeholder="mis. bicara santai sehari-hari, hangat, akrab"
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            />
          </div>

          {/* Slot 1 Gemini: Perempuan */}
          <div className="space-y-2 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink">Slot 1 · Suara HD Perempuan</span>
              <button
                type="button"
                onClick={() => void handleTestSlot("female")}
                className="shrink-0 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-line/50"
              >
                {isSpeaking && testingSlot === "female" ? "Stop" : "▶ Tes"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {GEMINI_FEMALE_PRESETS.map((p) => {
                const active = geminiFemaleVoice.trim() === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setGeminiFemaleVoice(p.id)}
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
          </div>

          {/* Slot 2 Gemini: Laki-laki */}
          <div className="space-y-2 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink">Slot 2 · Suara HD Laki-laki</span>
              <button
                type="button"
                onClick={() => void handleTestSlot("male")}
                className="shrink-0 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-line/50"
              >
                {isSpeaking && testingSlot === "male" ? "Stop" : "▶ Tes"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {GEMINI_MALE_PRESETS.map((p) => {
                const active = geminiMaleVoice.trim() === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setGeminiMaleVoice(p.id)}
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
          </div>

          <p className="text-[11px] leading-relaxed text-muted">
            Ingin tiap karakter memakai suara Gemini yang berbeda-beda (mis. <b>Kore</b>,{" "}
            <b>Aoede</b>, <b>Leda</b>, <b>Puck</b>)? Buka <b>Profil Karakter → Suara karakter → Suara Khusus</b>.
          </p>
        </>
      ) : (
        <>
          {/* API Key & Cadangan ElevenLabs */}
          <div className="space-y-2 rounded-xl border border-line bg-surface-2/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-ink">API Key ElevenLabs</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void pasteInto(setApiKey, () => setClearPrimary(false))}
                  className="rounded-lg border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink transition hover:bg-line/50"
                >
                  Tempel
                </button>
                <button
                  type="button"
                  onClick={() => setShowHdKeys((v) => !v)}
                  className="text-[11px] font-medium text-ink-soft hover:text-ink"
                >
                  {showHdKeys ? "Sembunyikan" : "Tampilkan"}
                </button>
                <a
                  href="https://elevenlabs.io/app/settings/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-medium text-ink-soft underline decoration-dotted hover:text-ink"
                >
                  Ambil key gratis ↗
                </a>
              </div>
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
              type="text"
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
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              className={`w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none ${showHdKeys ? "" : "masked-key"}`}
            />

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

            {newBackups.map((val, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={val}
                  onChange={(e) =>
                    setNewBackups((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                  }
                  placeholder={`API key cadangan #${keptBackupIndexes.length + idx + 1}...`}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  className={`min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none ${showHdKeys ? "" : "masked-key"}`}
                />
                <button
                  type="button"
                  onClick={() =>
                    void pasteInto((pasted) =>
                      setNewBackups((prev) => prev.map((v, i) => (i === idx ? pasted : v)))
                    )
                  }
                  className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-semibold text-ink hover:bg-line/50"
                >
                  Tempel
                </button>
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

          {/* Model ElevenLabs */}
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
                    <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                      {m.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slot 1 ElevenLabs: Perempuan */}
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

          {/* Slot 2 ElevenLabs: Laki-laki */}
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

          <p className="text-[11px] leading-relaxed text-muted">
            Selain pilihan cepat di atas, kamu bebas menempel kode <b>Voice ID</b> dari suara kreasi
            sendiri (<i>Voice Design</i> / <i>My Voices</i>) di akun ElevenLabs.
          </p>

          <details className="rounded-xl border border-line px-3 py-2.5">
            <summary className="cursor-pointer text-xs font-semibold text-ink-soft">
              Pengaturan ekspresi ElevenLabs
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
        </>
      )}

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
  userId,
  settings,
  onChange,
  ttsSummary,
  onSaveTts,
  onNotice,
}: {
  userId: string;
  settings: VoiceSettings;
  onChange: (next: VoiceSettings) => void;
  ttsSummary: TtsAccountSummary;
  onSaveTts: (patch: Record<string, unknown>) => Promise<TtsAccountSummary | null>;
  onNotice?: (msg: string) => void;
}) {
  const supported = useSpeechSupported();
  const voices = useVoices();
  const isSpeaking = useIsSpeaking();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  useKeepFieldVisible(scrollAreaRef, true);

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
    const target = resolveVoiceTarget(null, settings.engine, ttsSummary.hasActiveKey);
    speak(VOICE_TEST_TEXT, settings, {
      target,
      onFallback: (reason) => onNotice?.(`${reason} Beralih ke suara perangkat.`),
    });
  }

  const canTestDefault = supported || ttsSummary.hasActiveKey;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface">
      <div className="top-bar flex items-center justify-between px-5 pb-3.5 pt-[max(1rem,var(--safe-top))]">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">Suara</h1>
          <p className="text-xs text-ink-soft">
            Suara HD Gemini, ElevenLabs &amp; suara lokal perangkat
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

      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto px-5 py-4 pb-[calc(var(--tabbar-space)+4rem)]"
      >
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
            {settings.engine !== "device" && !ttsSummary.hasActiveKey && (
              <p className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-soft">
                Rekaman yang sudah ada di Bank R2 / lokal tetap berbunyi dengan Suara HD tanpa API
                key. Untuk merekam kalimat baru, isi API key di kartu Suara HD di bawah (atau di
                Setelan untuk Gemini) — bila kosong, kalimat baru otomatis memakai suara perangkat.
              </p>
            )}
          </section>

          {/* Pengaturan Suara HD */}
          <HdVoiceCard
            ttsSummary={ttsSummary}
            voiceSettings={settings}
            onSaveTts={onSaveTts}
            onNotice={onNotice}
          />

          {/* Bank Rekaman Suara (Sinkron PC & HP via R2 + Cache Lokal) */}
          <VoiceBankCard
            userId={userId}
            volume={settings.volume}
            hasActiveKey={ttsSummary.hasActiveKey}
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
                Suara HD di atas.
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
                  API Suara HD sedang habis.
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

          {/* Preset + slider */}
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
