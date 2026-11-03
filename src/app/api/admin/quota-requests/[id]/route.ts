import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { characterQuotaRequests, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { cleanAdminNote, normalizeQuotaValue } from "@/lib/quotaRules";

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

  const { action, approvedQuota, adminNote } = body as {
    action?: unknown;
    approvedQuota?: unknown;
    adminNote?: unknown;
  };

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: "Pilih tindakan Setujui atau Tolak." },
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
      request: updatedReq,
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

  return NextResponse.json({ ok: true, request: updatedReq });
}
