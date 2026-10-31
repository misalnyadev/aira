"use client";

import { useEffect, useState } from "react";
import { PROVIDER_META, PROVIDER_ORDER, RECOMMENDED_MODELS } from "@/lib/ai/providerDefaults";
import { MAX_BACKUP_KEYS } from "@/lib/limits";
import type { ProviderSummary, ProviderType } from "@/types/chat";
import { useAuth } from "./AuthGate";
import { ProfileModal } from "./ProfileModal";
import { BoltIcon, CheckIcon, PencilIcon, PlusIcon, TrashIcon, XIcon } from "./icons";

type TestState = {
  status: "testing" | "ok" | "fail";
  message?: string;
};

const FIELD =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-base outline-none focus:border-emerald-400 sm:text-sm";

export function SettingsModal({
  providers,
  autoFallback,
  onToggleAutoFallback,
  onClose,
  onRefresh,
  onOpenVoice,
}: {
  providers: ProviderSummary[];
  autoFallback: boolean;
  onToggleAutoFallback: (next: boolean) => Promise<void>;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onOpenVoice?: () => void;
}) {
  const { user, signOut } = useAuth();

  const [formOpen, setFormOpen] = useState(providers.length === 0);
  const [editing, setEditing] = useState<ProviderSummary | null>(null);

  const [type, setType] = useState<ProviderType>("gemini");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keptBackupIndexes, setKeptBackupIndexes] = useState<number[]>([]);
  const [newBackupKeys, setNewBackupKeys] = useState<string[]>([]);
  const [showKeys, setShowKeys] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [isDefault, setIsDefault] = useState(providers.length === 0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !showProfile) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, showProfile]);

  const meta = PROVIDER_META[type];
  const recommended = RECOMMENDED_MODELS[type] ?? [];
  const totalBackupsInForm = keptBackupIndexes.length + newBackupKeys.length;
  const canAddMoreBackup = totalBackupsInForm < MAX_BACKUP_KEYS;

  function resetForm(openAfter = false) {
    setEditing(null);
    setType("gemini");
    setLabel("");
    setApiKey("");
    setKeptBackupIndexes([]);
    setNewBackupKeys([]);
    setShowKeys(false);
    setBaseUrl("");
    setModel("");
    setIsDefault(providers.length === 0);
    setError(null);
    setFormOpen(openAfter);
  }

  function startEdit(p: ProviderSummary) {
    setEditing(p);
    setType(p.type);
    setLabel(p.label);
    setApiKey("");
    setKeptBackupIndexes(p.maskedBackupKeys.map((_, idx) => idx));
    setNewBackupKeys([]);
    setShowKeys(false);
    setBaseUrl(p.baseUrl ?? "");
    setModel(p.model);
    setIsDefault(p.isDefault);
    setError(null);
    setFormOpen(true);
  }

  function handleChooseType(next: ProviderType) {
    if (next !== type) setModel("");
    setType(next);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (type === "custom" && !baseUrl.trim()) {
      setError("Base URL wajib diisi untuk provider custom.");
      return;
    }

    const finalModel = model.trim() || meta.defaultModel;
    if (!finalModel) {
      setError("Model wajib diisi.");
      return;
    }

    const trimmedNewBackups = newBackupKeys.map((k) => k.trim()).filter(Boolean);

    if (!editing && type !== "custom" && !apiKey.trim() && trimmedNewBackups.length === 0) {
      setError("API key wajib diisi.");
      return;
    }

    setBusy(true);
    try {
      const res = editing
        ? await fetch(`/api/providers/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              label: label.trim() || meta.name,
              apiKey: apiKey.trim(),
              keepBackupIndexes: keptBackupIndexes,
              newBackupKeys: trimmedNewBackups,
              baseUrl: baseUrl.trim(),
              model: finalModel,
              isDefault,
            }),
          })
        : await fetch("/api/providers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type,
              label: label.trim() || meta.name,
              apiKey: apiKey.trim(),
              backupKeys: trimmedNewBackups,
              baseUrl: baseUrl.trim(),
              model: finalModel,
              isDefault,
            }),
          });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan provider.");
      await onRefresh();
      resetForm(false);
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
    await onRefresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus provider ini beserta seluruh key di dalamnya?")) return;
    await fetch(`/api/providers/${id}`, { method: "DELETE" });
    if (editing?.id === id) resetForm(false);
    await onRefresh();
  }

  async function handleTest(p: ProviderSummary) {
    setTests((prev) => ({ ...prev, [p.id]: { status: "testing" } }));
    try {
      const res = await fetch(`/api/providers/${p.id}/test`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const note =
          data.usedKeyNumber > 1
            ? `Terhubung · memakai key ke-${data.usedKeyNumber} dari ${data.totalKeys}`
            : "Terhubung";
        setTests((prev) => ({ ...prev, [p.id]: { status: "ok", message: note } }));
        if (data.promoted) await onRefresh();
      } else {
        setTests((prev) => ({
          ...prev,
          [p.id]: { status: "fail", message: data.error || "Gagal terhubung." },
        }));
      }
    } catch {
      setTests((prev) => ({
        ...prev,
        [p.id]: { status: "fail", message: "Koneksi gagal." },
      }));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Pengaturan</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Tutup"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Provider AI
              </h3>
              {!formOpen && (
                <button
                  type="button"
                  onClick={() => resetForm(true)}
                  className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Tambah
                </button>
              )}
            </div>

            <div className="space-y-2">
              {providers.length === 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                  Belum ada API key. Tambahkan minimal satu provider di bawah supaya karakter bisa
                  membalas chat.
                </p>
              )}

              {providers.map((p) => {
                const test = tests[p.id];
                const totalKeys = (p.hasKey ? 1 : 0) + p.backupCount;
                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-slate-200 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-slate-900">
                            {p.label}
                          </span>
                          {p.isDefault && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              DEFAULT
                            </span>
                          )}
                          {totalKeys > 1 && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                              {totalKeys} key
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-slate-500">
                          {PROVIDER_META[p.type].name} · {p.model}{" "}
                          {p.hasKey ? `· ${p.maskedKey}` : "· tanpa key"}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleTest(p)}
                          title="Tes koneksi"
                          aria-label="Tes koneksi"
                          className="rounded-full p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"
                        >
                          <BoltIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          title="Edit / tambah key cadangan"
                          aria-label="Edit provider"
                          className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        {!p.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleSetDefault(p.id)}
                            title="Jadikan default"
                            aria-label="Jadikan default"
                            className="rounded-full p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"
                          >
                            <CheckIcon className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(p.id)}
                          title="Hapus"
                          aria-label="Hapus provider"
                          className="rounded-full p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {test && (
                      <p
                        className={`mt-1.5 text-xs ${
                          test.status === "ok"
                            ? "text-emerald-700"
                            : test.status === "fail"
                              ? "text-rose-600"
                              : "text-slate-400"
                        }`}
                      >
                        {test.status === "testing"
                          ? "Menguji koneksi..."
                          : test.status === "ok"
                            ? `✓ ${test.message}`
                            : `✗ ${test.message}`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {providers.length > 0 && (
              <label className="mt-2.5 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800">
                    Pindah provider otomatis saat kena limit
                  </span>
                  <span className="block text-xs text-slate-500">
                    Kalau semua key di satu provider gagal/429, otomatis coba provider lain
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={autoFallback}
                  onChange={(e) => void onToggleAutoFallback(e.target.checked)}
                  className="h-4 w-4 shrink-0 rounded border-slate-300 accent-emerald-600"
                />
              </label>
            )}
          </section>

          {formOpen && (
            <form onSubmit={handleSubmit} className="mt-5 space-y-3 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">
                  {editing ? `Edit ${editing.label}` : "Tambah Provider Baru"}
                </h3>
                {(editing || providers.length > 0) && (
                  <button
                    type="button"
                    onClick={() => resetForm(false)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Batal
                  </button>
                )}
              </div>

              {!editing ? (
                <div className="grid grid-cols-2 gap-2">
                  {PROVIDER_ORDER.map((t) => (
                    <button
                      type="button"
                      key={t}
                      onClick={() => handleChooseType(t)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                        type === t
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {PROVIDER_META[t].name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Tipe provider: <span className="font-semibold text-slate-700">{meta.name}</span>
                </p>
              )}

              {meta.keyHelpUrl ? (
                <p className="text-xs text-slate-500">
                  Ambil API key di{" "}
                  <a
                    href={meta.keyHelpUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-semibold text-emerald-700 underline-offset-2 hover:underline"
                  >
                    {meta.keyHelpUrl.replace(/^https?:\/\//, "")} ↗
                  </a>
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Masukkan Base URL endpoint OpenAI-compatible (mis. http://localhost:11434/v1).
                </p>
              )}

              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Nama label (contoh: ${meta.name})`}
                className={FIELD}
              />

              {type === "custom" && (
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="Base URL (contoh: http://localhost:11434/v1)"
                  className={FIELD}
                />
              )}

              {/* API Key Utama + Key Cadangan */}
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    API Key
                    {totalBackupsInForm > 0 ? ` · +${totalBackupsInForm} cadangan` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowKeys((v) => !v)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    {showKeys ? "Sembunyikan" : "Tampilkan"}
                  </button>
                </div>

                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    editing
                      ? editing.hasKey
                        ? `Biarkan kosong jika tetap (${editing.maskedKey})`
                        : "Isi API key utama"
                      : type === "custom"
                        ? "API key (opsional)"
                        : "API key utama"
                  }
                  type={showKeys ? "text" : "password"}
                  autoComplete="off"
                  className={FIELD}
                />

                {editing && keptBackupIndexes.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] font-medium text-slate-400">
                      Key cadangan tersimpan (otomatis dicoba saat key utama kena limit):
                    </p>
                    {keptBackupIndexes.map((origIdx, pos) => (
                      <div
                        key={origIdx}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600"
                      >
                        <span>
                          Cadangan {pos + 1}:{" "}
                          <code className="font-mono text-slate-800">
                            {editing.maskedBackupKeys[origIdx] || "••••"}
                          </code>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setKeptBackupIndexes((list) => list.filter((i) => i !== origIdx))
                          }
                          className="rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Hapus key cadangan ini"
                          aria-label={`Hapus key cadangan ${pos + 1}`}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {newBackupKeys.map((val, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      value={val}
                      onChange={(e) =>
                        setNewBackupKeys((list) =>
                          list.map((item, i) => (i === idx ? e.target.value : item))
                        )
                      }
                      placeholder={`Key cadangan baru ${keptBackupIndexes.length + idx + 1}`}
                      type={showKeys ? "text" : "password"}
                      autoComplete="off"
                      className={`${FIELD} min-w-0 flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setNewBackupKeys((list) => list.filter((_, i) => i !== idx))
                      }
                      className="rounded-full p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Hapus baris key cadangan"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {canAddMoreBackup ? (
                  <button
                    type="button"
                    onClick={() => setNewBackupKeys((list) => [...list, ""])}
                    className="flex items-center gap-1 pt-0.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    <PlusIcon className="h-3.5 w-3.5" /> Tambah key cadangan
                  </button>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Maksimal {MAX_BACKUP_KEYS} key cadangan per provider.
                  </p>
                )}
              </div>

              {/* Model + saran cepat */}
              <div>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={`Model (default: ${meta.defaultModel || "isi manual"})`}
                  className={FIELD}
                />
                {recommended.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {recommended.map((rec) => {
                      const active = (model.trim() || meta.defaultModel) === rec;
                      return (
                        <button
                          type="button"
                          key={rec}
                          onClick={() => setModel(rec)}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                            active
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          {rec}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                />
                Jadikan provider default
              </label>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy
                  ? "Menyimpan..."
                  : editing
                    ? "Simpan Perubahan"
                    : "Simpan Provider"}
              </button>
            </form>
          )}

          <div className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Akun</h3>
            <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="truncate text-sm text-slate-700">{user.email}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Karakter, riwayat chat, & API key di akun ini tersimpan di cloud dan terpisah dari
                akun lain.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowProfile(true)}
                  className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Profil Saya
                </button>
                {onOpenVoice && (
                  <button
                    type="button"
                    onClick={onOpenVoice}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    Suara
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white"
                >
                  Keluar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
