import { NextResponse } from "next/server";
import { isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, characters, users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { checkInvite } from "@/lib/invite";
import { getSignupCodeInfo } from "@/lib/inviteServer";
import { adoptLegacyData } from "@/lib/legacyData";
import { checkEmail, checkPasswordStrength, hashPassword, normalizeEmail } from "@/lib/password";
import { normalizeProfile } from "@/lib/userProfile";
import { parseBackupKeys } from "@/lib/providerPool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  await ensureDb();

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { email: rawEmail, password, inviteCode, profile: rawProfile } = body as {
    email?: string;
    password?: string;
    inviteCode?: string;
    profile?: unknown;
  };

  /*
   * Kode undangan diperiksa PALING AWAL, sebelum memeriksa tabel users.
   * Mendukung kode bawaan Vercel (`SIGNUP_CODE`) maupun kode terbaru dari Panel Admin.
   */
  const { code: expectedInviteCode } = await getSignupCodeInfo();
  const inviteError = checkInvite(expectedInviteCode, inviteCode);
  if (inviteError) {
    return NextResponse.json({ error: inviteError }, { status: 403 });
  }

  const email = normalizeEmail(rawEmail ?? "");
  const emailError = checkEmail(email);
  if (emailError) return NextResponse.json({ error: emailError }, { status: 400 });

  const passwordError = checkPasswordStrength(password ?? "");
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

  const profileInput = rawProfile && typeof rawProfile === "object"
    ? rawProfile as Parameters<typeof normalizeProfile>[0]
    : {};
  const profileCheck = normalizeProfile(profileInput);
  if (!profileCheck.ok) return NextResponse.json({ error: profileCheck.error }, { status: 400 });
  if (!profileCheck.profile.displayName) {
    return NextResponse.json({ error: "Nama tampilan wajib diisi saat mendaftar." }, { status: 400 });
  }

  // Apakah ini akun pertama atau cocok ADMIN_EMAIL? Menentukan status Admin & kuota.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);
  const isFirstUser = Number(count) === 0;
  let hasLegacyWorkspace = false;
  if (isFirstUser) {
    const [legacyCharacters, legacyProviders] = await Promise.all([
      db.select({ id: characters.id }).from(characters).where(isNull(characters.userId)).limit(1),
      db
        .select({ apiKey: apiProviders.apiKey, backupKeys: apiProviders.backupKeys })
        .from(apiProviders)
        .where(isNull(apiProviders.userId)),
    ]);
    const hasLegacyProvider = legacyProviders.some(
      (provider) => Boolean(provider.apiKey.trim() || parseBackupKeys(provider.backupKeys, provider.apiKey).length)
    );
    hasLegacyWorkspace = Boolean(legacyCharacters.length && hasLegacyProvider);
  }
  const onboardingCompleted = isFirstUser && hasLegacyWorkspace;
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const isAdmin = isFirstUser || Boolean(adminEmail && email === adminEmail);
  const initialQuota = isAdmin ? 50 : 1;

  const passwordHash = await hashPassword(password!);

  let created;
  try {
    [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        isAdmin,
        characterQuota: initialQuota,
        onboardingCompleted,
        displayName: profileCheck.profile.displayName,
        nickname: profileCheck.profile.nickname,
        gender: profileCheck.profile.gender,
        age: profileCheck.profile.age,
        occupation: profileCheck.profile.occupation,
        about: profileCheck.profile.about,
        avatarUrl: profileCheck.profile.avatarUrl ?? null,
      })
      .returning({
        id: users.id,
        email: users.email,
        isAdmin: users.isAdmin,
        characterQuota: users.characterQuota,
        onboardingCompleted: users.onboardingCompleted,
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
  }

  await createSession(created.id);

  return NextResponse.json({ user: created }, { status: 201 });
}
