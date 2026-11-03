import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterQuotaRequests, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  appendQuotaDiscussionMessage,
  parseQuotaDiscussion,
  validateNewQuotaRequest,
} from "@/lib/quotaRules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UNAUTHORIZED = { error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." };

export async function GET() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const [latest] = await db
    .select()
    .from(characterQuotaRequests)
    .where(eq(characterQuotaRequests.userId, user.id))
    .orderBy(desc(characterQuotaRequests.createdAt))
    .limit(1);

  return NextResponse.json({
    request: latest
      ? {
          ...latest,
          discussion: parseQuotaDiscussion(latest.discussion),
        }
      : null,
    currentQuota: user.characterQuota,
    isAdmin: user.isAdmin,
  });
}

export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Data pengajuan tidak valid." }, { status: 400 });
  }

  const { addSlots, requestedQuota, reason } = body as {
    addSlots?: unknown;
    requestedQuota?: unknown;
    reason?: unknown;
  };

  const check = validateNewQuotaRequest({
    isAdmin: user.isAdmin,
    currentQuota: user.characterQuota,
    addSlots,
    requestedQuota,
    reason,
  });

  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  // Pastikan belum ada pengajuan yang masih pending supaya tidak menumpuk.
  const [existingPending] = await db
    .select({ id: characterQuotaRequests.id })
    .from(characterQuotaRequests)
    .where(
      and(
        eq(characterQuotaRequests.userId, user.id),
        eq(characterQuotaRequests.status, "pending")
      )
    )
    .limit(1);

  if (existingPending) {
    return NextResponse.json(
      {
        error:
          "Pengajuan slot sebelumnya masih menunggu persetujuan Admin. Tunggu keputusan Admin atau batalkan dulu pengajuan tersebut.",
      },
      { status: 409 }
    );
  }

  const [created] = await db
    .insert(characterQuotaRequests)
    .values({
      userId: user.id,
      requestedQuota: check.requestedQuota,
      reason: check.reason,
      status: "pending",
    })
    .returning();

  return NextResponse.json(
    {
      request: {
        ...created,
        discussion: parseQuotaDiscussion(created.discussion),
      },
    },
    { status: 201 }
  );
}

/**
 * PATCH /api/quota-requests
 * Member membalas pesan atau mengirim informasi tambahan pada pengajuan slot yang masih pending.
 */
export async function PATCH(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Pesan tidak valid." }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(characterQuotaRequests)
    .where(
      and(
        eq(characterQuotaRequests.userId, user.id),
        eq(characterQuotaRequests.status, "pending")
      )
    )
    .orderBy(desc(characterQuotaRequests.createdAt))
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      { error: "Tidak ada pengajuan slot yang sedang menunggu persetujuan." },
      { status: 404 }
    );
  }

  const [profile] = await db
    .select({
      displayName: users.displayName,
      nickname: users.nickname,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const senderName =
    profile?.displayName?.trim() ||
    profile?.nickname?.trim() ||
    profile?.email?.split("@")[0] ||
    user.email.split("@")[0] ||
    "Member";

  const appended = appendQuotaDiscussionMessage(existing.discussion, {
    id: randomUUID(),
    senderRole: "member",
    senderName,
    text: (body as { message?: unknown }).message,
  });

  if (!appended.ok) {
    return NextResponse.json({ error: appended.error }, { status: 400 });
  }

  await db
    .update(characterQuotaRequests)
    .set({ discussion: appended.serialized })
    .where(eq(characterQuotaRequests.id, existing.id));

  return NextResponse.json({
    ok: true,
    requestId: existing.id,
    message: appended.message,
    discussion: appended.next,
  });
}

export async function DELETE() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  await db
    .delete(characterQuotaRequests)
    .where(
      and(
        eq(characterQuotaRequests.userId, user.id),
        eq(characterQuotaRequests.status, "pending")
      )
    );

  return NextResponse.json({ ok: true });
}
