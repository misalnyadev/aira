import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetRequests, passwordResetTokens, sessions, users } from "@/db/schema";
import { destroySession } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { checkPasswordStrength, hashPassword } from "@/lib/password";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  await ensureDb();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const { token, password, confirmPassword } = body as {
    token?: unknown;
    password?: unknown;
    confirmPassword?: unknown;
  };
  if (typeof token !== "string" || token.length < 32 || token.length > 200) {
    return NextResponse.json(
      { error: "Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru." },
      { status: 400 }
    );
  }
  if (typeof password !== "string" || typeof confirmPassword !== "string") {
    return NextResponse.json({ error: "Kata sandi wajib diisi." }, { status: 400 });
  }

  const passwordError = checkPasswordStrength(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Konfirmasi kata sandi belum sama." }, { status: 400 });
  }

  const newPasswordHash = await hashPassword(password);
  const now = new Date();
  const tokenHash = hashResetToken(token);
  const resetUserId = await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ userId: passwordResetTokens.userId })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          gt(passwordResetTokens.expiresAt, now),
          isNull(passwordResetTokens.consumedAt)
        )
      )
      .limit(1);
    if (!candidate) return null;

    const [lockedUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, candidate.userId))
      .for("update")
      .limit(1);
    if (!lockedUser) return null;

    // Lock the pending request before the token, matching Admin and password-change transaction order.
    await tx
      .select({ id: passwordResetRequests.id })
      .from(passwordResetRequests)
      .where(
        and(
          eq(passwordResetRequests.userId, candidate.userId),
          eq(passwordResetRequests.status, "pending")
        )
      )
      .for("update")
      .limit(1);

    // Claim the token atomically so concurrent submissions can only succeed once.
    const [reset] = await tx
      .update(passwordResetTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          gt(passwordResetTokens.expiresAt, now),
          isNull(passwordResetTokens.consumedAt)
        )
      )
      .returning({ userId: passwordResetTokens.userId });
    if (!reset) return null;

    await tx.update(users).set({ passwordHash: newPasswordHash }).where(eq(users.id, reset.userId));
    await tx.delete(sessions).where(eq(sessions.userId, reset.userId));
    await tx
      .update(passwordResetRequests)
      .set({ status: "completed", resolvedAt: now, resolvedBy: reset.userId, contactInfo: "" })
      .where(
        and(
          eq(passwordResetRequests.userId, reset.userId),
          eq(passwordResetRequests.status, "pending")
        )
      );
    return reset.userId;
  });

  if (!resetUserId) {
    return NextResponse.json(
      { error: "Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru." },
      { status: 400 }
    );
  }

  await destroySession();
  return NextResponse.json({
    message: "Kata sandi berhasil diatur ulang. Semua sesi lama sudah dikeluarkan; silakan masuk lagi.",
  });
}
