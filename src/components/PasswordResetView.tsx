"use client";

import { useState } from "react";
import Link from "next/link";
import { resetPassword } from "@/lib/authClient";
import { useKeyboardPan } from "@/lib/keyboardPan";
import { useSafeTop } from "@/lib/safeTop";
import { useScrollGuard } from "@/lib/scrollGuard";
import { ThemeQuickToggle } from "./ThemeToggle";

const FIELD =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink outline-none transition placeholder:text-muted focus:border-ink sm:text-sm";

export function PasswordResetView({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useSafeTop();
  useScrollGuard();
  useKeyboardPan();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await resetPassword(token, password, confirmPassword);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess(true);
    setPassword("");
    setConfirmPassword("");
  }

  const hasToken = token.length >= 32;

  return (
    <div className="app-shell flex flex-col bg-app">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,var(--safe-top))]">
        <div className="flex justify-end">
          <ThemeQuickToggle />
        </div>

        <div className="m-auto w-full max-w-sm py-6">
          <div className="mb-6 text-center">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-accent-text dark:text-accent-text">
              HeyTalent
            </h1>
            <p className="mt-1.5 text-sm text-ink-soft">Atur ulang kata sandi akunmu.</p>
          </div>

          <div className="space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-xs sm:p-6">
            {!hasToken ? (
              <>
                <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
                  Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru dari halaman masuk.
                </p>
                <Link
                  href="/"
                  className="block w-full rounded-xl bg-brand py-2.5 text-center text-sm font-semibold text-brand-ink transition hover:bg-brand-strong"
                >
                  Kembali ke masuk
                </Link>
              </>
            ) : success ? (
              <>
                <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                  Kata sandi berhasil diatur ulang. Semua sesi lama sudah dikeluarkan; silakan masuk lagi.
                </p>
                <Link
                  href="/"
                  className="block w-full rounded-xl bg-brand py-2.5 text-center text-sm font-semibold text-brand-ink transition hover:bg-brand-strong"
                >
                  Masuk ke akun
                </Link>
              </>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-ink-soft">
                  Buat kata sandi baru. Minimal 8 karakter, mengandung huruf dan angka.
                </p>
                <form onSubmit={handleSubmit} className="space-y-3.5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">
                      Kata sandi baru
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={200}
                      required
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">
                      Ulangi kata sandi baru
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={200}
                      required
                      className={FIELD}
                    />
                  </div>
                  {error && (
                    <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.99] disabled:opacity-60"
                  >
                    {busy ? "Menyimpan..." : "Simpan kata sandi baru"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
