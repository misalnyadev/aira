"use client";

export type AuthUser = {
  id: string;
  email: string;
};

type Result = { ok: true; user: AuthUser } | { ok: false; error: string };

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
  inviteCode: string
): Promise<Result> {
  return post("/api/auth/register", { email, password, inviteCode });
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
