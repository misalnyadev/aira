import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

export const SESSION_COOKIE = "aisherly_session";
const SESSION_DAYS = 30;

export type AuthUser = {
  id: string;
  email: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Buat sesi baru lalu pasang cookie HttpOnly di browser. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });

  // Bersihkan sesi kedaluwarsa sekali-sekali; tidak perlu sering.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).catch(() => undefined);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Pengguna yang sedang masuk, atau null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  return row ?? null;
}

/** Hapus sesi yang sedang dipakai lalu hapus cookienya. */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * Ambil pengguna untuk route API. Mengembalikan `null` kalau belum masuk —
 * pemanggil yang memutuskan membalas 401.
 */
export async function requireUser(): Promise<AuthUser | null> {
  return getCurrentUser();
}
