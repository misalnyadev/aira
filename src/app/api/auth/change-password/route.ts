import { NextResponse } from "next/server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { passwordResetTokens, sessions, users } from "@/db/schema";
import { hashSessionToken, requireUser, SESSION_COOKIE } from "@/lib/auth";
import { checkPasswordStrength, hashPassword, verifyPassword } from "@/lib/password";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk lagi." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const { currentPassword, newPassword, confirmPassword } = body as {
    currentPassword?: unknown;
    newPassword?: unknown;
    confirmPassword?: unknown;
  };
  if (typeof currentPassword !== "string" || !currentPassword) {
    return NextResponse.json({ error: "Kata sandi saat ini wajib diisi." }, { status: 400 });
  }
  if (currentPassword.length > 200) {
    return NextResponse.json({ error: "Kata sandi terlalu panjang." }, { status: 400 });
  }
  if (typeof newPassword !== "string" || typeof confirmPassword !== "string") {
    return NextResponse.json({ error: "Kata sandi baru wajib diisi." }, { status: 400 });
  }

  const passwordError = checkPasswordStrength(newPassword);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "Konfirmasi kata sandi belum sama." }, { status: 400 });
  }
  if (newPassword.normalize("NFKC") === currentPassword.normalize("NFKC")) {
    return NextResponse.json({ error: "Kata sandi baru harus berbeda." }, { status: 400 });
  }

  const [account] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) {
    return NextResponse.json({ error: "Kata sandi saat ini salah." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const rawSessionToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (!rawSessionToken) {
    return NextResponse.json({ error: "Sesi tidak valid. Silakan masuk lagi." }, { status: 401 });
  }

  const newPasswordHash = await hashPassword(newPassword);
  const currentSessionId = hashSessionToken(rawSessionToken);
  const changed = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ passwordHash: newPasswordHash })
      .where(and(eq(users.id, user.id), eq(users.passwordHash, account.passwordHash)))
      .returning({ id: users.id });

    if (!updated) return false;

    await tx
      .delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, currentSessionId)));
    await tx
      .update(passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.consumedAt)));
    return true;
  });

  if (!changed) {
    return NextResponse.json(
      { error: "Kata sandi akun baru saja berubah. Muat ulang lalu coba lagi." },
      { status: 409 }
    );
  }

  return NextResponse.json({
    message: "Kata sandi berhasil diubah. Sesi di perangkat lain sudah dikeluarkan.",
  });
}
