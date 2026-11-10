import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetRequests, passwordResetTokens, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { createPasswordResetUrl } from "@/lib/passwordResetUrl";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN_LIFETIME_MS = 30 * 60 * 1000;

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  await ensureDb();

  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Hanya Admin yang dapat memproses pengajuan reset." }, { status: 403 });
  }

  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Pengajuan reset tidak valid." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Tindakan tidak valid." }, { status: 400 });
  }
  const action = (body as { action?: unknown }).action;
  if (action !== "issue" && action !== "revoke" && action !== "reject") {
    return NextResponse.json({ error: "Tindakan pengajuan reset tidak valid." }, { status: 400 });
  }

  const now = new Date();
  const token = action === "issue" ? randomBytes(32).toString("base64url") : null;
  const resetUrl = token ? createPasswordResetUrl(token) : null;
  if (action === "issue" && !resetUrl) {
    return NextResponse.json(
      { error: "APP_URL belum dikonfigurasi untuk membuat tautan reset." },
      { status: 503 }
    );
  }

  const result = await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({ id: passwordResetRequests.id, userId: passwordResetRequests.userId })
      .from(passwordResetRequests)
      .where(eq(passwordResetRequests.id, id))
      .limit(1);
    if (!candidate) return { ok: false as const, status: 404, error: "Pengajuan reset sudah diproses atau tidak ditemukan." };

    const [lockedUser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, candidate.userId))
      .for("update")
      .limit(1);
    if (!lockedUser) return { ok: false as const, status: 404, error: "Akun member tidak ditemukan." };

    const [request] = await tx
      .select({ id: passwordResetRequests.id, userId: passwordResetRequests.userId })
      .from(passwordResetRequests)
      .where(
        and(
          eq(passwordResetRequests.id, id),
          eq(passwordResetRequests.status, "pending")
        )
      )
      .for("update")
      .limit(1);
    if (!request) return { ok: false as const, status: 404, error: "Pengajuan reset sudah diproses atau tidak ditemukan." };

    if (action === "revoke") {
      const [revokedToken] = await tx
        .update(passwordResetTokens)
        .set({ consumedAt: now })
        .where(
          and(
            eq(passwordResetTokens.userId, request.userId),
            isNull(passwordResetTokens.consumedAt)
          )
        )
        .returning({ userId: passwordResetTokens.userId });
      if (!revokedToken) {
        return { ok: false as const, status: 409, error: "Tidak ada tautan reset aktif untuk dicabut." };
      }
      return { ok: true as const, action: "revoked" as const };
    }

    if (action === "reject") {
      await tx
        .update(passwordResetTokens)
        .set({ consumedAt: now })
        .where(
          and(
            eq(passwordResetTokens.userId, request.userId),
            isNull(passwordResetTokens.consumedAt)
          )
        );
      await tx
        .update(passwordResetRequests)
        .set({ status: "rejected", resolvedAt: now, resolvedBy: admin.id, contactInfo: "" })
        .where(eq(passwordResetRequests.id, request.id));
      return { ok: true as const, action: "rejected" as const };
    }

    const expiresAt = new Date(now.getTime() + TOKEN_LIFETIME_MS);
    await tx
      .insert(passwordResetTokens)
      .values({
        userId: request.userId,
        tokenHash: hashResetToken(token!),
        expiresAt,
        createdAt: now,
        consumedAt: null,
      })
      .onConflictDoUpdate({
        target: passwordResetTokens.userId,
        set: {
          tokenHash: hashResetToken(token!),
          expiresAt,
          createdAt: now,
          consumedAt: null,
        },
      });

    await tx
      .update(passwordResetRequests)
      .set({ lastIssuedAt: now, lastIssuedBy: admin.id })
      .where(eq(passwordResetRequests.id, request.id));

    return { ok: true as const, action: "issued" as const, resetUrl: resetUrl!, expiresAt };
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (result.action === "rejected") {
    return NextResponse.json({ message: "Pengajuan reset ditolak." });
  }
  if (result.action === "revoked") {
    return NextResponse.json({ message: "Tautan reset dicabut dan tidak dapat digunakan lagi." });
  }

  return NextResponse.json({
    message: "Tautan reset dibuat. Salin dan kirim secara pribadi setelah identitas member terverifikasi.",
    resetUrl: result.resetUrl,
    expiresAt: result.expiresAt.toISOString(),
  });
}
