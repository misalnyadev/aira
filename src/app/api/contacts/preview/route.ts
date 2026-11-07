import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterContacts, characters } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  effectiveContactState,
  isValidPinFormat,
  normalizePinInput,
} from "@/lib/contactPin";
import { withUploaderParam } from "@/lib/contactsServer";
import { ensureDb } from "@/lib/dbReady";
import { parseCharacterSkillPortfolio } from "@/lib/characterSkills";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UNAUTHORIZED = {
  error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi.",
};

export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });
  }

  const rawPin = (body as Record<string, unknown>).pin;
  const pin = normalizePinInput(typeof rawPin === "string" ? rawPin : "");
  if (!isValidPinFormat(pin)) {
    return NextResponse.json(
      { error: "Masukkan kode PIN karakter yang valid (6 karakter)." },
      { status: 400 }
    );
  }

  const [character] = await db
    .select({
      id: characters.id,
      ownerUserId: characters.userId,
      name: characters.name,
      avatarUrl: characters.avatarUrl,
      shortBio: characters.shortBio,
      skillPortfolio: characters.skillPortfolio,
    })
    .from(characters)
    .where(eq(characters.invitePin, pin))
    .limit(1);

  if (!character || !character.ownerUserId) {
    return NextResponse.json(
      { error: "Kode PIN karakter tidak ditemukan." },
      { status: 404 }
    );
  }
  if (character.ownerUserId === user.id) {
    return NextResponse.json({ error: "Karakter ini sudah milikmu sendiri." }, { status: 400 });
  }

  const [existingContact] = await db
    .select({
      adminStatus: characterContacts.adminStatus,
      ownerStatus: characterContacts.ownerStatus,
    })
    .from(characterContacts)
    .where(
      and(
        eq(characterContacts.characterId, character.id),
        eq(characterContacts.guestUserId, user.id)
      )
    )
    .limit(1);

  if (
    existingContact &&
    effectiveContactState(existingContact.adminStatus, existingContact.ownerStatus) === "blocked"
  ) {
    return NextResponse.json(
      { error: "Tidak dapat menambahkan kontak karakter ini." },
      { status: 403 }
    );
  }

  return NextResponse.json({
    preview: {
      characterName: character.name,
      characterAvatarUrl: withUploaderParam(character.avatarUrl, character.ownerUserId),
      characterShortBio: character.shortBio,
      skillPortfolio: parseCharacterSkillPortfolio(character.skillPortfolio),
    },
  });
}
