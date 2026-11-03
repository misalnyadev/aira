import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { characterContacts } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { effectiveContactState } from "@/lib/contactPin";
import { ensureInitialContactGreeting } from "@/lib/contactsServer";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FORBIDDEN = { error: "Hanya Admin yang dapat memproses kontak ini." };

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
    return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });
  }

  const action = String((body as Record<string, unknown>).action ?? "");
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Aksi tidak valid." }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(characterContacts)
    .where(eq(characterContacts.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json(
      { error: "Permintaan kontak tidak ditemukan." },
      { status: 404 }
    );
  }

  if (action === "approve") {
    // Jika karakter yang diundang kebetulan milik Admin ini sendiri,
    // persetujuan Admin sekaligus menyetujui sisi pemilik (1 klik langsung aktif).
    const nextOwnerStatus =
      row.ownerUserId === admin.id && row.ownerStatus === "pending"
        ? "approved"
        : row.ownerStatus;

    const [updated] = await db
      .update(characterContacts)
      .set({
        adminStatus: "approved",
        ownerStatus: nextOwnerStatus,
        updatedAt: new Date(),
      })
      .where(eq(characterContacts.id, row.id))
      .returning();

    if (
      updated &&
      effectiveContactState(updated.adminStatus, updated.ownerStatus) ===
        "active"
    ) {
      await ensureInitialContactGreeting(updated.id, updated.characterId);
    }

    return NextResponse.json({ contact: updated });
  }

  const [updated] = await db
    .update(characterContacts)
    .set({
      adminStatus: "rejected",
      updatedAt: new Date(),
    })
    .where(eq(characterContacts.id, row.id))
    .returning();

  return NextResponse.json({ contact: updated });
}
