"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { readClipboardText } from "@/lib/clipboard";
import { useKeepFieldVisible } from "@/lib/keepFieldVisible";
import {
  cleanTtsModelId,
  cleanVoiceId,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_HD_MODEL_ID,
  FEMALE_VOICE_PRESETS,
  GEMINI_FEMALE_PRESETS,
  GEMINI_MALE_PRESETS,
  GEMINI_TTS_MODELS,
  HD_TTS_MODELS,
  MALE_VOICE_PRESETS,
  pickDynamicRecommendedTtsModels,
  resolveVoiceTarget,
  sortTtsModels,
  type GeminiTtsModelId,
  type HdTtsModelId,
  type HdTtsProvider,
  type SharedGeminiKeySummary,
  type TtsAccountSummary,
  type TtsModelOption,
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
import {
  BoltIcon,
  CheckIcon,
  ChevronDownIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SpeakerIcon,
  TrashIcon,
  XIcon,
} from "./icons";

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

function VoiceAccordionCard({
  title,
  subtitle,
  badge,
  badgeTone = "neutral",
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: "neutral" | "active";
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-2xs">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-surface-2/50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-ink">{title}</h2>
            {badge && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                  badgeTone === "active"
                    ? "bg-[#4687fe]/15 dark:bg-[#d5b767]/15 text-[#205ac4] dark:text-[#e8cf75]"
                    : "bg-surface-2 text-ink-soft"
                }`}
              >
                {badge}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-soft">{subtitle}</p>
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-soft">
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform duration-200 ${
              open ? "rotate-180 text-ink" : ""
            }`}
          />
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-4 py-4">{children}</div>
      )}
    </section>
  );
}

const ENGINE_OPTIONS: { id: VoiceEngineChoice; label: string; sub: string }[] = [
  { id: "device", label: "Perangkat", sub: "Gratis lokal" },
  { id: "hd_female", label: "HD Perempuan", sub: "Suara HD" },
  { id: "hd_male", label: "HD Laki-laki", sub: "Suara HD" },
];

function TtsModelSelector({
  title,
  provider,
  value,
  defaultModel,
  presets,
  detectedModels,
  liveRecommended,
  modelsBusy,
  modelsError,
  autoNotice,
  showList,
  onToggleList,
  onRefreshModels,
  onChange,
}: {
  title: string;
  provider: HdTtsProvider;
  value: string;
  defaultModel: string;
  presets: { id: string; label: string; hint: string }[];
  detectedModels: TtsModelOption[] | null;
  liveRecommended: string[];
  modelsBusy: boolean;
  modelsError: string | null;
  autoNotice: string | null;
  showList: boolean;
  onToggleList: () => void;
  onRefreshModels: () => void;
  onChange: (next: string) => void;
}) {
  const [query, setQuery] = useState("");

  const recommended = useMemo(
    () =>
      liveRecommended.length > 0
        ? liveRecommended
        : detectedModels
          ? pickDynamicRecommendedTtsModels(detectedModels, provider)
          : [],
    [detectedModels, liveRecommended, provider]
  );

  const sortedModels = useMemo(
    () => (detectedModels ? sortTtsModels(detectedModels, recommended) : []),
    [detectedModels, recommended]
  );

  const visibleModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedModels;
    return sortedModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.label ? m.label.toLowerCase().includes(q) : false)
    );
  }, [query, sortedModels]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink">
          {title}
          {detectedModels ? (
            <span className="ml-1 font-normal text-muted">
              ({detectedModels.length} tersedia)
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onToggleList}
          disabled={modelsBusy}
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft transition hover:text-ink disabled:opacity-50"
        >
          {modelsBusy
            ? "Mendeteksi..."
            : showList
              ? "Tutup daftar"
              : detectedModels
                ? "Semua model"
                : "Deteksi model"}
          <ChevronDownIcon
            className={`h-3.5 w-3.5 transition ${showList ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <div
        className={`grid gap-1.5 ${
          presets.length >= 3 ? "grid-cols-3" : "grid-cols-2"
        }`}
      >
        {presets.map((m) => {
          const active = value.trim() === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
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

      <div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            modelsBusy
              ? "Mendeteksi model suara yang tersedia dari API key..."
              : `ID model manual / deteksi otomatis (mis. ${defaultModel})`
          }
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink placeholder:font-sans placeholder:text-muted focus:border-ink focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-muted">
          Bisa pilih cepat di atas, klik <b>Deteksi model</b> dari API key, atau ketik ID model manual bila kelak rilis generasi baru.
        </p>
      </div>

      {autoNotice && (
        <p className="rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
          {autoNotice}
        </p>
      )}

      {!showList && modelsError && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">
          {modelsError}
        </p>
      )}

      {showList && (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex items-center gap-1 border-b border-line px-2.5 py-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari model suara yang tersedia..."
              className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-ink outline-none placeholder:text-muted"
            />
            <button
              type="button"
              onClick={onRefreshModels}
              disabled={modelsBusy}
              aria-label="Muat ulang daftar model suara"
              title="Muat ulang daftar model"
              className="rounded-full p-1.5 text-ink-soft transition hover:bg-surface-2 disabled:opacity-50"
            >
              <RefreshIcon className={`h-4 w-4 ${modelsBusy ? "animate-spin" : ""}`} />
            </button>
          </div>

          {modelsError ? (
            <p className="px-3 py-3 text-xs text-rose-600 dark:text-rose-400">
              {modelsError}
            </p>
          ) : sortedModels.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted">
              {modelsBusy
                ? "Mendeteksi model suara aktif..."
                : "Belum ada model suara terdeteksi pada API key ini."}
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              {visibleModels.length === 0 && (
                <p className="px-3 py-3 text-xs text-muted">Tidak ditemukan.</p>
              )}
              {visibleModels.map((m) => {
                const active = value.trim() === m.id;
                const isRecommended = recommended.includes(m.id);
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => {
                      onChange(m.id);
                      onToggleList();
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition ${
                      active ? "bg-ink/[0.06]" : "hover:bg-surface-2"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs text-ink">
                        {m.id}
                      </span>
                      {m.label && m.label !== m.id && (
                        <span className="block truncate text-[11px] text-muted">
                          {m.label}
                        </span>
                      )}
                    </span>
                    {isRecommended && (
                      <span className="shrink-0 rounded-full bg-ink/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-ink">
                        tersedia &amp; disarankan
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
    </div>
  );
}

type SingleRowTestState = {
  status: "testing" | "ok" | "model_unavailable" | "fail";
  message?: string;
  suggestedModel?: string;
  activeModels?: TtsModelOption[];
  recommended?: string[];
};

type KeyFormMode =
  | null
  | { kind: "create" }
  | { kind: "edit_primary" }
  | { kind: "edit_backup"; index: number };

function TtsProviderKeySection({
  provider,
  hasPrimary,
  maskedPrimary,
  maskedBackups,
  hasSharedFallback,
  sharedProviders,
  modelId,
  defaultModel,
  voiceId,
  busy,
  onSelectModel,
  onSelectAndSaveModel,
  onOpenModelEditor,
  onDetectedModelsFromTest,
  onPatchKeys,
  onPendingPatchChange,
  onFeedbackError,
}: {
  provider: HdTtsProvider;
  hasPrimary: boolean;
  maskedPrimary: string;
  maskedBackups: string[];
  hasSharedFallback: boolean;
  sharedProviders: SharedGeminiKeySummary[];
  modelId: string;
  defaultModel: string;
  voiceId: string;
  busy: boolean;
  onSelectModel: (nextModel: string) => void;
  onSelectAndSaveModel: (nextModel: string) => Promise<void>;
  onOpenModelEditor: () => void;
  onDetectedModelsFromTest: (
    models: TtsModelOption[],
    recommended: string[]
  ) => void;
  onPatchKeys: (
    patch: Record<string, unknown>,
    okMessage: string
  ) => Promise<boolean>;
  onPendingPatchChange: (patch: Record<string, unknown> | null) => void;
  onFeedbackError: (msg: string) => void;
}) {
  const effectiveSharedList: SharedGeminiKeySummary[] =
    provider === "gemini"
      ? sharedProviders.length > 0
        ? sharedProviders
        : hasSharedFallback
          ? [
              {
                id: "__shared_default__",
                label: "Gemini Setelan",
                maskedKey: "Key dari menu Setelan",
                backupCount: 0,
              },
            ]
          : []
      : [];

  const hasAnyRegistered =
    hasPrimary || maskedBackups.length > 0 || effectiveSharedList.length > 0;

  const [formMode, setFormMode] = useState<KeyFormMode>(() =>
    hasAnyRegistered ? null : { kind: "create" }
  );
  const [createTarget, setCreateTarget] = useState<"primary" | "backup">(() =>
    hasPrimary ? "backup" : "primary"
  );
  const [draftKey, setDraftKey] = useState("");
  const [extraBackups, setExtraBackups] = useState<string[]>([]);
  const [showRawKey, setShowRawKey] = useState(false);
  const [rowTests, setRowTests] = useState<Record<string, SingleRowTestState>>(
    {}
  );
  const [formBusy, setFormBusy] = useState(false);

  const effectiveModel = cleanTtsModelId(modelId) || defaultModel;
  const maxExtraBackups = Math.max(0, MAX_BACKUP_KEYS - maskedBackups.length);

  function buildPendingPatch(
    mode: KeyFormMode,
    target: "primary" | "backup",
    mainVal: string,
    extras: string[]
  ): Record<string, unknown> | null {
    if (!mode) return null;
    const trimmedMain = mainVal.trim();
    const trimmedExtras = extras.map((k) => k.trim()).filter(Boolean);
    if (!trimmedMain && trimmedExtras.length === 0) return null;

    if (mode.kind === "edit_primary") {
      if (!trimmedMain) return null;
      return provider === "gemini"
        ? { geminiApiKey: trimmedMain }
        : { apiKey: trimmedMain };
    }

    if (mode.kind === "edit_backup") {
      if (!trimmedMain) return null;
      return provider === "gemini"
        ? { replaceGeminiBackup: { index: mode.index, apiKey: trimmedMain } }
        : { replaceBackup: { index: mode.index, apiKey: trimmedMain } };
    }

    if (target === "primary") {
      const patch: Record<string, unknown> = {};
      if (trimmedMain) {
        if (provider === "gemini") patch.geminiApiKey = trimmedMain;
        else patch.apiKey = trimmedMain;
      }
      if (trimmedExtras.length > 0) {
        if (provider === "gemini") {
          patch.keepGeminiBackupIndexes = maskedBackups.map((_, i) => i);
          patch.newGeminiBackupKeys = trimmedExtras;
        } else {
          patch.keepBackupIndexes = maskedBackups.map((_, i) => i);
          patch.newBackupKeys = trimmedExtras;
        }
      }
      return Object.keys(patch).length > 0 ? patch : null;
    }

    const combinedNew = [
      ...(trimmedMain ? [trimmedMain] : []),
      ...trimmedExtras,
    ];
    if (combinedNew.length === 0) return null;
    return provider === "gemini"
      ? {
          keepGeminiBackupIndexes: maskedBackups.map((_, i) => i),
          newGeminiBackupKeys: combinedNew,
        }
      : {
          keepBackupIndexes: maskedBackups.map((_, i) => i),
          newBackupKeys: combinedNew,
        };
  }

  function syncDraft(
    nextMode: KeyFormMode,
    nextTarget: "primary" | "backup",
    nextMain: string,
    nextExtras: string[]
  ) {
    onPendingPatchChange(
      buildPendingPatch(nextMode, nextTarget, nextMain, nextExtras)
    );
  }

  function openCreateForm() {
    const nextMode: KeyFormMode = { kind: "create" };
    const nextTarget: "primary" | "backup" = hasPrimary ? "backup" : "primary";
    setFormMode(nextMode);
    setCreateTarget(nextTarget);
    setDraftKey("");
    setExtraBackups([]);
    setRowTests((prev) => {
      const next = { ...prev };
      delete next.draft_main;
      return next;
    });
    syncDraft(nextMode, nextTarget, "", []);
  }

  function openEditPrimary() {
    const nextMode: KeyFormMode = { kind: "edit_primary" };
    setFormMode(nextMode);
    setDraftKey("");
    setExtraBackups([]);
    setRowTests((prev) => {
      const next = { ...prev };
      delete next.draft_main;
      return next;
    });
    syncDraft(nextMode, "primary", "", []);
  }

  function openEditBackup(index: number) {
    const nextMode: KeyFormMode = { kind: "edit_backup", index };
    setFormMode(nextMode);
    setDraftKey("");
    setExtraBackups([]);
    setRowTests((prev) => {
      const next = { ...prev };
      delete next.draft_main;
      return next;
    });
    syncDraft(nextMode, "backup", "", []);
  }

  function closeForm() {
    setFormMode(null);
    setDraftKey("");
    setExtraBackups([]);
    onPendingPatchChange(null);
  }

  async function pasteText(onVal: (val: string) => void) {
    const pasted = await readClipboardText();
    if (!pasted) {
      onFeedbackError(
        "Clipboard kosong atau belum diizinkan. Salin API key dulu lalu coba lagi."
      );
      return;
    }
    onVal(pasted);
  }

  async function runSingleKeyTest(
    rowId: string,
    target:
      | { kind: "typed"; apiKey: string }
      | { kind: "dedicated_primary" }
      | { kind: "dedicated_backup"; index: number }
      | { kind: "shared_provider"; providerId: string }
  ) {
    if (target.kind === "typed" && !target.apiKey.trim()) {
      setRowTests((prev) => ({
        ...prev,
        [rowId]: {
          status: "fail",
          message: "Tempel atau ketik API key dulu sebelum dites.",
        },
      }));
      return;
    }

    setRowTests((prev) => ({
      ...prev,
      [rowId]: { status: "testing" },
    }));

    try {
      const res = await fetch("/api/tts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          target:
            target.kind === "shared_provider" &&
            target.providerId === "__shared_default__"
              ? undefined
              : target,
          modelId: effectiveModel,
          voiceId,
        }),
      });
      const data = await res.json().catch(() => ({}));

      const models = Array.isArray(data.models)
        ? (data.models as TtsModelOption[])
        : [];
      const recs = Array.isArray(data.recommended)
        ? (data.recommended as string[])
        : pickDynamicRecommendedTtsModels(models, provider);

      if (models.length > 0) {
        onDetectedModelsFromTest(models, recs);
      }

      if (res.ok && data.ok) {
        const countPart =
          typeof data.activeModelsCount === "number" &&
          data.activeModelsCount > 0
            ? ` · ${data.activeModelsCount} model aktif`
            : models.length > 0
              ? ` · ${models.length} model aktif`
              : "";
        const quotaPart =
          typeof data.quotaNote === "string" && data.quotaNote
            ? ` · ${data.quotaNote}`
            : "";
        const activeMod =
          typeof data.activeModel === "string" && data.activeModel
            ? data.activeModel
            : effectiveModel;

        setRowTests((prev) => ({
          ...prev,
          [rowId]: {
            status: "ok",
            message: `Terhubung · ${activeMod} siap${countPart}${quotaPart}`,
            activeModels: models,
            recommended: recs,
          },
        }));
        return;
      }

      if (data.modelUnavailable) {
        const suggested =
          typeof data.suggestedModel === "string" && data.suggestedModel
            ? data.suggestedModel
            : recs[0] || models[0]?.id;
        setRowTests((prev) => ({
          ...prev,
          [rowId]: {
            status: "model_unavailable",
            message:
              data.error ||
              `Key aktif, namun model "${effectiveModel}" tidak tersedia di key ini.`,
            suggestedModel: suggested,
            activeModels: models,
            recommended: recs,
          },
        }));
        return;
      }

      setRowTests((prev) => ({
        ...prev,
        [rowId]: {
          status: "fail",
          message: data.error || "Gagal menguji API key ini.",
        },
      }));
    } catch {
      setRowTests((prev) => ({
        ...prev,
        [rowId]: {
          status: "fail",
          message: "Koneksi gagal saat menguji API key.",
        },
      }));
    }
  }

  async function handleSaveForm() {
    const patch = buildPendingPatch(
      formMode,
      createTarget,
      draftKey,
      extraBackups
    );
    if (!patch) {
      onFeedbackError("Tempel API key baru terlebih dulu sebelum menyimpan.");
      return;
    }

    setFormBusy(true);
    try {
      const fullPatch = {
        ...patch,
        ...(provider === "gemini"
          ? { geminiModelId: effectiveModel }
          : { modelId: effectiveModel }),
      };
      const labelMsg =
        formMode?.kind === "edit_primary"
          ? "Key utama suara diperbarui."
          : formMode?.kind === "edit_backup"
            ? `Key cadangan #${formMode.index + 1} diperbarui.`
            : "API key suara tersimpan.";
      const ok = await onPatchKeys(fullPatch, labelMsg);
      if (ok) {
        closeForm();
      }
    } finally {
      setFormBusy(false);
    }
  }

  async function handlePromoteBackup(index: number) {
    setFormBusy(true);
    try {
      const patch =
        provider === "gemini"
          ? { promoteGeminiBackupIndex: index }
          : { promoteBackupIndex: index };
      await onPatchKeys(
        patch,
        `Key cadangan #${index + 1} dijadikan key utama.`
      );
      setRowTests({});
    } finally {
      setFormBusy(false);
    }
  }

  async function handleDeletePrimary() {
    if (!confirm("Hapus key utama suara ini?")) return;
    setFormBusy(true);
    try {
      const patch =
        provider === "gemini"
          ? { clearGeminiApiKey: true }
          : { clearApiKey: true };
      await onPatchKeys(patch, "Key utama suara dihapus.");
      setRowTests((prev) => {
        const next = { ...prev };
        delete next.primary;
        return next;
      });
    } finally {
      setFormBusy(false);
    }
  }

  async function handleDeleteBackup(index: number) {
    if (!confirm(`Hapus key cadangan #${index + 1}?`)) return;
    setFormBusy(true);
    try {
      const remaining = maskedBackups
        .map((_, idx) => idx)
        .filter((idx) => idx !== index);
      const patch =
        provider === "gemini"
          ? { keepGeminiBackupIndexes: remaining }
          : { keepBackupIndexes: remaining };
      await onPatchKeys(patch, `Key cadangan #${index + 1} dihapus.`);
      setRowTests({});
    } finally {
      setFormBusy(false);
    }
  }

  function renderRowTestFeedback(rowId: string) {
    const t = rowTests[rowId];
    if (!t) return null;

    if (t.status === "testing") {
      return (
        <p className="mt-2 text-xs text-muted">
          Menguji API key ini &amp; mengecek model suara aktif...
        </p>
      );
    }

    if (t.status === "ok") {
      return (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          ✓ {t.message}
        </p>
      );
    }

    if (t.status === "model_unavailable") {
      return (
        <div className="mt-2 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            ⚠ {t.message}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {t.suggestedModel && (
              <button
                type="button"
                disabled={busy || formBusy}
                onClick={async () => {
                  await onSelectAndSaveModel(t.suggestedModel!);
                  setRowTests((prev) => ({
                    ...prev,
                    [rowId]: {
                      status: "ok",
                      message: `Model diperbarui ke ${t.suggestedModel} dan siap dipakai.`,
                      activeModels: t.activeModels,
                      recommended: t.recommended,
                    },
                  }));
                }}
                className="rounded-lg bg-ink px-2.5 py-1 text-[11px] font-semibold text-surface transition hover:opacity-90 disabled:opacity-50"
              >
                Pakai {t.suggestedModel}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenModelEditor}
              className="rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:bg-surface-2"
            >
              Pilih / Edit Model
            </button>
          </div>
        </div>
      );
    }

    return (
      <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
        ✗ {t.message}
      </p>
    );
  }

  const draftTest = rowTests.draft_main;
  const draftSortedModels = useMemo(() => {
    if (!draftTest?.activeModels?.length) return [];
    return sortTtsModels(draftTest.activeModels, draftTest.recommended ?? []);
  }, [draftTest]);

  const keyPortalHref =
    provider === "gemini"
      ? "https://aistudio.google.com/apikey"
      : "https://elevenlabs.io/app/settings/api-keys";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
          {provider === "gemini"
            ? "Daftar API Key Gemini TTS"
            : "Daftar API Key ElevenLabs"}
        </h3>
        {!formMode && (
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-line"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Tambah
          </button>
        )}
      </div>

      {!hasAnyRegistered && !formMode && (
        <p className="rounded-xl border border-dashed border-line p-3.5 text-center text-xs text-muted">
          Belum ada API key terdaftar. Klik <b>+ Tambah</b> untuk menempel key dan mengujinya sebelum disimpan.
        </p>
      )}

      {/* Daftar API key terdaftar (mirip menu Setelan, masing-masing bisa dites 1/1) */}
      {hasAnyRegistered && (
        <div className="space-y-2">
          {hasPrimary && (
            <div className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-ink">
                      Key Suara Utama
                    </span>
                    <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-surface">
                      utama
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted">
                    {effectiveModel} · {maskedPrimary || "••••"}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={busy || formBusy}
                  onClick={() =>
                    void runSingleKeyTest("primary", {
                      kind: "dedicated_primary",
                    })
                  }
                  title="Tes key utama ini (1/1)"
                  aria-label="Tes key utama ini"
                  className="rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                >
                  <BoltIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={busy || formBusy}
                  onClick={openEditPrimary}
                  title="Edit key utama"
                  aria-label="Edit key utama"
                  className="rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={busy || formBusy}
                  onClick={() => void handleDeletePrimary()}
                  title="Hapus key utama"
                  aria-label="Hapus key utama"
                  className="rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-rose-600 disabled:opacity-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
              {renderRowTestFeedback("primary")}
            </div>
          )}

          {maskedBackups.map((masked, idx) => {
            const rowKey = `backup:${idx}`;
            return (
              <div
                key={rowKey}
                className="rounded-xl border border-line bg-surface p-3"
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-ink">
                        Key Cadangan #{idx + 1}
                      </span>
                      <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                        cadangan
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted">
                      {effectiveModel} · {masked}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={busy || formBusy}
                    onClick={() =>
                      void runSingleKeyTest(rowKey, {
                        kind: "dedicated_backup",
                        index: idx,
                      })
                    }
                    title={`Tes key cadangan #${idx + 1} (1/1)`}
                    aria-label={`Tes key cadangan #${idx + 1}`}
                    className="rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                  >
                    <BoltIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busy || formBusy}
                    onClick={() => openEditBackup(idx)}
                    title={`Edit key cadangan #${idx + 1}`}
                    aria-label={`Edit key cadangan #${idx + 1}`}
                    className="rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busy || formBusy}
                    onClick={() => void handlePromoteBackup(idx)}
                    title="Jadikan key utama"
                    aria-label="Jadikan key utama"
                    className="rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                  >
                    <CheckIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busy || formBusy}
                    onClick={() => void handleDeleteBackup(idx)}
                    title={`Hapus key cadangan #${idx + 1}`}
                    aria-label={`Hapus key cadangan #${idx + 1}`}
                    className="rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-rose-600 disabled:opacity-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                {renderRowTestFeedback(rowKey)}
              </div>
            );
          })}

          {effectiveSharedList.map((sp) => {
            const rowKey = `shared:${sp.id}`;
            const isPrimaryActive = !hasPrimary && maskedBackups.length === 0;
            return (
              <div
                key={rowKey}
                className="rounded-xl border border-line bg-surface p-3"
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-ink">
                        {sp.label}
                      </span>
                      <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                        dari Setelan
                      </span>
                      {isPrimaryActive && (
                        <span className="rounded-full bg-[#4687fe]/15 dark:bg-[#d5b767]/15 px-2 py-0.5 text-[10px] font-bold text-[#205ac4] dark:text-[#e8cf75]">
                          dipakai aktif
                        </span>
                      )}
                      {sp.backupCount > 0 && (
                        <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                          +{sp.backupCount} key
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted">
                      {effectiveModel} · {sp.maskedKey}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={busy || formBusy}
                    onClick={() =>
                      void runSingleKeyTest(rowKey, {
                        kind: "shared_provider",
                        providerId: sp.id,
                      })
                    }
                    title="Tes key Setelan ini untuk Suara (1/1)"
                    aria-label="Tes key Setelan ini untuk Suara"
                    className="rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                  >
                    <BoltIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busy || formBusy}
                    onClick={onOpenModelEditor}
                    title="Pilih atau edit model suara"
                    aria-label="Pilih atau edit model suara"
                    className="rounded-full p-2 text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                </div>
                {renderRowTestFeedback(rowKey)}
              </div>
            );
          })}
        </div>
      )}

      {/* Form Tambah / Edit API Key + Tes Dulu Sebelum Disimpan */}
      {formMode && (
        <div className="space-y-3 rounded-xl border border-line bg-surface-2/60 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              {formMode.kind === "edit_primary"
                ? "Edit Key Suara Utama"
                : formMode.kind === "edit_backup"
                  ? `Edit Key Cadangan #${formMode.index + 1}`
                  : "Tambah API Key Suara"}
            </h4>
            {hasAnyRegistered && (
              <button
                type="button"
                onClick={closeForm}
                className="text-xs text-ink-soft hover:text-ink"
              >
                Tutup
              </button>
            )}
          </div>

          {formMode.kind === "create" && hasPrimary && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
              <button
                type="button"
                onClick={() => {
                  setCreateTarget("backup");
                  syncDraft(formMode, "backup", draftKey, extraBackups);
                }}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  createTarget === "backup"
                    ? "bg-ink text-surface"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                Tambah jadi Cadangan
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateTarget("primary");
                  syncDraft(formMode, "primary", draftKey, extraBackups);
                }}
                className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  createTarget === "primary"
                    ? "bg-ink text-surface"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                Ganti Key Utama
              </button>
            </div>
          )}

          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-soft">
                {formMode.kind === "edit_primary"
                  ? `Ganti Key Utama (${maskedPrimary || "tersimpan"})`
                  : formMode.kind === "edit_backup"
                    ? `Ganti Key Cadangan #${formMode.index + 1} (${maskedBackups[formMode.index] || "tersimpan"})`
                    : createTarget === "backup" && hasPrimary
                      ? `API key cadangan baru #${maskedBackups.length + 1}`
                      : "API key baru"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRawKey((v) => !v)}
                  className="text-[11px] font-medium text-ink-soft hover:text-ink"
                >
                  {showRawKey ? "Sembunyikan" : "Tampilkan"}
                </button>
                <a
                  href={keyPortalHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-semibold text-ink underline underline-offset-2"
                >
                  Ambil key ↗
                </a>
              </div>
            </div>

            <div className="flex gap-1.5">
              <input
                type="text"
                value={draftKey}
                onChange={(e) => {
                  const val = e.target.value;
                  setDraftKey(val);
                  syncDraft(formMode, createTarget, val, extraBackups);
                }}
                placeholder={
                  provider === "gemini"
                    ? "Tempel API key Gemini (AIzaSy...)..."
                    : "Tempel API key ElevenLabs (sk_...)..."
                }
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                className={`min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none ${
                  showRawKey ? "" : "masked-key"
                }`}
              />
              <button
                type="button"
                onClick={() =>
                  void pasteText((val) => {
                    setDraftKey(val);
                    syncDraft(formMode, createTarget, val, extraBackups);
                  })
                }
                className="shrink-0 rounded-xl border border-line bg-surface px-2.5 py-2 text-xs font-semibold text-ink transition hover:bg-line/50"
              >
                Tempel
              </button>
            </div>
          </div>

          {/* Hasil tes pra-simpan beserta daftar model yang aktif di key baru ini */}
          {draftTest && (
            <div
              className={`space-y-2 rounded-xl border p-2.5 ${
                draftTest.status === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : draftTest.status === "model_unavailable"
                    ? "border-amber-500/30 bg-amber-500/10"
                    : draftTest.status === "fail"
                      ? "border-rose-500/30 bg-rose-500/10"
                      : "border-line bg-surface"
              }`}
            >
              <p
                className={`text-xs ${
                  draftTest.status === "ok"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : draftTest.status === "model_unavailable"
                      ? "text-amber-800 dark:text-amber-300"
                      : draftTest.status === "fail"
                        ? "text-rose-600 dark:text-rose-300"
                        : "text-muted"
                }`}
              >
                {draftTest.status === "testing"
                  ? "Menguji API key baru & mengecek model yang aktif..."
                  : draftTest.status === "ok"
                    ? `✓ ${draftTest.message}`
                    : draftTest.status === "model_unavailable"
                      ? `⚠ ${draftTest.message}`
                      : `✗ ${draftTest.message}`}
              </p>

              {draftSortedModels.length > 0 && (
                <div className="space-y-1.5 pt-0.5">
                  <span className="block text-[11px] font-semibold text-ink-soft">
                    Model suara aktif di API key ini (klik untuk pakai):
                  </span>
                  <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                    {draftSortedModels.map((m) => {
                      const selected = effectiveModel === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onSelectModel(m.id);
                            setRowTests((prev) => ({
                              ...prev,
                              draft_main: {
                                ...draftTest,
                                status: "ok",
                                message: `Key aktif · model dipilih: ${m.id}`,
                              },
                            }));
                          }}
                          className={`rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                            selected
                              ? "border-ink bg-ink text-surface"
                              : "border-line bg-surface text-ink hover:bg-surface-2"
                          }`}
                        >
                          {m.id}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Slot cadangan tambahan saat mode tambah */}
          {formMode.kind === "create" && extraBackups.length > 0 && (
            <div className="space-y-2 border-t border-line pt-2.5">
              <span className="block text-[11px] font-medium text-ink-soft">
                Key cadangan tambahan (bisa dites 1/1 sebelum disimpan)
              </span>
              {extraBackups.map((val, idx) => {
                const extraRowKey = `draft_extra:${idx}`;
                return (
                  <div key={extraRowKey} className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => {
                          const nextList = extraBackups.map((v, i) =>
                            i === idx ? e.target.value : v
                          );
                          setExtraBackups(nextList);
                          syncDraft(formMode, createTarget, draftKey, nextList);
                        }}
                        placeholder={`API key cadangan tambahan #${idx + 1}...`}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        data-1p-ignore="true"
                        data-lpignore="true"
                        className={`min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none ${
                          showRawKey ? "" : "masked-key"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void pasteText((pasted) => {
                            const nextList = extraBackups.map((v, i) =>
                              i === idx ? pasted : v
                            );
                            setExtraBackups(nextList);
                            syncDraft(formMode, createTarget, draftKey, nextList);
                          })
                        }
                        className="shrink-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] font-semibold text-ink hover:bg-line/50"
                      >
                        Tempel
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void runSingleKeyTest(extraRowKey, {
                            kind: "typed",
                            apiKey: val,
                          })
                        }
                        title="Tes key cadangan ini sebelum disimpan"
                        aria-label="Tes key cadangan ini sebelum disimpan"
                        className="shrink-0 rounded-lg border border-line bg-surface p-1.5 text-ink-soft hover:text-ink"
                      >
                        <BoltIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextList = extraBackups.filter(
                            (_, i) => i !== idx
                          );
                          setExtraBackups(nextList);
                          syncDraft(formMode, createTarget, draftKey, nextList);
                        }}
                        aria-label="Hapus baris"
                        className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink"
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                    {renderRowTestFeedback(extraRowKey)}
                  </div>
                );
              })}
            </div>
          )}

          {formMode.kind === "create" &&
            extraBackups.length +
              (createTarget === "backup" && hasPrimary ? 1 : 0) <
              maxExtraBackups && (
              <button
                type="button"
                onClick={() => setExtraBackups((prev) => [...prev, ""])}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-soft hover:text-ink"
              >
                <PlusIcon className="h-3.5 w-3.5" /> Tambah baris cadangan lagi
              </button>
            )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy || formBusy || !draftKey.trim()}
              onClick={() =>
                void runSingleKeyTest("draft_main", {
                  kind: "typed",
                  apiKey: draftKey,
                })
              }
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:bg-line/50 disabled:opacity-50"
            >
              <BoltIcon className="h-3.5 w-3.5" />
              Tes &amp; Cek Model
            </button>
            <button
              type="button"
              disabled={
                busy ||
                formBusy ||
                (!draftKey.trim() &&
                  !extraBackups.some((k) => Boolean(k.trim())))
              }
              onClick={() => void handleSaveForm()}
              className="flex-1 rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-50"
            >
              {formBusy ? "Menyimpan..." : "Simpan Key"}
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted">
            Klik <b>Tes &amp; Cek Model</b> untuk menguji key baru sekaligus melihat model suara yang aktif sebelum disimpan.
          </p>
        </div>
      )}
    </div>
  );
}

function HdVoiceCard({
  ttsSummary,
  voiceSettings,
  onSaveTts,
  onNotice,
  open,
  onToggle,
}: {
  ttsSummary: TtsAccountSummary;
  voiceSettings: VoiceSettings;
  onSaveTts: (
    patch: Record<string, unknown>
  ) => Promise<TtsAccountSummary | null>;
  onNotice?: (msg: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const isSpeaking = useIsSpeaking();
  const [provider, setProvider] = useState<HdTtsProvider>(ttsSummary.provider);
  const [keyConfigOpen, setKeyConfigOpen] = useState<{
    gemini: boolean;
    elevenlabs: boolean;
  }>(() => ({
    gemini: !(
      ttsSummary.hasGeminiKey ||
      ttsSummary.geminiBackupCount > 0 ||
      ttsSummary.hasSharedGeminiKey
    ),
    elevenlabs: !(ttsSummary.hasKey || ttsSummary.backupCount > 0),
  }));

  const [geminiModelId, setGeminiModelId] = useState<GeminiTtsModelId>(
    ttsSummary.geminiModelId
  );
  const [geminiFemaleVoice, setGeminiFemaleVoice] = useState(
    ttsSummary.geminiFemaleVoice
  );
  const [geminiMaleVoice, setGeminiMaleVoice] = useState(
    ttsSummary.geminiMaleVoice
  );
  const [geminiFemaleStyle, setGeminiFemaleStyle] = useState(
    ttsSummary.geminiFemaleStyle || ttsSummary.geminiStyle
  );
  const [geminiMaleStyle, setGeminiMaleStyle] = useState(
    ttsSummary.geminiMaleStyle || ttsSummary.geminiStyle
  );

  const [modelId, setModelId] = useState<HdTtsModelId>(ttsSummary.modelId);
  const [femaleVoiceId, setFemaleVoiceId] = useState(ttsSummary.femaleVoiceId);
  const [maleVoiceId, setMaleVoiceId] = useState(ttsSummary.maleVoiceId);
  const [stability, setStability] = useState(ttsSummary.stability);
  const [similarityBoost, setSimilarityBoost] = useState(
    ttsSummary.similarityBoost
  );

  const [pendingKeyPatches, setPendingKeyPatches] = useState<
    Partial<Record<HdTtsProvider, Record<string, unknown> | null>>
  >({});

  const [saving, setSaving] = useState(false);
  const [testingSlot, setTestingSlot] = useState<"female" | "male" | null>(
    null
  );
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const [detectedModels, setDetectedModels] = useState<
    Partial<Record<HdTtsProvider, TtsModelOption[] | null>>
  >({});
  const [liveRecommended, setLiveRecommended] = useState<
    Partial<Record<HdTtsProvider, string[]>>
  >({});
  const [modelsBusy, setModelsBusy] = useState<
    Partial<Record<HdTtsProvider, boolean>>
  >({});
  const [modelsError, setModelsError] = useState<
    Partial<Record<HdTtsProvider, string | null>>
  >({});
  const [autoNotices, setAutoNotices] = useState<
    Partial<Record<HdTtsProvider, string | null>>
  >({});
  const [showModelList, setShowModelList] = useState<
    Partial<Record<HdTtsProvider, boolean>>
  >({});
  const detectSeqRef = useRef(0);

  async function detectModelsFor(
    targetProvider: HdTtsProvider,
    opts?: {
      openDropdown?: boolean;
      silentIfMissingKey?: boolean;
    }
  ) {
    const pendingPatch = pendingKeyPatches[targetProvider];
    const typedPrimary =
      targetProvider === "gemini"
        ? typeof pendingPatch?.geminiApiKey === "string"
          ? pendingPatch.geminiApiKey
          : ""
        : typeof pendingPatch?.apiKey === "string"
          ? pendingPatch.apiKey
          : "";
    const typedBackups =
      targetProvider === "gemini"
        ? Array.isArray(pendingPatch?.newGeminiBackupKeys)
          ? (pendingPatch.newGeminiBackupKeys as string[])
          : []
        : Array.isArray(pendingPatch?.newBackupKeys)
          ? (pendingPatch.newBackupKeys as string[])
          : [];

    const hasAnyKey =
      Boolean(typedPrimary.trim()) ||
      typedBackups.some((k) => Boolean(k.trim())) ||
      (targetProvider === "gemini"
        ? ttsSummary.hasGeminiKey ||
          ttsSummary.geminiBackupCount > 0 ||
          ttsSummary.hasSharedGeminiKey
        : ttsSummary.hasKey || ttsSummary.backupCount > 0);

    if (!hasAnyKey) {
      if (!opts?.silentIfMissingKey) {
        setModelsError((prev) => ({
          ...prev,
          [targetProvider]:
            targetProvider === "gemini"
              ? "Tambahkan API key Gemini dulu (di atas atau di menu Setelan)."
              : "Tambahkan API key ElevenLabs dulu.",
        }));
        if (opts?.openDropdown) {
          setShowModelList((prev) => ({ ...prev, [targetProvider]: true }));
        }
      }
      return;
    }

    const currentModelVal =
      targetProvider === "gemini" ? geminiModelId : modelId;
    const seq = ++detectSeqRef.current;
    setModelsBusy((prev) => ({ ...prev, [targetProvider]: true }));
    setModelsError((prev) => ({ ...prev, [targetProvider]: null }));

    try {
      const res = await fetch("/api/tts/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: targetProvider,
          apiKey: typedPrimary.trim(),
          backupKeys: typedBackups,
          currentModel: currentModelVal.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (seq !== detectSeqRef.current) return;

      if (!res.ok || !data.ok) {
        setDetectedModels((prev) => ({ ...prev, [targetProvider]: null }));
        setLiveRecommended((prev) => ({ ...prev, [targetProvider]: [] }));
        setModelsError((prev) => ({
          ...prev,
          [targetProvider]: data.error || "Gagal mendeteksi model suara.",
        }));
        if (opts?.openDropdown) {
          setShowModelList((prev) => ({ ...prev, [targetProvider]: true }));
        }
        return;
      }

      const fetched = (data.models ?? []) as TtsModelOption[];
      const recs = Array.isArray(data.recommended)
        ? (data.recommended as string[])
        : pickDynamicRecommendedTtsModels(fetched, targetProvider);
      const best =
        typeof data.bestModel === "string" ? data.bestModel : recs[0] ?? "";

      setDetectedModels((prev) => ({ ...prev, [targetProvider]: fetched }));
      setLiveRecommended((prev) => ({ ...prev, [targetProvider]: recs }));

      if (opts?.openDropdown) {
        setShowModelList((prev) => ({ ...prev, [targetProvider]: true }));
      }

      const trimmedCur = cleanTtsModelId(currentModelVal);
      if (!trimmedCur && best) {
        if (targetProvider === "gemini") setGeminiModelId(best);
        else setModelId(best);
        setAutoNotices((prev) => ({ ...prev, [targetProvider]: null }));
      } else if (trimmedCur && data.currentAvailable === false && best) {
        if (targetProvider === "gemini") setGeminiModelId(best);
        else setModelId(best);
        setAutoNotices((prev) => ({
          ...prev,
          [targetProvider]: `Model "${trimmedCur}" tidak tersedia di key ini — diganti otomatis ke "${best}".`,
        }));
      } else {
        setAutoNotices((prev) => ({ ...prev, [targetProvider]: null }));
      }
    } catch {
      if (seq !== detectSeqRef.current) return;
      setDetectedModels((prev) => ({ ...prev, [targetProvider]: null }));
      setLiveRecommended((prev) => ({ ...prev, [targetProvider]: [] }));
      setModelsError((prev) => ({
        ...prev,
        [targetProvider]: "Koneksi gagal saat mendeteksi model suara.",
      }));
      if (opts?.openDropdown) {
        setShowModelList((prev) => ({ ...prev, [targetProvider]: true }));
      }
    } finally {
      if (seq === detectSeqRef.current) {
        setModelsBusy((prev) => ({ ...prev, [targetProvider]: false }));
      }
    }
  }

  async function applyDirectKeyPatch(
    patch: Record<string, unknown>,
    okMessage: string
  ): Promise<boolean> {
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await onSaveTts(patch);
      if (updated) {
        invalidateHdAudioCache();
        setGeminiModelId(updated.geminiModelId);
        setModelId(updated.modelId);
        setPendingKeyPatches((prev) => ({ ...prev, [provider]: null }));
        setFeedback({ kind: "ok", text: okMessage });
        return true;
      }
      setFeedback({
        kind: "err",
        text: "Gagal memperbarui API key Suara HD.",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }

  const effectiveGeminiModel =
    cleanTtsModelId(geminiModelId) || DEFAULT_GEMINI_MODEL_ID;
  const effectiveElevenModel = cleanTtsModelId(modelId) || DEFAULT_HD_MODEL_ID;

  const hasPendingChanges =
    provider !== ttsSummary.provider ||
    Boolean(pendingKeyPatches.gemini) ||
    Boolean(pendingKeyPatches.elevenlabs) ||
    effectiveGeminiModel !== ttsSummary.geminiModelId ||
    geminiFemaleVoice.trim() !== ttsSummary.geminiFemaleVoice ||
    geminiMaleVoice.trim() !== ttsSummary.geminiMaleVoice ||
    geminiFemaleStyle.trim() !== (ttsSummary.geminiFemaleStyle || ttsSummary.geminiStyle) ||
    geminiMaleStyle.trim() !== (ttsSummary.geminiMaleStyle || ttsSummary.geminiStyle) ||
    effectiveElevenModel !== ttsSummary.modelId ||
    femaleVoiceId.trim() !== ttsSummary.femaleVoiceId ||
    maleVoiceId.trim() !== ttsSummary.maleVoiceId ||
    Math.abs(stability - ttsSummary.stability) > 0.005 ||
    Math.abs(similarityBoost - ttsSummary.similarityBoost) > 0.005;

  async function persistChanges(
    silent = false,
    overrideProvider?: HdTtsProvider
  ): Promise<TtsAccountSummary | null> {
    const nextProvider = overrideProvider ?? provider;

    if (geminiModelId.trim() && !cleanTtsModelId(geminiModelId)) {
      setFeedback({
        kind: "err",
        text: "ID model Gemini TTS tidak valid (hindari spasi).",
      });
      return null;
    }
    if (modelId.trim() && !cleanTtsModelId(modelId)) {
      setFeedback({
        kind: "err",
        text: "ID model ElevenLabs tidak valid (hindari spasi).",
      });
      return null;
    }
    if (!cleanVoiceId(geminiFemaleVoice) || !cleanVoiceId(geminiMaleVoice)) {
      setFeedback({ kind: "err", text: "Nama suara Gemini tidak valid." });
      return null;
    }
    if (!cleanVoiceId(femaleVoiceId) || !cleanVoiceId(maleVoiceId)) {
      setFeedback({
        kind: "err",
        text: "Voice ID ElevenLabs tidak valid (hindari spasi).",
      });
      return null;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        provider: nextProvider,
        ...(pendingKeyPatches.gemini ?? {}),
        ...(pendingKeyPatches.elevenlabs ?? {}),
        geminiModelId: effectiveGeminiModel,
        geminiFemaleVoice: geminiFemaleVoice.trim(),
        geminiMaleVoice: geminiMaleVoice.trim(),
        geminiFemaleStyle: geminiFemaleStyle.trim(),
        geminiMaleStyle: geminiMaleStyle.trim(),
        modelId: effectiveElevenModel,
        femaleVoiceId: femaleVoiceId.trim(),
        maleVoiceId: maleVoiceId.trim(),
        stability,
        similarityBoost,
      };

      const updated = await onSaveTts(payload);
      if (updated) {
        invalidateHdAudioCache();
        setProvider(updated.provider);
        setPendingKeyPatches({});
        setGeminiModelId(updated.geminiModelId);
        setGeminiFemaleVoice(updated.geminiFemaleVoice);
        setGeminiMaleVoice(updated.geminiMaleVoice);
        setGeminiFemaleStyle(updated.geminiFemaleStyle || updated.geminiStyle);
        setGeminiMaleStyle(updated.geminiMaleStyle || updated.geminiStyle);
        setModelId(updated.modelId);
        setFemaleVoiceId(updated.femaleVoiceId);
        setMaleVoiceId(updated.maleVoiceId);
        if (!silent) {
          setFeedback({ kind: "ok", text: "Pengaturan Suara HD tersimpan." });
        }
      } else {
        setFeedback({
          kind: "err",
          text: "Gagal menyimpan pengaturan Suara HD.",
        });
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
      setKeyConfigOpen((prev) => ({ ...prev, [provider]: true }));
      setFeedback({
        kind: "err",
        text:
          provider === "gemini"
            ? "Tambahkan API key Gemini di Setelan atau buka bagian API Key Gemini di bawah dulu."
            : "Tambahkan API key ElevenLabs di bagian API Key di bawah terlebih dulu.",
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
    ttsSummary.hasGeminiKey ||
    ttsSummary.geminiBackupCount > 0 ||
    Boolean(pendingKeyPatches.gemini) ||
    ttsSummary.hasSharedGeminiKey;
  const elevenReadyNow =
    ttsSummary.hasKey ||
    ttsSummary.backupCount > 0 ||
    Boolean(pendingKeyPatches.elevenlabs);
  const activeBadgeReady =
    provider === "gemini" ? geminiReadyNow : elevenReadyNow;

  const badgeLabel = (() => {
    if (!activeBadgeReady) return "Belum diatur";
    if (provider === "gemini") {
      if (ttsSummary.hasGeminiKey || ttsSummary.geminiBackupCount > 0) {
        return `Aktif${ttsSummary.geminiBackupCount ? ` +${ttsSummary.geminiBackupCount}` : ""}`;
      }
      return "Aktif · Key Setelan";
    }
    return `Aktif${ttsSummary.backupCount ? ` +${ttsSummary.backupCount}` : ""}`;
  })();

  const hdSubtitle =
    provider === "gemini"
      ? `Gemini TTS · ${geminiFemaleVoice.trim() || "Kore"} (P) & ${geminiMaleVoice.trim() || "Puck"} (L)`
      : "ElevenLabs · Slot Perempuan & Laki-laki";

  return (
    <VoiceAccordionCard
      title="Suara HD (Gemini & ElevenLabs)"
      subtitle={hdSubtitle}
      badge={badgeLabel}
      badgeTone={activeBadgeReady ? "active" : "neutral"}
      open={open}
      onToggle={onToggle}
    >
      <div className="space-y-3.5">
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

            {/* Gaya Bicara per slot — agar tiap karakter punya suara khas */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-ink">
                Gaya bicara per suara (opsional)
              </label>
              <div className="space-y-2">
                <div>
                  <span className="mb-1 block text-[11px] font-medium text-ink-soft">Perempuan (Slot 1) — mis. Arissa/Kirana</span>
                  <input
                    type="text"
                    value={geminiFemaleStyle}
                    onChange={(e) => setGeminiFemaleStyle(e.target.value)}
                    placeholder="mis. hangat & ramah, senyum di suara, tempo sedang"
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                  />
                </div>
                <div>
                  <span className="mb-1 block text-[11px] font-medium text-ink-soft">Laki-laki (Slot 2) — mis. Musthzen</span>
                  <input
                    type="text"
                    value={geminiMaleStyle}
                    onChange={(e) => setGeminiMaleStyle(e.target.value)}
                    placeholder="mis. tenang & dalam, mantap, bicara jelas"
                    className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
                  />
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                Bedakan gaya tiap slot biar tiap karakter punya warna suara khas saat dipakai di Profil Karakter.
              </p>
            </div>

            {/* Sub-lipatan API Key & Model Gemini TTS */}
            <div className="overflow-hidden rounded-xl border border-line bg-surface-2/30">
              <button
                type="button"
                onClick={() =>
                  setKeyConfigOpen((prev) => ({ ...prev, gemini: !prev.gemini }))
                }
                aria-expanded={keyConfigOpen.gemini}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-ink">
                    API Key &amp; Model Gemini TTS
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {effectiveGeminiModel} · {badgeLabel}
                  </span>
                </div>
                <ChevronDownIcon
                  className={`h-4 w-4 shrink-0 text-ink-soft transition-transform duration-200 ${
                    keyConfigOpen.gemini ? "rotate-180 text-ink" : ""
                  }`}
                />
              </button>

              {keyConfigOpen.gemini && (
                <div className="space-y-3.5 border-t border-line bg-surface p-3.5">
                  <TtsProviderKeySection
                    key="gemini"
                    provider="gemini"
                    hasPrimary={ttsSummary.hasGeminiKey}
                    maskedPrimary={ttsSummary.maskedGeminiKey}
                    maskedBackups={ttsSummary.maskedGeminiBackupKeys}
                    hasSharedFallback={ttsSummary.hasSharedGeminiKey}
                    sharedProviders={ttsSummary.sharedGeminiProviders ?? []}
                    modelId={geminiModelId}
                    defaultModel={DEFAULT_GEMINI_MODEL_ID}
                    voiceId={geminiFemaleVoice}
                    busy={saving}
                    onSelectModel={(next) => {
                      setGeminiModelId(next);
                      setAutoNotices((prev) => ({ ...prev, gemini: null }));
                    }}
                    onSelectAndSaveModel={async (next) => {
                      setGeminiModelId(next);
                      await applyDirectKeyPatch(
                        { geminiModelId: next },
                        `Model Gemini TTS diperbarui ke ${next}.`
                      );
                    }}
                    onOpenModelEditor={() =>
                      void detectModelsFor("gemini", {
                        openDropdown: true,
                        silentIfMissingKey: false,
                      })
                    }
                    onDetectedModelsFromTest={(models, recs) => {
                      setDetectedModels((prev) => ({ ...prev, gemini: models }));
                      setLiveRecommended((prev) => ({ ...prev, gemini: recs }));
                      setModelsError((prev) => ({ ...prev, gemini: null }));
                    }}
                    onPatchKeys={applyDirectKeyPatch}
                    onPendingPatchChange={(patch) =>
                      setPendingKeyPatches((prev) => ({ ...prev, gemini: patch }))
                    }
                    onFeedbackError={(msg) => setFeedback({ kind: "err", text: msg })}
                  />

                  <TtsModelSelector
                    title="Model Gemini TTS"
                    provider="gemini"
                    value={geminiModelId}
                    defaultModel={DEFAULT_GEMINI_MODEL_ID}
                    presets={GEMINI_TTS_MODELS}
                    detectedModels={detectedModels.gemini ?? null}
                    liveRecommended={liveRecommended.gemini ?? []}
                    modelsBusy={Boolean(modelsBusy.gemini)}
                    modelsError={modelsError.gemini ?? null}
                    autoNotice={autoNotices.gemini ?? null}
                    showList={Boolean(showModelList.gemini)}
                    onToggleList={() => {
                      if (showModelList.gemini) {
                        setShowModelList((prev) => ({ ...prev, gemini: false }));
                      } else {
                        void detectModelsFor("gemini", {
                          openDropdown: true,
                          silentIfMissingKey: false,
                        });
                      }
                    }}
                    onRefreshModels={() =>
                      void detectModelsFor("gemini", {
                        openDropdown: true,
                        silentIfMissingKey: false,
                      })
                    }
                    onChange={(next) => {
                      setGeminiModelId(next);
                      setAutoNotices((prev) => ({ ...prev, gemini: null }));
                    }}
                  />
                </div>
              )}
            </div>

            <p className="text-[11px] leading-relaxed text-muted">
              Tiap karakter juga bisa diatur punya warna suara tersendiri di{" "}
              <b>Profil Karakter → Suara karakter → Suara Khusus</b>.
            </p>
          </>
        ) : (
          <>
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

            {/* Sub-lipatan API Key, Model & Ekspresi ElevenLabs */}
            <div className="overflow-hidden rounded-xl border border-line bg-surface-2/30">
              <button
                type="button"
                onClick={() =>
                  setKeyConfigOpen((prev) => ({
                    ...prev,
                    elevenlabs: !prev.elevenlabs,
                  }))
                }
                aria-expanded={keyConfigOpen.elevenlabs}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left transition hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <span className="block text-xs font-semibold text-ink">
                    API Key, Model &amp; Ekspresi ElevenLabs
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {effectiveElevenModel} · {badgeLabel}
                  </span>
                </div>
                <ChevronDownIcon
                  className={`h-4 w-4 shrink-0 text-ink-soft transition-transform duration-200 ${
                    keyConfigOpen.elevenlabs ? "rotate-180 text-ink" : ""
                  }`}
                />
              </button>

              {keyConfigOpen.elevenlabs && (
                <div className="space-y-3.5 border-t border-line bg-surface p-3.5">
                  <TtsProviderKeySection
                    key="elevenlabs"
                    provider="elevenlabs"
                    hasPrimary={ttsSummary.hasKey}
                    maskedPrimary={ttsSummary.maskedKey}
                    maskedBackups={ttsSummary.maskedBackupKeys}
                    hasSharedFallback={false}
                    sharedProviders={[]}
                    modelId={modelId}
                    defaultModel={DEFAULT_HD_MODEL_ID}
                    voiceId={femaleVoiceId}
                    busy={saving}
                    onSelectModel={(next) => {
                      setModelId(next);
                      setAutoNotices((prev) => ({ ...prev, elevenlabs: null }));
                    }}
                    onSelectAndSaveModel={async (next) => {
                      setModelId(next);
                      await applyDirectKeyPatch(
                        { modelId: next },
                        `Model ElevenLabs diperbarui ke ${next}.`
                      );
                    }}
                    onOpenModelEditor={() =>
                      void detectModelsFor("elevenlabs", {
                        openDropdown: true,
                        silentIfMissingKey: false,
                      })
                    }
                    onDetectedModelsFromTest={(models, recs) => {
                      setDetectedModels((prev) => ({ ...prev, elevenlabs: models }));
                      setLiveRecommended((prev) => ({ ...prev, elevenlabs: recs }));
                      setModelsError((prev) => ({ ...prev, elevenlabs: null }));
                    }}
                    onPatchKeys={applyDirectKeyPatch}
                    onPendingPatchChange={(patch) =>
                      setPendingKeyPatches((prev) => ({ ...prev, elevenlabs: patch }))
                    }
                    onFeedbackError={(msg) => setFeedback({ kind: "err", text: msg })}
                  />

                  <TtsModelSelector
                    title="Model ElevenLabs"
                    provider="elevenlabs"
                    value={modelId}
                    defaultModel={DEFAULT_HD_MODEL_ID}
                    presets={HD_TTS_MODELS}
                    detectedModels={detectedModels.elevenlabs ?? null}
                    liveRecommended={liveRecommended.elevenlabs ?? []}
                    modelsBusy={Boolean(modelsBusy.elevenlabs)}
                    modelsError={modelsError.elevenlabs ?? null}
                    autoNotice={autoNotices.elevenlabs ?? null}
                    showList={Boolean(showModelList.elevenlabs)}
                    onToggleList={() => {
                      if (showModelList.elevenlabs) {
                        setShowModelList((prev) => ({ ...prev, elevenlabs: false }));
                      } else {
                        void detectModelsFor("elevenlabs", {
                          openDropdown: true,
                          silentIfMissingKey: false,
                        });
                      }
                    }}
                    onRefreshModels={() =>
                      void detectModelsFor("elevenlabs", {
                        openDropdown: true,
                        silentIfMissingKey: false,
                      })
                    }
                    onChange={(next) => {
                      setModelId(next);
                      setAutoNotices((prev) => ({ ...prev, elevenlabs: null }));
                    }}
                  />

                  <div className="space-y-3 border-t border-line pt-3">
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
                </div>
              )}
            </div>

            <p className="text-[11px] leading-relaxed text-muted">
              Kamu juga bebas menempel kode <b>Voice ID</b> dari suara kreasi sendiri (
              <i>Voice Design</i> / <i>My Voices</i>) di akun ElevenLabs.
            </p>
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
      </div>
    </VoiceAccordionCard>
  );
}

export function VoiceView({
  userId,
  settings,
  onChange,
  ttsSummary,
  onSaveTts,
  onNotice,
  embedded = false,
}: {
  userId: string;
  settings: VoiceSettings;
  onChange: (next: VoiceSettings) => void;
  ttsSummary: TtsAccountSummary;
  onSaveTts: (patch: Record<string, unknown>) => Promise<TtsAccountSummary | null>;
  onNotice?: (msg: string) => void;
  embedded?: boolean;
}) {
  const supported = useSpeechSupported();
  const voices = useVoices();
  const isSpeaking = useIsSpeaking();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  useKeepFieldVisible(scrollAreaRef, !embedded);

  // Hentikan contoh suara saat berpindah ke tab lain.
  useEffect(() => () => stopSpeaking(), []);

  const sorted = useMemo(() => sortVoices(voices), [voices]);
  const indonesianCount = useMemo(
    () => sorted.filter((v) => v.lang?.toLowerCase().startsWith("id")).length,
    [sorted]
  );
  const bestVoice = sorted[0] ?? null;

  const [openSections, setOpenSections] = useState<{
    hd: boolean;
    bank: boolean;
    device: boolean;
    playback: boolean;
  }>({
    hd: false,
    bank: false,
    device: false,
    playback: false,
  });

  function toggleSection(key: keyof typeof openSections) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

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

  const selectedLocalVoice = useMemo(
    () =>
      settings.voiceURI
        ? sorted.find((v) => v.voiceURI === settings.voiceURI) ?? null
        : null,
    [settings.voiceURI, sorted]
  );

  const localSubtitle = !supported
    ? "Web Speech API tidak tersedia di browser ini"
    : selectedLocalVoice
      ? `${selectedLocalVoice.name} (${selectedLocalVoice.lang})`
      : bestVoice
        ? `Otomatis · ${bestVoice.name}`
        : "Otomatis · Bahasa Indonesia paling natural";

  const localBadge = supported
    ? indonesianCount > 0
      ? `${indonesianCount} Indonesia`
      : `${sorted.length} suara`
    : undefined;

  const activePreset = VOICE_PRESETS.find((preset) =>
    isPresetActive(settings, preset)
  );
  const playbackSubtitle = `${activePreset ? `${activePreset.label} · ` : ""}Volume ${Math.round(settings.volume * 100)}% · Jeda ${Math.round(settings.pause)} ms`;

  return (
    <div className={embedded ? "w-full" : "flex h-full min-h-0 w-full flex-col bg-app"}>
      {(!embedded || canTestDefault) && (
        <div
          className={
            embedded
              ? "mb-3 flex justify-end"
              : "top-bar flex items-center justify-between gap-2 px-5 pb-3.5 pt-[max(1rem,var(--safe-top))]"
          }
        >
          {!embedded && (
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight text-ink">Suara</h1>
              <p className="text-xs text-ink-soft">
                Ketuk bagian yang ingin diatur untuk membuka pengaturannya.
              </p>
            </div>
          )}
          {canTestDefault && (
            <button
              type="button"
              onClick={isSpeaking ? stopSpeaking : handleTestDefault}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                isSpeaking
                  ? "border border-line bg-surface-2 text-ink hover:bg-line/60"
                  : "bg-brand text-brand-ink hover:bg-brand-strong"
              }`}
            >
              {isSpeaking ? "Hentikan" : "Coba suara"}
            </button>
          )}
        </div>
      )}

      <div
        ref={scrollAreaRef}
        className={
          embedded
            ? "w-full"
            : "flex-1 overflow-y-auto px-4 py-4 pb-[calc(var(--tabbar-space)+2rem)] sm:px-6"
        }
      >
        <div className={embedded ? "space-y-3" : "mx-auto w-full max-w-2xl space-y-3"}>
          {/* Kartu Kontrol Cepat Utama */}
          <section className="space-y-3.5 rounded-2xl border border-line bg-surface p-4 shadow-2xs">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-soft ring-1 ring-line">
                <SpeakerIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">Bacakan balasan</span>
                <span className="block text-xs text-ink-soft">
                  Balasan karakter dibacakan otomatis saat tiba di chat
                </span>
              </div>
              <Switch
                checked={settings.enabled}
                onChange={(next) => update({ enabled: next })}
                label="Bacakan balasan"
              />
            </div>

            <div className="space-y-2 border-t border-line pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">
                  Mesin suara bawaan
                </span>
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
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-xs text-ink-soft">
                  <span>
                    Rekaman di Bank R2 tetap berbunyi tanpa API key; kalimat baru memakai suara perangkat.
                  </span>
                  {!openSections.hd && (
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSections((prev) => ({ ...prev, hd: true }))
                      }
                      className="font-semibold text-ink underline decoration-dotted hover:opacity-80"
                    >
                      Atur Suara HD →
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 1. Pengaturan Suara HD */}
          <HdVoiceCard
            ttsSummary={ttsSummary}
            voiceSettings={settings}
            onSaveTts={onSaveTts}
            onNotice={onNotice}
            open={openSections.hd}
            onToggle={() => toggleSection("hd")}
          />

          {/* 2. Bank Rekaman Suara (Sinkron PC & HP via R2 + Cache Lokal) */}
          <VoiceBankCard
            userId={userId}
            volume={settings.volume}
            hasActiveKey={ttsSummary.hasActiveKey}
            open={openSections.bank}
            onToggle={() => toggleSection("bank")}
          />

          {/* 3. Suara Lokal Perangkat */}
          <VoiceAccordionCard
            title="Suara Lokal Perangkat"
            subtitle={localSubtitle}
            badge={localBadge}
            open={openSections.device}
            onToggle={() => toggleSection("device")}
          >
            <div className="space-y-3.5">
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
            </div>
          </VoiceAccordionCard>

          {/* 4. Volume, Jeda & Nada Bicara */}
          <VoiceAccordionCard
            title="Volume, Jeda & Nada Bicara"
            subtitle={playbackSubtitle}
            badge={`${settings.rate.toFixed(2)}×`}
            open={openSections.playback}
            onToggle={() => toggleSection("playback")}
          >
            <div className="space-y-3.5">
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

              <div className="space-y-3 rounded-xl border border-line bg-surface-2/30 p-3.5">
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
            </div>
          </VoiceAccordionCard>
        </div>
      </div>
    </div>
  );
}
