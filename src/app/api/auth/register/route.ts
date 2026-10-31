import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { checkInvite } from "@/lib/invite";
import { adoptLegacyData } from "@/lib/legacyData";
import { checkEmail, checkPasswordStrength, hashPassword, normalizeEmail } from "@/lib/password";
import { seedStarterCharacter } from "@/lib/seedDemo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  await ensureDb();

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { email: rawEmail, password, inviteCode } = body as {
    email?: string;
    password?: string;
    inviteCode?: string;
  };

  /*
   * Kode undangan diperiksa PALING AWAL, sebelum menyentuh database.
   * Dengan begitu percobaan tanpa kode tidak bisa dipakai untuk menebak email
   * mana yang sudah terdaftar, dan tidak membebani database.
   */
  const inviteError = checkInvite(process.env.SIGNUP_CODE, inviteCode);
  if (inviteError) {
    return NextResponse.json({ error: inviteError }, { status: 403 });
  }

  const email = normalizeEmail(rawEmail ?? "");
  const emailError = checkEmail(email);
  if (emailError) return NextResponse.json({ error: emailError }, { status: 400 });

  const passwordError = checkPasswordStrength(password ?? "");
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  // Apakah ini akun pertama? Menentukan siapa yang mengambil data lama.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  const isFirstUser = Number(count) === 0;

  const passwordHash = await hashPassword(password!);

  let created;
  try {
    [created] = await db.insert(users).values({ email, passwordHash }).returning({
      id: users.id,
      email: users.email,
    });
  } catch (err) {
    // Balapan: dua permintaan mendaftar dengan email sama hampir bersamaan.
    const message = err instanceof Error ? err.message : "";
    if (/duplicate key|unique/i.test(message)) {
      return NextResponse.json(
        { error: "Email ini sudah terdaftar. Coba masuk." },
        { status: 409 }
      );
    }
    throw err;
  }

  if (isFirstUser) {
    // Akun pertama mewarisi karakter + API key dari versi sebelum ada login.
    await adoptLegacyData(created.id);
  } else {
    // Akun berikutnya mendapat satu karakter contoh sebagai titik mulai.
    await seedStarterCharacter(created.id).catch(() => null);
  }

  await createSession(created.id);

  return NextResponse.json({ user: created }, { status: 201 });
}
