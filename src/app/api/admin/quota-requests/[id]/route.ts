import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { characterQuotaRequests, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  appendQuotaDiscussionMessage,
  cleanAdminNote,
  normalizeQuotaValue,
  parseQuotaDiscussion,
} from "@/lib/quotaRules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORBIDDEN = { error: "Hanya Admin yang dapat memproses pengajuan kuota." };

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  await ensureDb();

  const admin = await requireAdmin();
  if (!admin) return NextResponse.json(FORBIDDEN, { status: 403 });

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Data keputusan tidak valid." }, { status: 400 });
  }

  const { action, approvedQuota, adminNote, message } = body as {
    action?: unknown;
    approvedQuota?: unknown;
    adminNote?: unknown;
    message?: unknown;
  };

  if (action !== "approve" && action !== "reject" && action !== "message") {
    return NextResponse.json(
      { error: "Pilih tindakan Kirim Pesan, Setujui, atau Tolak." },
      { status: 400 }
    );
  }

  const [existing] = await db
    .select()
    .from(characterQuotaRequests)
    .where(eq(characterQuotaRequests.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      { error: "Pengajuan kuota tidak ditemukan." },
      { status: 404 }
    );
  }

  if (action === "message") {
    if (existing.status !== "pending") {
      return NextResponse.json(
        { error: "Pengajuan ini sudah selesai diproses." },
        { status: 409 }
      );
    }

    const [adminProfile] = await db
      .select({
        displayName: users.displayName,
        nickname: users.nickname,
      })
      .from(users)
      .where(eq(users.id, admin.id))
      .limit(1);

    const adminName = adminProfile?.displayName?.trim()
      ? `Admin (${adminProfile.displayName.trim()})`
      : adminProfile?.nickname?.trim()
        ? `Admin (${adminProfile.nickname.trim()})`
        : "Admin";

    const appended = appendQuotaDiscussionMessage(existing.discussion, {
      id: randomUUID(),
      senderRole: "admin",
      senderName: adminName,
      text: message,
    });

    if (!appended.ok) {
      return NextResponse.json({ error: appended.error }, { status: 400 });
    }

    await db
      .update(characterQuotaRequests)
      .set({ discussion: appended.serialized })
      .where(eq(characterQuotaRequests.id, id));

    return NextResponse.json({
      ok: true,
      id,
      message: appended.message,
      discussion: appended.next,
    });
  }

  const note = cleanAdminNote(adminNote);
  const now = new Date();

  if (action === "approve") {
    const finalQuota = normalizeQuotaValue(
      approvedQuota ?? existing.requestedQuota,
      existing.requestedQuota
    );

    await db
      .update(users)
      .set({ characterQuota: finalQuota })
      .where(eq(users.id, existing.userId));

    const [updatedReq] = await db
      .update(characterQuotaRequests)
      .set({
        status: "approved",
        requestedQuota: finalQuota,
        adminNote: note,
        resolvedAt: now,
      })
      .where(eq(characterQuotaRequests.id, id))
      .returning();

    return NextResponse.json({
      ok: true,
      request: {
        ...updatedReq,
        discussion: parseQuotaDiscussion(updatedReq.discussion),
      },
      appliedQuota: finalQuota,
    });
  }

  const [updatedReq] = await db
    .update(characterQuotaRequests)
    .set({
      status: "rejected",
      adminNote: note,
      resolvedAt: now,
    })
    .where(eq(characterQuotaRequests.id, id))
    .returning();

  return NextResponse.json({
    ok: true,
    request: {
      ...updatedReq,
      discussion: parseQuotaDiscussion(updatedReq.discussion),
    },
  });
}
