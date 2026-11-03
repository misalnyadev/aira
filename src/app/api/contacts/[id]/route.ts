import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { characterContacts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { effectiveContactState } from "@/lib/contactPin";
import { ensureInitialContactGreeting } from "@/lib/contactsServer";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UNAUTHORIZED = {
  error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi.",
};

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });
  }

  const action = String((body as Record<string, unknown>).action ?? "");

  const [row] = await db
    .select()
    .from(characterContacts)
    .where(eq(characterContacts.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json(
      { error: "Data kontak tidak ditemukan." },
      { status: 404 }
    );
  }

  // Aksi dari Pengundang (batalkan / hapus dari daftar kontak sendiri)
  if (row.guestUserId === user.id && (action === "cancel" || action === "remove")) {
    if (row.ownerStatus === "blocked") {
      return NextResponse.json(
        { error: "Kontak ini tidak dapat diubah." },
        { status: 403 }
      );
    }
    await db
      .delete(characterContacts)
      .where(eq(characterContacts.id, row.id));
    return NextResponse.json({ ok: true, deleted: true });
  }

  // Aksi dari Pemilik Karakter
  if (row.ownerUserId !== user.id) {
    return NextResponse.json(
      { error: "Kamu tidak berhak mengubah kontak ini." },
      { status: 403 }
    );
  }

  if (action === "accept") {
    const nextAdminStatus = user.isAdmin ? "approved" : row.adminStatus;
    const [updated] = await db
      .update(characterContacts)
      .set({
        ownerStatus: "approved",
        adminStatus: nextAdminStatus,
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

  if (action === "reject") {
    const [updated] = await db
      .update(characterContacts)
      .set({ ownerStatus: "rejected", updatedAt: new Date() })
      .where(eq(characterContacts.id, row.id))
      .returning();
    return NextResponse.json({ contact: updated });
  }

  if (action === "block") {
    const [updated] = await db
      .update(characterContacts)
      .set({ ownerStatus: "blocked", updatedAt: new Date() })
      .where(eq(characterContacts.id, row.id))
      .returning();
    return NextResponse.json({ contact: updated });
  }

  if (action === "unblock") {
    const [updated] = await db
      .update(characterContacts)
      .set({ ownerStatus: "rejected", updatedAt: new Date() })
      .where(eq(characterContacts.id, row.id))
      .returning();
    return NextResponse.json({ contact: updated });
  }

  if (action === "toggle_ai") {
    const nextAi =
      typeof (body as Record<string, unknown>).aiAutoReply === "boolean"
        ? Boolean((body as Record<string, unknown>).aiAutoReply)
        : !row.aiAutoReply;

    const [updated] = await db
      .update(characterContacts)
      .set({ aiAutoReply: nextAi, updatedAt: new Date() })
      .where(eq(characterContacts.id, row.id))
      .returning();
    return NextResponse.json({ contact: updated });
  }

  return NextResponse.json(
    { error: "Aksi kontak tidak dikenali." },
    { status: 400 }
  );
}
