import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { decoyHash, normalizeEmail, verifyPassword } from "@/lib/password";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Pesan gagal sengaja sama untuk email tidak dikenal maupun kata sandi salah.
 * Kalau dibedakan, siapa pun bisa memakai halaman masuk untuk mencari tahu
 * email mana yang punya akun.
 */
const WRONG_LOGIN = "Email atau kata sandi salah.";

export async function POST(req: Request) {
  await ensureDb();

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { email: rawEmail, password } = body as { email?: string; password?: string };
  const email = normalizeEmail(rawEmail ?? "");
  const input = password ?? "";

  if (!email || !input) {
    return NextResponse.json({ error: WRONG_LOGIN }, { status: 401 });
  }

  const [row] = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  /*
   * Kalau email tidak ada, tetap jalankan pemeriksaan terhadap hash umpan.
   * Tanpa ini, permintaan selesai jauh lebih cepat dan selisih waktunya bisa
   * dipakai untuk menebak email mana yang terdaftar.
   */
  const storedHash = row?.passwordHash ?? (await decoyHash());
  const valid = await verifyPassword(input, storedHash);

  if (!row || !valid) {
    return NextResponse.json({ error: WRONG_LOGIN }, { status: 401 });
  }

  await createSession(row.id);

  return NextResponse.json({ user: { id: row.id, email: row.email } });
}
