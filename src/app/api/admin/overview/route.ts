import { NextResponse } from "next/server";
import { asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterQuotaRequests, characters, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { effectiveCharacterLimit } from "@/lib/quotaRules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORBIDDEN = { error: "Hanya Admin yang dapat mengakses panel ini." };

export async function GET() {
  await ensureDb();

  const admin = await requireAdmin();
  if (!admin) return NextResponse.json(FORBIDDEN, { status: 403 });

  const charCountSub = db
    .select({
      userId: characters.userId,
      charCount: sql<number>`count(*)::int`.as("char_count"),
    })
    .from(characters)
    .groupBy(characters.userId)
    .as("char_count_sub");

  const [allUsers, pendingRows, resolvedRows] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        nickname: users.nickname,
        avatarUrl: users.avatarUrl,
        isAdmin: users.isAdmin,
        characterQuota: users.characterQuota,
        createdAt: users.createdAt,
        characterCount: sql<number>`coalesce(${charCountSub.charCount}, 0)::int`,
      })
      .from(users)
      .leftJoin(charCountSub, eq(charCountSub.userId, users.id))
      .orderBy(desc(users.isAdmin), asc(users.createdAt)),
    db
      .select({
        id: characterQuotaRequests.id,
        userId: characterQuotaRequests.userId,
        requestedQuota: characterQuotaRequests.requestedQuota,
        reason: characterQuotaRequests.reason,
        status: characterQuotaRequests.status,
        adminNote: characterQuotaRequests.adminNote,
        createdAt: characterQuotaRequests.createdAt,
        email: users.email,
        displayName: users.displayName,
        nickname: users.nickname,
        currentQuota: users.characterQuota,
        characterCount: sql<number>`coalesce(${charCountSub.charCount}, 0)::int`,
      })
      .from(characterQuotaRequests)
      .innerJoin(users, eq(users.id, characterQuotaRequests.userId))
      .leftJoin(charCountSub, eq(charCountSub.userId, users.id))
      .where(eq(characterQuotaRequests.status, "pending"))
      .orderBy(asc(characterQuotaRequests.createdAt)),
    db
      .select({
        id: characterQuotaRequests.id,
        userId: characterQuotaRequests.userId,
        requestedQuota: characterQuotaRequests.requestedQuota,
        reason: characterQuotaRequests.reason,
        status: characterQuotaRequests.status,
        adminNote: characterQuotaRequests.adminNote,
        createdAt: characterQuotaRequests.createdAt,
        resolvedAt: characterQuotaRequests.resolvedAt,
        email: users.email,
        displayName: users.displayName,
        nickname: users.nickname,
      })
      .from(characterQuotaRequests)
      .innerJoin(users, eq(users.id, characterQuotaRequests.userId))
      .where(ne(characterQuotaRequests.status, "pending"))
      .orderBy(desc(characterQuotaRequests.resolvedAt))
      .limit(10),
  ]);

  return NextResponse.json({
    users: allUsers.map((u) => ({
      ...u,
      effectiveLimit: effectiveCharacterLimit({
        isAdmin: u.isAdmin,
        characterQuota: u.characterQuota,
      }),
    })),
    pendingRequests: pendingRows,
    recentResolved: resolvedRows,
  });
}
