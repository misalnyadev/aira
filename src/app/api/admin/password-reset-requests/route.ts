import { NextResponse } from "next/server";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetRequests, passwordResetTokens, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await ensureDb();

  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Hanya Admin yang dapat melihat pengajuan reset." }, { status: 403 });
  }

  const requests = await db
    .select({
      id: passwordResetRequests.id,
      userId: passwordResetRequests.userId,
      email: users.email,
      displayName: users.displayName,
      nickname: users.nickname,
      contactInfo: passwordResetRequests.contactInfo,
      createdAt: passwordResetRequests.createdAt,
      lastIssuedAt: passwordResetRequests.lastIssuedAt,
      activeLinkExpiresAt: passwordResetTokens.expiresAt,
    })
    .from(passwordResetRequests)
    .innerJoin(users, eq(users.id, passwordResetRequests.userId))
    .leftJoin(
      passwordResetTokens,
      and(
        eq(passwordResetTokens.userId, passwordResetRequests.userId),
        gt(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.consumedAt)
      )
    )
    .where(eq(passwordResetRequests.status, "pending"))
    .orderBy(asc(passwordResetRequests.createdAt))
    .limit(100);

  return NextResponse.json({ requests });
}
