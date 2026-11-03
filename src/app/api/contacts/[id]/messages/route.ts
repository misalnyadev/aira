import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterContacts, contactMessages } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { effectiveContactState } from "@/lib/contactPin";
import { serializeContactMessageForViewer } from "@/lib/contactsServer";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const { id } = await context.params;
  const [contact] = await db
    .select()
    .from(characterContacts)
    .where(eq(characterContacts.id, id))
    .limit(1);

  if (
    !contact ||
    effectiveContactState(contact.adminStatus, contact.ownerStatus) !==
      "active" ||
    (contact.guestUserId !== user.id && contact.ownerUserId !== user.id)
  ) {
    return NextResponse.json(
      { error: "Kontak obrolan tidak ditemukan atau belum aktif." },
      { status: 404 }
    );
  }

  const viewerRole = contact.guestUserId === user.id ? "guest" : "owner";
  const rows = await db
    .select()
    .from(contactMessages)
    .where(eq(contactMessages.contactId, contact.id))
    .orderBy(asc(contactMessages.createdAt));

  return NextResponse.json({
    messages: rows.map((r) =>
      serializeContactMessageForViewer(r, viewerRole, {
        ownerUserId: contact.ownerUserId,
        guestUserId: contact.guestUserId,
      })
    ),
    aiAutoReply: Boolean(contact.aiAutoReply),
  });
}
