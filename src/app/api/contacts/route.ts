import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { characterContacts, characters, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  effectiveContactState,
  isValidPinFormat,
  normalizePinInput,
} from "@/lib/contactPin";
import { withUploaderParam } from "@/lib/contactsServer";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UNAUTHORIZED = {
  error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi.",
};

export async function GET() {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const guestUsers = alias(users, "guest_users");
  const ownerUsers = alias(users, "owner_users");

  const [incomingRows, outgoingRows] = await Promise.all([
    db
      .select({
        id: characterContacts.id,
        characterId: characterContacts.characterId,
        characterName: characters.name,
        characterAvatarUrl: characters.avatarUrl,
        guestUserId: characterContacts.guestUserId,
        guestDisplayName: guestUsers.displayName,
        guestNickname: guestUsers.nickname,
        guestEmail: guestUsers.email,
        guestAvatarUrl: guestUsers.avatarUrl,
        adminStatus: characterContacts.adminStatus,
        ownerStatus: characterContacts.ownerStatus,
        aiAutoReply: characterContacts.aiAutoReply,
        note: characterContacts.note,
        createdAt: characterContacts.createdAt,
        updatedAt: characterContacts.updatedAt,
      })
      .from(characterContacts)
      .innerJoin(characters, eq(characters.id, characterContacts.characterId))
      .innerJoin(guestUsers, eq(guestUsers.id, characterContacts.guestUserId))
      .where(eq(characterContacts.ownerUserId, user.id))
      .orderBy(desc(characterContacts.updatedAt)),
    db
      .select({
        id: characterContacts.id,
        characterId: characterContacts.characterId,
        characterName: characters.name,
        characterAvatarUrl: characters.avatarUrl,
        characterShortBio: characters.shortBio,
        ownerUserId: characterContacts.ownerUserId,
        ownerDisplayName: ownerUsers.displayName,
        ownerNickname: ownerUsers.nickname,
        ownerEmail: ownerUsers.email,
        adminStatus: characterContacts.adminStatus,
        ownerStatus: characterContacts.ownerStatus,
        aiAutoReply: characterContacts.aiAutoReply,
        note: characterContacts.note,
        createdAt: characterContacts.createdAt,
        updatedAt: characterContacts.updatedAt,
      })
      .from(characterContacts)
      .innerJoin(characters, eq(characters.id, characterContacts.characterId))
      .innerJoin(ownerUsers, eq(ownerUsers.id, characterContacts.ownerUserId))
      .where(eq(characterContacts.guestUserId, user.id))
      .orderBy(desc(characterContacts.updatedAt)),
  ]);

  return NextResponse.json({
    incoming: incomingRows.map((r) => ({
      id: r.id,
      characterId: r.characterId,
      characterName: r.characterName,
      characterAvatarUrl: r.characterAvatarUrl,
      guestUserId: r.guestUserId,
      guestName:
        r.guestDisplayName ||
        r.guestNickname ||
        r.guestEmail.split("@")[0],
      guestEmail: r.guestEmail,
      guestAvatarUrl: withUploaderParam(r.guestAvatarUrl, r.guestUserId),
      adminStatus: r.adminStatus,
      ownerStatus: r.ownerStatus,
      aiAutoReply: Boolean(r.aiAutoReply),
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    outgoing: outgoingRows.map((r) => ({
      id: r.id,
      characterId: r.characterId,
      characterName: r.characterName,
      characterAvatarUrl: withUploaderParam(
        r.characterAvatarUrl,
        r.ownerUserId
      ),
      characterShortBio: r.characterShortBio,
      ownerUserId: r.ownerUserId,
      ownerName:
        r.ownerDisplayName ||
        r.ownerNickname ||
        r.ownerEmail.split("@")[0],
      adminStatus: r.adminStatus,
      ownerStatus: r.ownerStatus,
      aiAutoReply: Boolean(r.aiAutoReply),
      note: r.note,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });
  }

  const pin = normalizePinInput((body as Record<string, unknown>).pin as string);
  const noteRaw =
    typeof (body as Record<string, unknown>).note === "string"
      ? ((body as Record<string, unknown>).note as string).trim().slice(0, 240)
      : "";

  if (!isValidPinFormat(pin)) {
    return NextResponse.json(
      { error: "Masukkan kode PIN karakter yang valid (6 karakter)." },
      { status: 400 }
    );
  }

  const [targetChar] = await db
    .select({
      id: characters.id,
      userId: characters.userId,
      name: characters.name,
    })
    .from(characters)
    .where(eq(characters.invitePin, pin))
    .limit(1);

  if (!targetChar || !targetChar.userId) {
    return NextResponse.json(
      { error: "Kode PIN karakter tidak ditemukan." },
      { status: 404 }
    );
  }

  if (targetChar.userId === user.id) {
    return NextResponse.json(
      { error: "Karakter ini sudah milikmu sendiri." },
      { status: 400 }
    );
  }

  const [existing] = await db
    .select()
    .from(characterContacts)
    .where(
      and(
        eq(characterContacts.characterId, targetChar.id),
        eq(characterContacts.guestUserId, user.id)
      )
    )
    .limit(1);

  const initialAdminStatus = user.isAdmin ? "approved" : "pending";

  if (existing) {
    const state = effectiveContactState(
      existing.adminStatus,
      existing.ownerStatus
    );

    if (state === "blocked") {
      return NextResponse.json(
        { error: "Tidak dapat menambahkan kontak karakter ini." },
        { status: 403 }
      );
    }

    if (state === "active") {
      return NextResponse.json(
        { error: `Kontak ${targetChar.name} sudah aktif di daftar kontakmu.` },
        { status: 409 }
      );
    }

    if (state !== "rejected") {
      return NextResponse.json(
        {
          error: `Undangan untuk ${targetChar.name} sudah terkirim dan sedang menunggu persetujuan.`,
        },
        { status: 409 }
      );
    }

    // Jika sebelumnya sempat ditolak (bukan diblokir), izinkan ajukan ulang.
    const [updated] = await db
      .update(characterContacts)
      .set({
        adminStatus: initialAdminStatus,
        ownerStatus: "pending",
        note: noteRaw,
        updatedAt: new Date(),
      })
      .where(eq(characterContacts.id, existing.id))
      .returning();

    return NextResponse.json({
      contact: updated,
      characterName: targetChar.name,
    });
  }

  const [created] = await db
    .insert(characterContacts)
    .values({
      characterId: targetChar.id,
      ownerUserId: targetChar.userId,
      guestUserId: user.id,
      adminStatus: initialAdminStatus,
      ownerStatus: "pending",
      note: noteRaw,
    })
    .returning();

  return NextResponse.json(
    {
      contact: created,
      characterName: targetChar.name,
    },
    { status: 201 }
  );
}
