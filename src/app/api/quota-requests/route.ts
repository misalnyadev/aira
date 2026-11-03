import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterQuotaRequests } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { validateNewQuotaRequest } from "@/lib/quotaRules";

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
    request: latest ?? null,
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

  return NextResponse.json({ request: created }, { status: 201 });
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
