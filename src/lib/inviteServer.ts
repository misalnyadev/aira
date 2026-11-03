import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import {
  resolveActiveSignupCode,
  type SignupInviteSummary,
} from "@/lib/invite";

const SIGNUP_OVERRIDE_KEY = "signup_code_override";

/**
 * Ambil informasi kode undangan pendaftaran aktif saat ini (override DB atau `SIGNUP_CODE`).
 */
export async function getSignupCodeInfo(): Promise<SignupInviteSummary> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, SIGNUP_OVERRIDE_KEY))
    .limit(1);

  return resolveActiveSignupCode(row ? row.value : null, process.env.SIGNUP_CODE);
}

/**
 * Simpan override kode undangan pendaftaran baru di database (`""` = tutup sementara).
 */
export async function setSignupCodeOverride(
  nextValue: string
): Promise<SignupInviteSummary> {
  const cleaned = nextValue.trim();
  await db
    .insert(appSettings)
    .values({
      key: SIGNUP_OVERRIDE_KEY,
      value: cleaned,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value: cleaned,
        updatedAt: new Date(),
      },
    });

  return resolveActiveSignupCode(cleaned, process.env.SIGNUP_CODE);
}

/**
 * Hapus override di database sehingga kembali memakai `process.env.SIGNUP_CODE` dari Vercel.
 */
export async function clearSignupCodeOverride(): Promise<SignupInviteSummary> {
  await db
    .delete(appSettings)
    .where(eq(appSettings.key, SIGNUP_OVERRIDE_KEY));

  return resolveActiveSignupCode(null, process.env.SIGNUP_CODE);
}
