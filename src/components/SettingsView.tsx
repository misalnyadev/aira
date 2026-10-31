"use client";

import { useRef, useState } from "react";
import type { ProviderSummary, ProviderType } from "@/types/chat";
import {
  PROVIDER_META,
  PROVIDER_ORDER,
  RECOMMENDED_MODELS,
} from "@/lib/ai/providerDefaults";
import { MAX_BACKUP_KEYS } from "@/lib/limits";
import { useKeepFieldVisible } from "@/lib/keepFieldVisible";
import { useAuth } from "./AuthGate";
import { Switch } from "./Switch";
import { ThemeSegmented } from "./ThemeToggle";
import {
  BoltIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "./icons";

const FIELD =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink outline-none transition placeholder:text-muted focus:border-ink sm:py-2 sm:text-sm";

type TestState = { status: "testing" | "ok" | "fail"; message?: string };

export function SettingsView({
  providers,
  autoFallback,
  onAutoFallbackChange,
  onChanged,
}: {
  providers: ProviderSummary[];
  autoFallback: boolean;
  onAutoFallbackChange: (next: boolean) => void;
  onChanged: () => Promise<void>;
}) {
  const { user, signOut } = useAuth();
  const [editing, setEditing] = useState<ProviderSummary | null>(null);
  const [formOpen, setFormOpen] = useState(providers.length === 0);
  const [type, setType] = useState<ProviderType>("gemini");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [backupKeys, setBackupKeys] = useState<string[]>([]);
  const [backupTouched, setBackupTouched] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [isDefault, setIsDefault] = useState(providers.length === 0);
  const [busy, setBusy] = useState(false);
  const [fallbackBusy, setFallbackBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  useKeepFieldVisible(scrollAreaRef, true);

  const meta = PROVIDER_META[type];
  const recommended = RECOMMENDED_MODELS[type] ?? [];

  function resetForm() {
    setEditing(null);
    setFormOpen(false);
    setLabel("");
    setApiKey("");
    setBackupKeys([]);
    setBackupTouched(false);
    setBaseUrl("");
    setModel("");
    setError(null);
  }

  function startCreate() {
    setEditing(null);
    setFormOpen(true);
    setType("gemini");
    setLabel("");
    setApiKey("");
    setBackupKeys([]);
    setBackupTouched(false);
    setBaseUrl("");
    setModel("");
    setIsDefault(providers.length === 0);
    setError(null);
  }

  function startEdit(p: ProviderSummary) {
    setFormOpen(true);
    setEditing(p);
    setType(p.type);
    setLabel(p.label);
    setApiKey("");
    setBackupKeys([]);
    setBackupTouched(false);
    setBaseUrl(p.baseUrl ?? "");
    setModel(p.model);
    setIsDefault(p.isDefault);
    setError(null);
  }

  function chooseType(next: ProviderType) {
    if (next !== type) setModel("");
    setType(next);
  }

  function addBackupSlot() {
    if (backupKeys.length >= MAX_BACKUP_KEYS) return;
    setBackupTouched(true);
    setBackupKeys((list) => [...list, ""]);
  }

  function updateBackupSlot(index: number, value: string) {
    setBackupTouched(true);
    setBackupKeys((list) => list.map((item, i) => (i === index ? value : item)));
  }

  function removeBackupSlot(index: number) {
    setBackupTouched(true);
    setBackupKeys((list) => list.filter((_, i) => i !== index));
  }

  function clearSavedBackups() {
    setBackupTouched(true);
    setBackupKeys([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const cleanedBackups = backupKeys.map((k) => k.trim()).filter(Boolean);

      if (editing) {
        const payload: Record<string, unknown> = {
          type,
          label: label.trim() || meta.name,
          baseUrl: type === "custom" ? baseUrl.trim() : null,
          model: model.trim() || meta.defaultModel,
          isDefault,
        };
        if (apiKey.trim()) payload.apiKey = apiKey.trim();
        if (backupTouched) payload.backupKeys = cleanedBackups;

        const res = await fetch(`/api/providers/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal memperbarui provider.");
      } else {
        const res = await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            label: label.trim() || meta.name,
            apiKey: apiKey.trim(),
            backupKeys: cleanedBackups,
            baseUrl: type === "custom" ? baseUrl.trim() : undefined,
            model: model.trim() || meta.defaultModel,
            isDefault,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal menyimpan provider.");
      }

      resetForm();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetDefault(id: string) {
    await fetch(`/api/providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    await onChanged();
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus konfigurasi provider ini?")) return;
    await fetch(`/api/providers/${id}`, { method: "DELETE" });
    if (editing?.id === id) resetForm();
    await onChanged();
  }

  async function handleTest(p: ProviderSummary) {
    setTests((prev) => ({ ...prev, [p.id]: { status: "testing" } }));
    try {
      const res = await fetch(`/api/providers/${p.id}/test`, { method: "POST" });
      const data = await res.json();
      const usedKeyNote =
        data.ok && data.usedKeyNumber > 1
          ? ` · key ke-${data.usedKeyNumber} dari ${data.totalKeys}`
          : "";
      setTests((prev) => ({
        ...prev,
        [p.id]: data.ok
          ? { status: "ok", message: `Terhubung${usedKeyNote}` }
          : { status: "fail", message: data.error || "Gagal terhubung." },
      }));
      if (data.ok && data.promoted) {
        await onChanged();
      }
    } catch {
      setTests((prev) => ({
        ...prev,
        [p.id]: { status: "fail", message: "Koneksi gagal." },
      }));
    }
  }

  async function handleToggleAutoFallback(next: boolean) {
    const previous = autoFallback;
    onAutoFallbackChange(next);
    setFallbackBusy(true);
    try {
      const res = await fetch("/api/providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoFallback: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      onAutoFallbackChange(previous);
    } finally {
      setFallbackBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface">
      <div className="border-b border-line bg-header px-5 pb-3.5 pt-[max(1rem,var(--safe-top))]">
        <h1 className="font-display text-xl font-bold tracking-tight text-ink">Setelan</h1>
        <p className="text-xs text-ink-soft">Tema tampilan, provider AI, dan akunmu</p>
      </div>

      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto px-5 py-4 pb-[calc(var(--tabbar-space)+0.75rem)]"
      >
        <div className="mx-auto w-full max-w-2xl space-y-6">
          {/* Tampilan */}
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Tampilan
            </h2>
            <ThemeSegmented />
          </section>

          {/* Provider tersimpan */}
          <section className="border-t border-line pt-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Provider AI
              </h2>
              {!formOpen && (
                <button
                  type="button"
                  onClick={startCreate}
                  className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-line/60"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Tambah
                </button>
              )}
            </div>

            {providers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-3.5 py-3 text-xs text-muted">
                Belum ada provider tersimpan. Tambahkan minimal satu API key di bawah untuk mulai
                mengobrol.
              </p>
            ) : (
              <div className="space-y-2">
                {providers.map((p) => {
                  const test = tests[p.id];
                  const keyCount = (p.hasKey ? 1 : 0) + (p.backupCount ?? 0);
                  return (
                    <div key={p.id} className="rounded-xl border border-line px-3.5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-ink">{p.label}</span>
                            {p.isDefault && (
                              <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-[11px] font-semibold text-ink">
                                default
                              </span>
                            )}
                            {keyCount > 1 && (
                              <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft ring-1 ring-line">
                                {keyCount} key
                              </span>
                            )}
                            {!p.hasKey && p.type !== "custom" && (
                              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                belum ada key
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-ink-soft">
                            {p.model} · {p.maskedKey}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleTest(p)}
                            disabled={test?.status === "testing"}
                            title="Tes koneksi"
                            aria-label={`Tes koneksi ${p.label}`}
                            className="rounded-full p-1.5 text-ink-soft transition hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                          >
                            <BoltIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            title="Edit provider"
                            aria-label={`Edit ${p.label}`}
                            className="rounded-full p-1.5 text-ink-soft transition hover:bg-surface-2 hover:text-ink"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          {!p.isDefault && (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(p.id)}
                              title="Jadikan default"
                              aria-label={`Jadikan ${p.label} provider default`}
                              className="rounded-full p-1.5 text-ink-soft transition hover:bg-surface-2 hover:text-ink"
                            >
                              <CheckIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id)}
                            title="Hapus provider"
                            aria-label={`Hapus ${p.label}`}
                            className="rounded-full p-1.5 text-ink-soft transition hover:bg-rose-500/10 hover:text-rose-500"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {test && (
                        <p
                          className={`mt-1 text-xs ${
                            test.status === "ok"
                              ? "text-ink"
                              : test.status === "fail"
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-ink-soft"
                          }`}
                        >
                          {test.status === "testing"
                            ? "Menguji..."
                            : test.status === "ok"
                              ? `✓ ${test.message}`
                              : `✗ ${test.message}`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-2.5 flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5">
              <div className="min-w-0">
                <span className="block text-sm text-ink">Pindah provider saat key gagal</span>
                <span className="block text-[11px] text-muted">
                  Otomatis memakai provider lain saat semua key kena limit
                </span>
              </div>
              <Switch
                checked={autoFallback}
                disabled={fallbackBusy}
                onChange={handleToggleAutoFallback}
                label="Pindah provider saat key gagal"
              />
            </div>
          </section>

          {/* Form tambah / edit provider */}
          {formOpen && (
            <form onSubmit={handleSubmit} className="space-y-3 border-t border-line pt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {editing ? `Edit provider (${editing.label})` : "Provider baru"}
                </h3>
                {providers.length > 0 && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs font-medium text-ink-soft transition hover:text-ink"
                  >
                    Tutup
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink-soft">Jenis provider</span>
                {meta.keyHelpUrl && (
                  <a
                    href={meta.keyHelpUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs font-semibold text-ink-soft underline-offset-2 transition hover:text-ink hover:underline"
                  >
                    Ambil API key ↗
                  </a>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PROVIDER_ORDER.map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => chooseType(t)}
                    className={`rounded-xl border px-2.5 py-2 text-xs font-medium transition ${
                      type === t
                        ? "border-ink bg-surface-2 text-ink"
                        : "border-line text-ink-soft hover:bg-surface-2"
                    }`}
                  >
                    {PROVIDER_META[t].name}
                  </button>
                ))}
              </div>

              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Nama label (opsional, mis. ${meta.name} Pribadi)`}
                className={FIELD}
              />

              {type === "custom" && (
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="Base URL, mis. http://localhost:11434/v1"
                  className={FIELD}
                />
              )}

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted">
                    API key
                    {backupKeys.length > 0
                      ? ` (${1 + backupKeys.length})`
                      : editing && !backupTouched && editing.backupCount > 0
                        ? ` (${(editing.hasKey ? 1 : 0) + editing.backupCount})`
                        : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowKeys((v) => !v)}
                    className="text-xs font-medium text-ink-soft transition hover:text-ink"
                  >
                    {showKeys ? "Sembunyikan" : "Tampilkan"}
                  </button>
                </div>

                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    editing
                      ? `Key utama baru (kosongkan untuk tetap pakai ${editing.maskedKey})`
                      : type === "custom"
                        ? "API key (opsional)"
                        : "API key"
                  }
                  type={showKeys ? "text" : "password"}
                  autoComplete="off"
                  className={FIELD}
                />

                {editing && !backupTouched && editing.backupCount > 0 && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-ink-soft">
                    <span className="truncate">
                      {editing.backupCount} key cadangan tersimpan (
                      {editing.maskedBackupKeys.join(", ")})
                    </span>
                    <button
                      type="button"
                      onClick={clearSavedBackups}
                      className="shrink-0 font-semibold text-rose-500 hover:underline"
                    >
                      Kosongkan
                    </button>
                  </div>
                )}

                {backupKeys.map((key, index) => (
                  <div key={index} className="mt-2 flex items-center gap-2">
                    <input
                      value={key}
                      onChange={(e) => updateBackupSlot(index, e.target.value)}
                      placeholder={`Key cadangan ${index + 1}`}
                      type={showKeys ? "text" : "password"}
                      autoComplete="off"
                      className={`${FIELD} min-w-0 flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => removeBackupSlot(index)}
                      aria-label={`Hapus key cadangan ${index + 1}`}
                      className="rounded-full p-1.5 text-ink-soft transition hover:bg-surface-2 hover:text-rose-500"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {backupKeys.length < MAX_BACKUP_KEYS && (
                  <button
                    type="button"
                    onClick={addBackupSlot}
                    className="mt-2 flex items-center gap-1 text-xs font-semibold text-ink-soft transition hover:text-ink"
                  >
                    <PlusIcon className="h-3.5 w-3.5" /> Key cadangan
                  </button>
                )}
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">Model</span>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={`Model (default: ${meta.defaultModel || "wajib diisi"})`}
                  className={FIELD}
                />
                {recommended.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {recommended.map((m) => {
                      const active = model === m;
                      return (
                        <button
                          type="button"
                          key={m}
                          onClick={() => setModel(m)}
                          className={`rounded-full px-2.5 py-1 text-xs transition ${
                            active
                              ? "bg-brand font-semibold text-brand-ink"
                              : "bg-surface-2 text-ink-soft hover:text-ink"
                          }`}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded accent-ink"
                />
                Jadikan provider default
              </label>

              {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.99] disabled:opacity-60"
              >
                {busy
                  ? "Menyimpan..."
                  : editing
                    ? "Simpan perubahan"
                    : "Simpan provider"}
              </button>
            </form>
          )}

          {/* Akun */}
          <section className="border-t border-line pt-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Akun</h2>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-xs text-muted">Masuk sebagai</p>
                <p className="truncate text-sm font-medium text-ink">{user.email}</p>
              </div>
              <button
                type="button"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  await signOut();
                }}
                className="shrink-0 rounded-xl border border-line px-3.5 py-2 text-xs font-semibold text-ink-soft transition hover:border-rose-300 hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-60"
              >
                {signingOut ? "Keluar..." : "Keluar"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
