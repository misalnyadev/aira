import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { EMPTY_PROFILE, normalizeProfile, type UserProfile } from "@/lib/userProfile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UNAUTHORIZED = { error: "Kamu belum masuk." };

/**
 * Ambil profil pengguna. Selalu mengembalikan bentuk lengkap (string kosong
 * untuk yang belum diisi) supaya layar pengaturan tidak perlu menebak.
 */
export async function GET() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const [row] = await db
    .select({
      displayName: users.displayName,
      nickname: users.nickname,
      age: users.age,
      occupation: users.occupation,
      about: users.about,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const profile: UserProfile = row ?? EMPTY_PROFILE;
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const check = normalizeProfile(body);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const { displayName, nickname, age, occupation, about, avatarUrl } = check.profile;
  const updateSet: {
    displayName: string;
    nickname: string;
    age: number | null;
    occupation: string;
    about: string;
    avatarUrl?: string | null;
  } = { displayName, nickname, age, occupation, about };

  if ("avatarUrl" in body) {
    updateSet.avatarUrl = avatarUrl ?? null;
  }

  const [row] = await db
    .update(users)
    .set(updateSet)
    .where(eq(users.id, user.id))
    .returning({
      displayName: users.displayName,
      nickname: users.nickname,
      age: users.age,
      occupation: users.occupation,
      about: users.about,
      avatarUrl: users.avatarUrl,
    });

  return NextResponse.json({ profile: row ?? EMPTY_PROFILE });
}
