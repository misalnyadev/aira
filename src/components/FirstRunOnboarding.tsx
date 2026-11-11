"use client";

import { useState } from "react";
import { PROVIDER_META, PROVIDER_ORDER } from "@/lib/ai/providerDefaults";
import type { ProviderType } from "@/db/schema";
import type { CharacterSummary, ProviderSummary } from "@/types/chat";
import type { UserProfile } from "@/lib/userProfile";
import { useAuth } from "./AuthGate";
import { CharacterModal } from "./CharacterModal";

const FIELD =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink outline-none transition placeholder:text-muted focus:border-ink sm:text-sm";

type OnboardingStep = "provider" | "character" | "finish";

export function FirstRunOnboarding({
  profile,
  providers,
  characters,
  onProvidersChanged,
  onCharactersChanged,
  onComplete,
}: {
  profile: UserProfile;
  providers: ProviderSummary[];
  characters: CharacterSummary[];
  onProvidersChanged: () => Promise<void>;
  onCharactersChanged: () => Promise<void>;
  onComplete: () => void;
}) {
  const { signOut } = useAuth();
  const providerReady = providers.some((provider) => provider.hasKey || provider.backupCount > 0);
  const [step, setStep] = useState<OnboardingStep>(() => {
    if (!providers.some((provider) => provider.hasKey || provider.backupCount > 0)) return "provider";
    return characters.length > 0 ? "finish" : "character";
  });
  const [type, setType] = useState<ProviderType>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState(PROVIDER_META.gemini.defaultModel);
  const [showKey, setShowKey] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [characterSaved, setCharacterSaved] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const meta = PROVIDER_META[type];
  const characterNames = characters.map((character) => character.name);
  const welcomeName = profile.nickname || profile.displayName || "kawan";

  function handleProviderTypeChange(next: ProviderType) {
    setType(next);
    setModel(PROVIDER_META[next].defaultModel);
    setBaseUrl(next === "custom" ? "" : PROVIDER_META[next].baseUrl ?? "");
    setProviderError(null);
  }

  async function saveProvider(event: React.FormEvent) {
    event.preventDefault();
    setProviderError(null);
    setProviderNotice(null);
    if (!apiKey.trim()) {
      setProviderError("API key wajib diisi untuk mulai ngobrol dan membuat draf karakter.");
      return;
    }
    if (type === "custom" && !baseUrl.trim()) {
      setProviderError("Base URL wajib diisi untuk provider custom.");
      return;
    }
    if (!model.trim()) {
      setProviderError("Nama model wajib diisi untuk provider ini.");
      return;
    }

    setProviderBusy(true);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          label: meta.name,
          apiKey: apiKey.trim(),
          backupKeys: [],
          baseUrl: type === "custom" ? baseUrl.trim() : meta.baseUrl ?? "",
          model: model.trim(),
          isDefault: !providers.some((provider) => provider.hasKey || provider.backupCount > 0),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Gagal menyimpan API key.");
      await onProvidersChanged();
      setApiKey("");
      setProviderNotice(`${meta.name} tersimpan. Lanjut ke pembuatan karakter kalau sudah siap.`);
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "Gagal menyimpan API key.");
    } finally {
      setProviderBusy(false);
    }
  }

  async function finishOnboarding() {
    if (completeBusy) return;
    setCompleteBusy(true);
    setCompleteError(null);
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Belum bisa menyelesaikan pengaturan awal.");
      onComplete();
    } catch (error) {
      setCompleteError(error instanceof Error ? error.message : "Belum bisa menyelesaikan pengaturan awal.");
    } finally {
      setCompleteBusy(false);
    }
  }

  const activeStep = step === "provider" ? 1 : 2;

  return (
    <div className="app-shell relative flex flex-col bg-app text-ink">
      <header className="shrink-0 border-b border-line bg-surface/80 px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-3">
          <div>
            <p className="font-display text-lg font-extrabold tracking-tight text-accent-text dark:text-accent-text">HeyTalent</p>
            <h1 className="mt-1 text-xl font-bold text-accent-text dark:text-accent-text">Selamat datang, {welcomeName}!</h1>
            <p className="mt-1 text-sm text-ink-soft">Siapkan akses AI dan buat karakter pertamamu.</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="shrink-0 rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink-soft transition hover:bg-surface-2"
          >
            Keluar
          </button>
        </div>
        <div className="mx-auto mt-4 flex w-full max-w-3xl items-center gap-2" aria-label={`Langkah ${activeStep} dari 2`}>
          <div className={`h-1.5 flex-1 rounded-full ${providerReady ? "bg-brand" : "bg-line"}`} />
          <span className="text-[11px] font-medium text-muted">1 · API key</span>
          <div className={`h-1.5 flex-1 rounded-full ${step !== "provider" ? "bg-brand" : "bg-line"}`} />
          <span className="text-[11px] font-medium text-muted">2 · Karakter</span>
          <div className={`h-1.5 flex-1 rounded-full ${step === "finish" ? "bg-brand" : "bg-line"}`} />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto w-full max-w-2xl">
          {step === "provider" && (
            <section className="space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-xs sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Langkah 1 dari 2</p>
                <h2 className="mt-1 text-lg font-bold text-accent-text dark:text-accent-text">Tambahkan API key AI</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  Key ini dipakai untuk balasan karakter dan fitur buat draf otomatis. Key tetap milik akunmu dan tidak dibagikan ke pemilik karakter lain.
                </p>
              </div>

              {providers.length > 0 && (
                <div className="space-y-2 rounded-2xl border border-line bg-surface-2/50 p-3">
                  <p className="text-xs font-semibold text-accent-text dark:text-accent-text">Provider yang sudah tersimpan</p>
                  {providers.map((provider) => (
                    <p key={provider.id} className="text-xs text-ink-soft">
                      {provider.label} · {provider.model}{provider.isDefault ? " · default" : ""}
                    </p>
                  ))}
                </div>
              )}

              <form onSubmit={saveProvider} className="space-y-3 rounded-2xl border border-line bg-surface-2/40 p-3.5">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Penyedia AI</label>
                  <select
                    value={type}
                    onChange={(event) => handleProviderTypeChange(event.target.value as ProviderType)}
                    className={FIELD}
                  >
                    {PROVIDER_ORDER.map((providerType) => (
                      <option key={providerType} value={providerType}>{PROVIDER_META[providerType].name}</option>
                    ))}
                  </select>
                </div>
                {meta.keyHelpUrl && (
                  <a href={meta.keyHelpUrl} target="_blank" rel="noreferrer noopener" className="inline-block text-xs font-semibold text-ink-soft underline underline-offset-2">
                    Ambil API key {meta.name} ↗
                  </a>
                )}
                {type === "custom" && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">Base URL</label>
                    <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://server.example/v1" className={FIELD} />
                  </div>
                )}
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-xs font-medium text-ink-soft">API key</label>
                    <button type="button" onClick={() => setShowKey((current) => !current)} className="text-xs font-medium text-ink-soft hover:text-ink">
                      {showKey ? "Sembunyikan" : "Tampilkan"}
                    </button>
                  </div>
                  <input
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-1p-ignore="true"
                    data-lpignore="true"
                    placeholder="Tempel API key di sini"
                    className={`${FIELD} ${showKey ? "" : "masked-key"}`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Model</label>
                  <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Nama model" className={FIELD} />
                  <p className="mt-1 text-[11px] text-muted">Model awal terisi otomatis; nanti bisa diganti dari Setelan.</p>
                </div>
                {providerError && <p role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">{providerError}</p>}
                {providerNotice && <p aria-live="polite" className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">{providerNotice}</p>}
                <button type="submit" disabled={providerBusy} className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2 disabled:opacity-50">
                  {providerBusy ? "Menguji dan menyimpan..." : "Simpan API key"}
                </button>
              </form>

              <button
                type="button"
                disabled={!providerReady}
                onClick={() => setStep(characters.length > 0 ? "finish" : "character")}
                className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                Lanjut ke karakter →
              </button>
              {!providerReady && <p className="text-center text-xs text-muted">Simpan minimal satu provider ber-API key untuk melanjutkan.</p>}
            </section>
          )}

          {step === "character" && (
            <section className="space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-xs sm:p-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Langkah 2 dari 2</p>
                <h2 className="mt-1 text-lg font-bold text-accent-text dark:text-accent-text">Bentuk teman ngobrol pertamamu</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  Tambahkan foto jika mau, lalu isi nama, usia, gender, asal, profesi, dan keahlian. Kamu bisa menulis Bible sendiri atau minta AI menyiapkan draf yang bebas kamu edit.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCharacterModal(true)}
                className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong"
              >
                + Buat karakter pertama
              </button>
              <button type="button" onClick={() => setStep("provider")} className="w-full py-1 text-sm text-ink-soft hover:text-ink">
                ← Kembali ke API key
              </button>
            </section>
          )}

          {step === "finish" && (
            <section className="space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-xs sm:p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-lg text-emerald-700 dark:text-emerald-300">✓</span>
                <div>
                  <h2 className="text-lg font-bold text-accent-text dark:text-accent-text">Siap mulai ngobrol</h2>
                  <p className="text-sm text-ink-soft">API key dan karakter pertamamu sudah tersedia.</p>
                </div>
              </div>
              {characters.length > 0 && (
                <div className="rounded-2xl border border-line bg-surface-2/50 px-3.5 py-3">
                  <p className="text-xs font-semibold text-accent-text dark:text-accent-text">Karakter di akunmu</p>
                  {characters.map((character) => <p key={character.id} className="mt-1 text-sm text-ink-soft">{character.name}</p>)}
                </div>
              )}
              {completeError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{completeError}</p>}
              <button type="button" disabled={completeBusy} onClick={() => void finishOnboarding()} className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong disabled:opacity-50">
                {completeBusy ? "Menyiapkan akun..." : "Mulai gunakan HeyTalent"}
              </button>
              {characters.length === 0 && !characterSaved && (
                <p className="text-center text-xs text-muted">Karakter yang baru dibuat akan muncul di sini setelah tersimpan.</p>
              )}
            </section>
          )}
        </div>
      </main>

      {showCharacterModal && (
        <CharacterModal
          providers={providers}
          existingNames={characterNames}
          onboardingMode
          onClose={() => setShowCharacterModal(false)}
          onSaved={async () => {
            await onCharactersChanged();
            setCharacterSaved(true);
            setStep("finish");
            setShowCharacterModal(false);
          }}
        />
      )}
    </div>
  );
}
