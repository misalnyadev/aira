import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, characters, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { parseBackupKeys } from "@/lib/providerPool";

export const dynamic = "force-dynamic";

export async function POST() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });

  const [providers, [character]] = await Promise.all([
    db
      .select({ apiKey: apiProviders.apiKey, backupKeys: apiProviders.backupKeys })
      .from(apiProviders)
      .where(eq(apiProviders.userId, user.id)),
    db.select({ id: characters.id }).from(characters).where(eq(characters.userId, user.id)).limit(1),
  ]);
  const hasApiKey = providers.some(
    (provider) => Boolean(provider.apiKey.trim() || parseBackupKeys(provider.backupKeys, provider.apiKey).length)
  );

  if (!hasApiKey) {
    return NextResponse.json({ error: "Simpan minimal satu API key sebelum melanjutkan." }, { status: 409 });
  }
  if (!character) {
    return NextResponse.json({ error: "Buat satu karakter terlebih dahulu." }, { status: 409 });
  }

  await db
    .update(users)
    .set({ onboardingCompleted: true })
    .where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}
