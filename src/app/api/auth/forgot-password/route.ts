import { createHash, randomBytes } from "node:crypto";
import { after, NextResponse } from "next/server";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { ensureDb } from "@/lib/dbReady";
import { checkEmail, normalizeEmail } from "@/lib/password";
import {
  createPasswordResetUrl,
  isPasswordResetEmailConfigured,
  sendPasswordResetEmail,
} from "@/lib/passwordResetEmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESET_TOKEN_LIFETIME_MS = 30 * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;
const GENERIC_MESSAGE =
  "Jika email ini terdaftar, tautan untuk mengatur ulang kata sandi akan dikirim.";

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  await ensureDb();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const rawEmail = (body as { email?: unknown }).email;
  const email = normalizeEmail(typeof rawEmail === "string" ? rawEmail : "");
  const emailError = checkEmail(email);
  if (emailError) return NextResponse.json({ error: emailError }, { status: 400 });

  if (!isPasswordResetEmailConfigured()) {
    return NextResponse.json(
      { error: "Fitur pemulihan kata sandi belum dikonfigurasi oleh pengelola aplikasi." },
      { status: 503 }
    );
  }

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Jawaban sama untuk email yang tidak terdaftar agar akun tidak bisa ditebak.
  if (!user) return NextResponse.json({ message: GENERIC_MESSAGE });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(token);
  const now = new Date();
  const resetUrl = createPasswordResetUrl(token);
  if (!resetUrl) {
    return NextResponse.json(
      { error: "Fitur pemulihan kata sandi belum dikonfigurasi oleh pengelola aplikasi." },
      { status: 503 }
    );
  }

  // Satu token aktif per akun dan jeda 60 detik mencegah email berulang.
  const [resetRequest] = await db
    .insert(passwordResetTokens)
    .values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(now.getTime() + RESET_TOKEN_LIFETIME_MS),
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: passwordResetTokens.userId,
      set: {
        tokenHash,
        expiresAt: new Date(now.getTime() + RESET_TOKEN_LIFETIME_MS),
        createdAt: now,
        consumedAt: null,
      },
      setWhere: lt(
        passwordResetTokens.createdAt,
        new Date(now.getTime() - RESET_REQUEST_COOLDOWN_MS)
      ),
    })
    .returning({ userId: passwordResetTokens.userId });

  if (resetRequest) {
    after(async () => {
      try {
        await sendPasswordResetEmail(user.email, resetUrl);
      } catch (error) {
        console.error(
          "[auth] Failed to send password reset email:",
          error instanceof Error ? error.message : "Unknown email provider error"
        );
        await db
          .update(passwordResetTokens)
          .set({ consumedAt: new Date() })
          .where(
            and(
              eq(passwordResetTokens.userId, user.id),
              eq(passwordResetTokens.tokenHash, tokenHash),
              isNull(passwordResetTokens.consumedAt)
            )
          )
          .catch(() => undefined);
      }
    });
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
