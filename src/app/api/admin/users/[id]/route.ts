import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterQuotaRequests, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { normalizeQuotaValue } from "@/lib/quotaRules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORBIDDEN = { error: "Hanya Admin yang dapat mengelola pengguna." };

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
    return NextResponse.json({ error: "Data pembaruan tidak valid." }, { status: 400 });
  }

  const { characterQuota, isAdmin } = body as {
    characterQuota?: unknown;
    isAdmin?: unknown;
  };

  if (id === admin.id && isAdmin === false) {
    return NextResponse.json(
      { error: "Kamu tidak bisa mencopot status Admin dari akunmu sendiri." },
      { status: 400 }
    );
  }

  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (!targetUser) {
    return NextResponse.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });
  }

  const nextIsAdmin =
    typeof isAdmin === "boolean" ? isAdmin : targetUser.isAdmin;
  const nextQuota =
    characterQuota !== undefined
      ? normalizeQuotaValue(characterQuota, targetUser.characterQuota)
      : nextIsAdmin
        ? Math.max(50, targetUser.characterQuota)
        : targetUser.characterQuota;

  const [updated] = await db
    .update(users)
    .set({
      isAdmin: nextIsAdmin,
      characterQuota: nextQuota,
    })
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      email: users.email,
      isAdmin: users.isAdmin,
      characterQuota: users.characterQuota,
    });

  // Jika kuota baru memenuhi atau melampaui pengajuan pending user tersebut, selesaikan otomatis.
  if (characterQuota !== undefined) {
    const [pending] = await db
      .select()
      .from(characterQuotaRequests)
      .where(
        and(
          eq(characterQuotaRequests.userId, id),
          eq(characterQuotaRequests.status, "pending")
        )
      )
      .limit(1);

    if (pending && nextQuota >= pending.requestedQuota) {
      await db
        .update(characterQuotaRequests)
        .set({
          status: "approved",
          requestedQuota: nextQuota,
          adminNote: "Kuota diperbarui langsung oleh Admin.",
          resolvedAt: new Date(),
        })
        .where(eq(characterQuotaRequests.id, pending.id));
    }
  }

  return NextResponse.json({ ok: true, user: updated });
}
