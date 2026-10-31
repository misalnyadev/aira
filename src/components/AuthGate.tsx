"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  type AuthUser,
} from "@/lib/authClient";
import { useSafeTop } from "@/lib/safeTop";
import { ThemeQuickToggle } from "./ThemeToggle";

type AuthContextValue = {
  user: AuthUser;
  /** Keluar dari akun. */
  signOut: () => Promise<void>;
  /** Dipanggil saat API membalas 401 — sesi sudah tidak berlaku. */
  expire: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth dipakai di luar AuthGate.");
  return value;
}

type Mode = "login" | "register";

const FIELD =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink outline-none transition placeholder:text-muted focus:border-ink sm:text-sm";

export function AuthGate({
  initialUser,
  children,
}: {
  initialUser: AuthUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSafeTop();

  const signOut = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setPassword("");
    setError(null);
  }, []);

  const expire = useCallback(() => {
    setUser(null);
    setError("Sesi kamu sudah berakhir. Silakan masuk lagi.");
  }, []);

  const contextValue = useMemo<AuthContextValue | null>(
    () => (user ? { user, signOut, expire } : null),
    [user, signOut, expire]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const result =
      mode === "login"
        ? await apiLogin(email, password)
        : await apiRegister(email, password, inviteCode);

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPassword("");
    setUser(result.user);
  }

  if (!user) {
    const isRegister = mode === "register";

    return (
      <div className="app-shell flex flex-col bg-app">
        <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,var(--safe-top))]">
          <div className="flex justify-end">
            <ThemeQuickToggle />
          </div>

          <div className="m-auto w-full max-w-sm py-6">
          <div className="mb-6 text-center">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
              Aisherly<span className="text-muted">.</span>
            </h1>
            <p className="mt-1.5 text-sm text-ink-soft">
              {isRegister
                ? "Buat akun pakai kode undangan."
                : "Masuk untuk melanjutkan percakapanmu."}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-3.5 rounded-3xl border border-line bg-surface p-5 shadow-xs sm:p-6"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                placeholder="nama@email.com"
                className={FIELD}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Kata sandi</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                placeholder={isRegister ? "Minimal 8 karakter, ada angkanya" : "Kata sandi"}
                className={FIELD}
              />
            </div>

            {isRegister && (
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">
                  Kode undangan
                </label>
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  placeholder="Kode dari temanmu"
                  className={FIELD}
                />
                <p className="mt-1 text-[11px] text-muted">
                  Aplikasi ini hanya untuk teman, bukan pendaftaran umum.
                </p>
              </div>
            )}

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
              {busy ? "Memproses..." : isRegister ? "Daftar" : "Masuk"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(isRegister ? "login" : "register");
                setError(null);
              }}
              className="w-full py-1 text-center text-sm text-ink-soft transition hover:text-ink"
            >
              {isRegister ? "Sudah punya akun? Masuk" : "Punya kode undangan? Daftar"}
            </button>
          </form>
        </div>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={contextValue!}>{children}</AuthContext.Provider>;
}
