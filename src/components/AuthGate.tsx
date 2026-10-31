"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  type AuthUser,
} from "@/lib/authClient";

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
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
              💬
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Aisherly</h1>
            <p className="mt-1 text-sm text-slate-500">
              {isRegister
                ? "Buat akun pakai kode undangan."
                : "Masuk untuk melanjutkan percakapanmu."}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                placeholder="nama@email.com"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Kata sandi</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                placeholder={isRegister ? "Minimal 8 karakter, ada angkanya" : "Kata sandi"}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-emerald-400"
              />
            </div>

            {isRegister && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Kode undangan
                </label>
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  placeholder="Kode dari temanmu"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-emerald-400"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Aplikasi ini hanya untuk teman, bukan pendaftaran umum.
                </p>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy ? "Memproses..." : isRegister ? "Daftar" : "Masuk"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(isRegister ? "login" : "register");
                setError(null);
              }}
              className="w-full py-1 text-center text-sm text-slate-500 hover:text-slate-700"
            >
              {isRegister ? "Sudah punya akun? Masuk" : "Punya kode undangan? Daftar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={contextValue!}>{children}</AuthContext.Provider>;
}
