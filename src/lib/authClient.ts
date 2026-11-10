"use client";

export type AuthUser = {
  id: string;
  email: string;
  isAdmin?: boolean;
  characterQuota?: number;
  onboardingCompleted: boolean;
};

type Result = { ok: true; user: AuthUser } | { ok: false; error: string };
export type AuthActionResult = { ok: true; message: string } | { ok: false; error: string };

async function post(url: string, payload: unknown): Promise<Result> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.user) {
      return { ok: false, error: data?.error || "Terjadi kesalahan. Coba lagi." };
    }
    return { ok: true, user: data.user as AuthUser };
  } catch {
    return { ok: false, error: "Tidak bisa menghubungi server. Cek koneksi." };
  }
}

export function login(email: string, password: string): Promise<Result> {
  return post("/api/auth/login", { email, password });
}

export function register(
  email: string,
  password: string,
  inviteCode: string,
  profile: {
    displayName: string;
    nickname: string;
    gender: string;
    age: number | null;
    occupation: string;
    about: string;
  }
): Promise<Result> {
  return post("/api/auth/register", { email, password, inviteCode, profile });
}

async function postAuthAction(url: string, payload: unknown): Promise<AuthActionResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data?.error || "Terjadi kesalahan. Coba lagi." };
    }
    return { ok: true, message: data?.message || "Permintaan berhasil." };
  } catch {
    return { ok: false, error: "Tidak bisa menghubungi server. Cek koneksi." };
  }
}

export function requestPasswordReset(email: string): Promise<AuthActionResult> {
  return postAuthAction("/api/auth/forgot-password", { email });
}

export function resetPassword(
  token: string,
  password: string,
  confirmPassword: string
): Promise<AuthActionResult> {
  return postAuthAction("/api/auth/reset-password", { token, password, confirmPassword });
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<AuthActionResult> {
  return postAuthAction("/api/auth/change-password", {
    currentPassword,
    newPassword,
    confirmPassword,
  });
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}

/** Pengguna yang sedang masuk menurut server, atau null. */
export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    const data = await res.json();
    return (data?.user as AuthUser) ?? null;
  } catch {
    return null;
  }
}
