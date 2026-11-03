import { NextResponse } from "next/server";
import { and, asc, desc, eq, ne, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  characterContacts,
  characterQuotaRequests,
  characters,
  users,
} from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { getSignupCodeInfo } from "@/lib/inviteServer";
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

  const guestUsers = alias(users, "guest_users");
  const ownerUsers = alias(users, "owner_users");

  const [allUsers, pendingRows, resolvedRows, pendingContactRows, signupInvite] =
    await Promise.all([
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
    db
      .select({
        id: characterContacts.id,
        characterId: characterContacts.characterId,
        characterName: characters.name,
        characterPin: characters.invitePin,
        ownerUserId: characterContacts.ownerUserId,
        ownerEmail: ownerUsers.email,
        ownerDisplayName: ownerUsers.displayName,
        ownerNickname: ownerUsers.nickname,
        guestUserId: characterContacts.guestUserId,
        guestEmail: guestUsers.email,
        guestDisplayName: guestUsers.displayName,
        guestNickname: guestUsers.nickname,
        adminStatus: characterContacts.adminStatus,
        ownerStatus: characterContacts.ownerStatus,
        note: characterContacts.note,
        createdAt: characterContacts.createdAt,
      })
      .from(characterContacts)
      .innerJoin(characters, eq(characters.id, characterContacts.characterId))
      .innerJoin(ownerUsers, eq(ownerUsers.id, characterContacts.ownerUserId))
      .innerJoin(guestUsers, eq(guestUsers.id, characterContacts.guestUserId))
      .where(
        and(
          eq(characterContacts.adminStatus, "pending"),
          notInArray(characterContacts.ownerStatus, ["rejected", "blocked"])
        )
      )
      .orderBy(asc(characterContacts.createdAt)),
    getSignupCodeInfo(),
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
    pendingContacts: pendingContactRows,
    signupInvite,
  });
}
