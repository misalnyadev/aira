"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  requestPasswordReset,
  type AuthUser,
} from "@/lib/authClient";
import { useKeyboardPan } from "@/lib/keyboardPan";
import { useSafeTop } from "@/lib/safeTop";
import { useScrollGuard } from "@/lib/scrollGuard";
import { ThemeQuickToggle } from "./ThemeToggle";
import { GENDER_OPTIONS, type Gender } from "@/lib/gender";
import { MAX_AGE, MAX_ABOUT_CHARS, MAX_DISPLAY_NAME_CHARS, MAX_NICKNAME_CHARS, MAX_OCCUPATION_CHARS, MIN_AGE } from "@/lib/limits";

type AuthContextValue = {
  user: AuthUser;
  /** Keluar dari akun. */
  signOut: () => Promise<void>;
  /** Dipanggil saat API membalas 401 — sesi sudah tidak berlaku. */
  expire: () => void;
  /** Menutup wizard hanya setelah API key dan karakter pertama tersimpan. */
  completeOnboarding: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth dipakai di luar AuthGate.");
  return value;
}

type Mode = "login" | "register" | "forgot";

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
  const [recoveryContact, setRecoveryContact] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<Gender>("");
  const [age, setAge] = useState("");
  const [occupation, setOccupation] = useState("");
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useSafeTop();
  useScrollGuard();
  useKeyboardPan();

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

  const completeOnboarding = useCallback(() => {
    setUser((current) => current ? { ...current, onboardingCompleted: true } : current);
  }, []);

  const contextValue = useMemo<AuthContextValue | null>(
    () => (user ? { user, signOut, expire, completeOnboarding } : null),
    [user, signOut, expire, completeOnboarding]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setError(null);
    setNotice(null);
    setBusy(true);

    if (mode === "forgot") {
      const result = await requestPasswordReset(email, recoveryContact);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.message);
      return;
    }

    const result =
      mode === "login"
        ? await apiLogin(email, password)
        : await apiRegister(email, password, inviteCode, {
            displayName,
            nickname,
            gender,
            age: age.trim() ? Number(age) : null,
            occupation,
            about,
          });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPassword("");
    window.scrollTo(0, 0);
    window.setTimeout(() => window.scrollTo(0, 0), 150);
    setUser(result.user);
  }

  if (!user) {
    const isRegister = mode === "register";
    const isForgot = mode === "forgot";

    return (
      <div className="app-shell flex flex-col bg-app">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,var(--safe-top))]">
          <div className="flex justify-end">
            <ThemeQuickToggle />
          </div>

          <div className="m-auto w-full max-w-sm py-6">
          <div className="mb-6 text-center">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
              HeyTalent
            </h1>
            <p className="mt-1.5 text-sm text-ink-soft">
              {isRegister
                ? "Buat akun dengan kode undangan dan isi profil singkat."
                : isForgot
                  ? "Ajukan bantuan reset kata sandi kepada Admin."
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
                onChange={(e) => {
                  setEmail(e.target.value);
                  setNotice(null);
                }}
                autoComplete="email"
                required
                maxLength={254}
                placeholder="nama@email.com"
                className={FIELD}
              />
            </div>

            {isForgot && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">
                    Kontak tambahan (opsional)
                  </label>
                  <input
                    value={recoveryContact}
                    onChange={(event) => {
                      setRecoveryContact(event.target.value);
                      setNotice(null);
                    }}
                    maxLength={120}
                    placeholder="WhatsApp atau cara Admin mengenalimu"
                    className={FIELD}
                  />
                </div>
                <p className="text-xs leading-relaxed text-ink-soft">
                  Admin akan memverifikasi identitasmu melalui jalur yang sudah dikenal sebelum membuat tautan reset. Jangan cantumkan kata sandi.
                </p>
              </>
            )}

            {!isForgot && (
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Kata sandi</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  required
                  maxLength={200}
                  placeholder={isRegister ? "Minimal 8 karakter, ada angkanya" : "Kata sandi"}
                  className={FIELD}
                />
              </div>
            )}

            {isRegister && (
              <div className="space-y-3 rounded-2xl border border-line bg-surface-2/50 p-3.5">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Profil akun</h2>
                  <p className="mt-0.5 text-[11px] text-muted">Nama wajib diisi; detail lainnya boleh dilengkapi nanti.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Nama kamu</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    required
                    maxLength={MAX_DISPLAY_NAME_CHARS}
                    placeholder="Nama tampilan"
                    className={FIELD}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Panggilan (opsional)</label>
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={MAX_NICKNAME_CHARS}
                    placeholder="Mau dipanggil apa?"
                    className={FIELD}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">Usia</label>
                    <input
                      type="number"
                      min={MIN_AGE}
                      max={MAX_AGE}
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="Opsional"
                      className={FIELD}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">Gender</label>
                    <select value={gender} onChange={(e) => setGender(e.target.value as Gender)} className={FIELD}>
                      {GENDER_OPTIONS.map(({ value, label }) => (
                        <option key={value || "unspecified"} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Kesibukan (opsional)</label>
                  <input
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    maxLength={MAX_OCCUPATION_CHARS}
                    placeholder="Pekerjaan atau kegiatan"
                    className={FIELD}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Tentang kamu (opsional)</label>
                  <textarea
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    maxLength={MAX_ABOUT_CHARS}
                    rows={2}
                    placeholder="Hal yang ingin karakter tahu tentangmu"
                    className={`${FIELD} resize-none`}
                  />
                </div>
              </div>
            )}

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
            {notice && (
              <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.99] disabled:opacity-60"
            >
              {busy
                ? isForgot
                  ? "Mengajukan..."
                  : "Memproses..."
                : isRegister
                  ? "Daftar"
                  : isForgot
                    ? "Ajukan ke Admin"
                    : "Masuk"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(isForgot || isRegister ? "login" : "register");
                setRecoveryContact("");
                setPassword("");
                setError(null);
                setNotice(null);
              }}
              className="w-full py-1 text-center text-sm text-ink-soft transition hover:text-ink"
            >
              {isForgot
                ? "Kembali ke masuk"
                : isRegister
                  ? "Sudah punya akun? Masuk"
                  : "Punya kode undangan? Daftar"}
            </button>
            {!isRegister && !isForgot && (
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setRecoveryContact("");
                  setPassword("");
                  setError(null);
                  setNotice(null);
                }}
                className="w-full py-1 text-center text-sm text-ink-soft transition hover:text-ink"
              >
                Lupa kata sandi?
              </button>
            )}
          </form>
        </div>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={contextValue!}>{children}</AuthContext.Provider>;
}
