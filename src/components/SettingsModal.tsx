"use client";

import { useState } from "react";
import type { ProviderSummary, ProviderType } from "@/types/chat";
import { useAuth } from "./AuthGate";
import { ProfileModal } from "./ProfileModal";
import { CheckIcon, TrashIcon, XIcon } from "./icons";

const PROVIDER_LABELS: Record<ProviderType, string> = {
  gemini: "Google Gemini",
  grok: "Grok (xAI)",
  openrouter: "OpenRouter",
  custom: "Custom (OpenAI-compatible)",
};

const PROVIDER_DEFAULT_MODEL: Record<ProviderType, string> = {
  gemini: "gemini-2.5-flash",
  grok: "grok-4",
  openrouter: "openai/gpt-4o-mini",
  custom: "",
};

const KEY_HELP: Record<ProviderType, string> = {
  gemini: "Dapatkan API key gratis di aistudio.google.com/apikey",
  grok: "Dapatkan API key di console.x.ai",
  openrouter: "Dapatkan API key di openrouter.ai/keys",
  custom: "Masukkan base URL endpoint OpenAI-compatible (contoh: http://localhost:11434/v1)",
};

export function SettingsModal({
  providers,
  onClose,
  onRefresh,
}: {
  providers: ProviderSummary[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [type, setType] = useState<ProviderType>("gemini");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [isDefault, setIsDefault] = useState(providers.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, signOut } = useAuth();
  const [showProfile, setShowProfile] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (type === "custom" && !baseUrl.trim()) {
      setError("Base URL wajib diisi untuk provider custom.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          label: label.trim() || PROVIDER_LABELS[type],
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim(),
          model: model.trim() || PROVIDER_DEFAULT_MODEL[type],
          isDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menambah provider.");
      setLabel("");
      setApiKey("");
      setBaseUrl("");
      setModel("");
      await onRefresh();
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
    if (!confirm("Hapus API key ini?")) return;
    await fetch(`/api/providers/${id}`, { method: "DELETE" });
    await onRefresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Pengaturan API Key</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Tutup"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-sm text-slate-500">
            Semua key tersimpan lokal di database aplikasi ini. Tambahkan satu atau lebih provider
            (Gemini, Grok, OpenRouter, atau custom endpoint OpenAI-compatible) lalu tandai salah satu
            sebagai default.
          </p>

          <div className="space-y-2">
            {providers.length === 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Belum ada API key. Tambahkan minimal satu di bawah supaya karakter bisa membalas chat.
              </p>
            )}
            {providers.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">{p.label}</span>
                    {p.isDefault && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {PROVIDER_LABELS[p.type]} · {p.model} {p.hasKey ? `· ${p.maskedKey}` : "· tanpa key"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!p.isDefault && (
                    <button
                      onClick={() => handleSetDefault(p.id)}
                      title="Jadikan default"
                      className="rounded-full p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"
                    >
                      <CheckIcon className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(p.id)}
                    title="Hapus"
                    className="rounded-full p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleAdd} className="mt-5 space-y-3 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-800">Tambah Provider Baru</h3>

            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PROVIDER_LABELS) as ProviderType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setType(t)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    type === t
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {PROVIDER_LABELS[t]}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-500">{KEY_HELP[type]}</p>

            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`Nama label (contoh: ${PROVIDER_LABELS[type]})`}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />

            {type !== "custom" && (
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API Key"
                type="password"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
              />
            )}

            {type === "custom" && (
              <>
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="Base URL (contoh: http://localhost:11434/v1)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                />
                <input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="API Key (opsional, kosongkan jika tidak perlu)"
                  type="password"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
                />
              </>
            )}

            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={`Model (default: ${PROVIDER_DEFAULT_MODEL[type] || "isi manual"})`}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-400"
            />

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Jadikan provider default
            </label>

            {error && <p className="text-sm text-rose-600">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy ? "Menyimpan..." : "Simpan Provider"}
            </button>
          </form>

          <div className="mt-5 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-800">Akun</h3>
            <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="truncate text-sm text-slate-700">{user.email}</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Karakter & API key di akun ini terpisah dari akun lain.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => setShowProfile(true)}
                  className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Profil Saya
                </button>
                <button
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
