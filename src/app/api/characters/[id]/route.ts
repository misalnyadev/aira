import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters, messages } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { normalizeBubbleStyle, parseBubbleStyle } from "@/lib/bubbleStyle";
import {
  collectMediaKeys,
  normalizeCharacterMedia,
  parseCharacterMedia,
} from "@/lib/characterMedia";
import { normalizeChatBackground, parseChatBackground } from "@/lib/chatBackground";
import { ensureDb } from "@/lib/dbReady";
import { normalizeGender } from "@/lib/gender";
import { normalizeCharacterStoryFrequency, parseCharacterStoryFrequency } from "@/lib/characterStoryAuto";
import { normalizeOwnerProfileShareFields, parseOwnerProfileShareFields } from "@/lib/characterInvite";
import {
  parseCharacterSkillPortfolio,
  validateCharacterSkillPortfolio,
} from "@/lib/characterSkills";
import { normalizeCharacterVoice, parseCharacterVoice } from "@/lib/hdVoice";
import {
  MAX_BIBLE_CHARS,
  MAX_CHARACTER_AGE,
  MAX_CHARACTER_ORIGIN_CHARS,
  MAX_CHARACTER_PROFESSION_CHARS,
  MIN_CHARACTER_AGE,
  MAX_GREETING_CHARS,
  MAX_MEMORY_SUMMARY_CHARS,
  MAX_OWNER_RELATIONSHIP_CHARS,
  MAX_PERSONALITY_CHARS,
  MAX_SHORT_BIO_CHARS,
  MAX_SHARED_TEAM_MEMORY_CHARS,
  MAX_TEAM_ROLE_CHARS,
} from "@/lib/limits";
import { findOwnedCharacter } from "@/lib/owned";
import { deleteR2Object } from "@/lib/r2";
import { removeStoredImages } from "@/lib/uploads";
import {
  characterNameError,
  cleanCharacterName,
  isCharacterNameUniqueViolation,
  normalizeCharacterName,
} from "@/lib/characterNames";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." };
const NOT_FOUND = { error: "Karakter tidak ditemukan." };

function serializeDetail(row: typeof characters.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    gender: normalizeGender(row.gender) ?? "",
    age: row.age,
    origin: row.origin,
    profession: row.profession,
    avatarUrl: row.avatarUrl,
    shortBio: row.shortBio,
    skillPortfolio: parseCharacterSkillPortfolio(row.skillPortfolio),
    personality: row.personality,
    bible: row.bible,
    ownerRelationship: row.ownerRelationship,
    greeting: row.greeting,
    providerId: row.providerId,
    model: row.model,
    chatBackground: parseChatBackground(row.chatBackground),
    meetupBackground: parseChatBackground(row.meetupBackground),
    bubbleStyle: parseBubbleStyle(row.bubbleStyle),
    meetupBubbleStyle: parseBubbleStyle(row.meetupBubbleStyle),
    media: parseCharacterMedia(row.media),
    voiceConfig: parseCharacterVoice(row.voiceConfig),
    memoryEnabled: Boolean(row.memoryEnabled),
    teamRole: row.teamRole,
    sharedTeamMemory: row.sharedTeamMemory,
    shareTeamMemory: Boolean(row.shareTeamMemory),
    shareOwnerProfileFields: parseOwnerProfileShareFields(row.shareOwnerProfileFields),
    memorySummary: row.memorySummary ?? "",
    memoryUpdatedAt: row.memoryUpdatedAt ? row.memoryUpdatedAt.toISOString() : null,
    browsingEnabled: Boolean(row.browsingEnabled),
    proactiveEnabled: Boolean(row.proactiveEnabled),
    storyAutoEnabled: Boolean(row.storyAutoEnabled),
    storyAutoFrequency: normalizeCharacterStoryFrequency(row.storyAutoFrequency),
    storyAutoLastAttemptAt: row.storyAutoLastAttemptAt?.toISOString() ?? null,
    invitePin: row.invitePin ?? null,
  };
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await context.params;
  const row = await findOwnedCharacter(id, user.id);
  if (!row) return NextResponse.json(NOT_FOUND, { status: 404 });

  return NextResponse.json({ character: serializeDetail(row) });
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const {
    name,
    gender,
    age,
    origin,
    profession,
    avatarUrl,
    shortBio,
    skillPortfolio,
    personality,
    greeting,
    bible,
    ownerRelationship,
    providerId,
    model,
    chatBackground,
    meetupBackground,
    bubbleStyle,
    meetupBubbleStyle,
    media,
    voiceConfig,
    memoryEnabled,
    memorySummary,
    teamRole,
    sharedTeamMemory,
    shareTeamMemory,
    shareOwnerProfileFields,
    browsingEnabled,
    proactiveEnabled,
    storyAutoEnabled,
    storyAutoFrequency,
  } = body as {
    name?: string;
    gender?: unknown;
    age?: unknown;
    origin?: unknown;
    profession?: unknown;
    avatarUrl?: string | null;
    shortBio?: string;
    skillPortfolio?: unknown;
    personality?: string;
    greeting?: string;
    bible?: string;
    ownerRelationship?: unknown;
    providerId?: string | null;
    model?: string | null;
    chatBackground?: unknown | null;
    meetupBackground?: unknown | null;
    bubbleStyle?: unknown | null;
    meetupBubbleStyle?: unknown | null;
    media?: unknown | null;
    voiceConfig?: unknown | null;
    memoryEnabled?: boolean;
    memorySummary?: string;
    teamRole?: string;
    sharedTeamMemory?: string;
    shareTeamMemory?: boolean;
    shareOwnerProfileFields?: unknown;
    browsingEnabled?: boolean;
    proactiveEnabled?: boolean;
    storyAutoEnabled?: unknown;
    storyAutoFrequency?: unknown;
  };

  let normalizedAge: number | null | undefined;
  if (age !== undefined) {
    if (age === null || (typeof age === "string" && !age.trim())) {
      normalizedAge = null;
    } else if (typeof age === "number") {
      normalizedAge = age;
    } else if (typeof age === "string") {
      normalizedAge = Number(age.trim());
    } else {
      return NextResponse.json({ error: "Usia karakter harus berupa angka." }, { status: 400 });
    }
    if (
      normalizedAge !== null &&
      (!Number.isInteger(normalizedAge) || normalizedAge < MIN_CHARACTER_AGE || normalizedAge > MAX_CHARACTER_AGE)
    ) {
      return NextResponse.json({ error: `Usia karakter harus antara ${MIN_CHARACTER_AGE} dan ${MAX_CHARACTER_AGE}.` }, { status: 400 });
    }
  }
  if (origin !== undefined && typeof origin !== "string") {
    return NextResponse.json({ error: "Asal karakter harus berupa teks." }, { status: 400 });
  }
  if (profession !== undefined && typeof profession !== "string") {
    return NextResponse.json({ error: "Profesi karakter harus berupa teks." }, { status: 400 });
  }
  if (typeof origin === "string" && origin.trim().length > MAX_CHARACTER_ORIGIN_CHARS) {
    return NextResponse.json({ error: `Asal karakter maksimal ${MAX_CHARACTER_ORIGIN_CHARS} karakter.` }, { status: 400 });
  }
  if (typeof profession === "string" && profession.trim().length > MAX_CHARACTER_PROFESSION_CHARS) {
    return NextResponse.json({ error: `Profesi karakter maksimal ${MAX_CHARACTER_PROFESSION_CHARS} karakter.` }, { status: 400 });
  }
  if (personality !== undefined && personality.trim().length > MAX_PERSONALITY_CHARS) {
    return NextResponse.json(
      { error: `Kepribadian maksimal ${MAX_PERSONALITY_CHARS.toLocaleString("id-ID")} karakter.` },
      { status: 400 }
    );
  }
  if (greeting !== undefined && greeting.trim().length > MAX_GREETING_CHARS) {
    return NextResponse.json(
      { error: `Pesan pembuka maksimal ${MAX_GREETING_CHARS} karakter.` },
      { status: 400 }
    );
  }
  if (shortBio !== undefined && shortBio.trim().length > MAX_SHORT_BIO_CHARS) {
    return NextResponse.json(
      { error: `Status singkat maksimal ${MAX_SHORT_BIO_CHARS} karakter.` },
      { status: 400 }
    );
  }
  if (teamRole !== undefined && teamRole.trim().length > MAX_TEAM_ROLE_CHARS) {
    return NextResponse.json(
      { error: `Peran Tim 1 maksimal ${MAX_TEAM_ROLE_CHARS} karakter.` },
      { status: 400 }
    );
  }
  if (
    sharedTeamMemory !== undefined &&
    sharedTeamMemory.trim().length > MAX_SHARED_TEAM_MEMORY_CHARS
  ) {
    return NextResponse.json(
      { error: `Catatan Tim 1 maksimal ${MAX_SHARED_TEAM_MEMORY_CHARS.toLocaleString("id-ID")} karakter.` },
      { status: 400 }
    );
  }
  if (ownerRelationship !== undefined && typeof ownerRelationship !== "string") {
    return NextResponse.json(
      { error: "Hubungan dengan pemilik harus berupa teks." },
      { status: 400 }
    );
  }
  if (
    typeof ownerRelationship === "string" &&
    ownerRelationship.trim().length > MAX_OWNER_RELATIONSHIP_CHARS
  ) {
    return NextResponse.json(
      { error: `Hubungan dengan pemilik maksimal ${MAX_OWNER_RELATIONSHIP_CHARS.toLocaleString("id-ID")} karakter.` },
      { status: 400 }
    );
  }
  if (shareOwnerProfileFields !== undefined && !Array.isArray(shareOwnerProfileFields)) {
    return NextResponse.json(
      { error: "Daftar info pemilik yang dibagikan tidak valid." },
      { status: 400 }
    );
  }
  const skillValidation =
    skillPortfolio === undefined ? null : validateCharacterSkillPortfolio(skillPortfolio);
  if (skillValidation && !skillValidation.ok) {
    return NextResponse.json({ error: skillValidation.error }, { status: 400 });
  }
  if (bible !== undefined && bible.trim().length > MAX_BIBLE_CHARS) {
    return NextResponse.json(
      { error: `Bible maksimal ${MAX_BIBLE_CHARS.toLocaleString("id-ID")} karakter.` },
      { status: 400 }
    );
  }
  if (
    typeof memorySummary === "string" &&
    memorySummary.trim().length > MAX_MEMORY_SUMMARY_CHARS
  ) {
    return NextResponse.json(
      {
        error: `Buku Ingatan maksimal ${MAX_MEMORY_SUMMARY_CHARS.toLocaleString("id-ID")} karakter.`,
      },
      { status: 400 }
    );
  }

  const updates: Partial<typeof characters.$inferInsert> = { updatedAt: new Date() };
  let requestedName: string | undefined;
  if (name !== undefined) {
    if (typeof name !== "string") {
      return NextResponse.json({ error: "Nama karakter harus berupa teks." }, { status: 400 });
    }
    const normalizedName = cleanCharacterName(name);
    const nameError = characterNameError(normalizedName);
    if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
    requestedName = normalizedName;
    updates.name = normalizedName;
  }
  if (gender !== undefined) {
    const normalizedGender = normalizeGender(gender);
    if (normalizedGender === null) {
      return NextResponse.json({ error: "Pilih jenis kelamin/gender dari opsi yang tersedia." }, { status: 400 });
    }
    updates.gender = normalizedGender;
  }
  if (age !== undefined) updates.age = normalizedAge ?? null;
  if (origin !== undefined) updates.origin = origin.trim();
  if (profession !== undefined) updates.profession = profession.trim();
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl || null;
  if (shortBio !== undefined) updates.shortBio = shortBio.trim();
  if (skillValidation?.ok) updates.skillPortfolio = JSON.stringify(skillValidation.skills);
  if (personality !== undefined) updates.personality = personality.trim();
  if (teamRole !== undefined) updates.teamRole = teamRole.trim();
  if (sharedTeamMemory !== undefined) updates.sharedTeamMemory = sharedTeamMemory.trim();
  if (typeof shareTeamMemory === "boolean") updates.shareTeamMemory = shareTeamMemory;
  if (shareOwnerProfileFields !== undefined) {
    updates.shareOwnerProfileFields = JSON.stringify(
      normalizeOwnerProfileShareFields(shareOwnerProfileFields)
    );
  }
  if (greeting !== undefined) updates.greeting = greeting.trim();
  if (bible !== undefined) updates.bible = bible.trim();
  if (typeof ownerRelationship === "string") {
    updates.ownerRelationship = ownerRelationship.trim();
  }
  if (providerId !== undefined) updates.providerId = providerId || null;
  if (model !== undefined) updates.model = model?.trim() || null;
  if ("chatBackground" in body) {
    updates.chatBackground = JSON.stringify(normalizeChatBackground(chatBackground));
  }
  if ("meetupBackground" in body) {
    updates.meetupBackground = JSON.stringify(normalizeChatBackground(meetupBackground));
  }
  if ("bubbleStyle" in body) {
    updates.bubbleStyle = JSON.stringify(normalizeBubbleStyle(bubbleStyle));
  }
  if ("meetupBubbleStyle" in body) {
    updates.meetupBubbleStyle = JSON.stringify(normalizeBubbleStyle(meetupBubbleStyle));
  }
  if ("media" in body) {
    const cleaned = media === null ? null : normalizeCharacterMedia(media, user.id);
    updates.media = cleaned ? JSON.stringify(cleaned) : null;
  }
  if ("voiceConfig" in body) {
    const cleaned = voiceConfig === null ? null : normalizeCharacterVoice(voiceConfig);
    updates.voiceConfig = cleaned ? JSON.stringify(cleaned) : null;
  }
  if (typeof memoryEnabled === "boolean") {
    updates.memoryEnabled = memoryEnabled;
  }
  if (typeof browsingEnabled === "boolean") {
    updates.browsingEnabled = browsingEnabled;
  }
  if (typeof proactiveEnabled === "boolean") {
    updates.proactiveEnabled = proactiveEnabled;
  }
  if (storyAutoEnabled !== undefined && typeof storyAutoEnabled !== "boolean") {
    return NextResponse.json({ error: "Status otomatis harus bernilai aktif atau nonaktif." }, { status: 400 });
  }
  if (typeof storyAutoEnabled === "boolean") {
    updates.storyAutoEnabled = storyAutoEnabled;
  }
  if (storyAutoFrequency !== undefined) {
    const normalizedFrequency = parseCharacterStoryFrequency(storyAutoFrequency);
    if (!normalizedFrequency) {
      return NextResponse.json({ error: "Frekuensi Story otomatis tidak valid." }, { status: 400 });
    }
    updates.storyAutoFrequency = normalizedFrequency;
  }
  if (typeof memorySummary === "string") {
    const trimmed = memorySummary.trim();
    updates.memorySummary = trimmed;
    updates.memoryUpdatedAt = trimmed ? new Date() : null;
    if (!trimmed) updates.memoryThroughAt = null;
  }

  /*
   * Kepemilikan diperiksa DI DALAM klausa WHERE, bukan setelah UPDATE.
   * Kalau diperiksa sesudahnya, baris milik orang lain sudah terlanjur
   * berubah — dan tidak ada cara mengembalikannya.
   */
  let row: typeof characters.$inferSelect | undefined;
  try {
    if (requestedName !== undefined) {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('aira:character-name'), hashtext(${user.id}))`);
        const [current] = await tx
          .select({ name: characters.name })
          .from(characters)
          .where(and(eq(characters.id, id), eq(characters.userId, user.id)))
          .limit(1);
        if (!current) return { kind: "not_found" as const };

        if (normalizeCharacterName(current.name) !== normalizeCharacterName(requestedName)) {
          const otherNames = await tx
            .select({ name: characters.name })
            .from(characters)
            .where(and(eq(characters.userId, user.id), ne(characters.id, id)));
          if (otherNames.some((ownerRow) => normalizeCharacterName(ownerRow.name) === normalizeCharacterName(requestedName))) {
            return { kind: "duplicate" as const };
          }
        }

        const [updatedRow] = await tx
          .update(characters)
          .set(updates)
          .where(and(eq(characters.id, id), eq(characters.userId, user.id)))
          .returning();
        return updatedRow
          ? { kind: "updated" as const, row: updatedRow }
          : { kind: "not_found" as const };
      });
      if (result.kind === "duplicate") {
        return NextResponse.json({ error: `Nama “${requestedName}” sudah dipakai karakter lain di akunmu.` }, { status: 409 });
      }
      if (result.kind === "not_found") return NextResponse.json(NOT_FOUND, { status: 404 });
      row = result.row;
    } else {
      [row] = await db
        .update(characters)
        .set(updates)
        .where(and(eq(characters.id, id), eq(characters.userId, user.id)))
        .returning();
    }
  } catch (error) {
    if (isCharacterNameUniqueViolation(error)) {
      return NextResponse.json({ error: "Nama karakter sudah dipakai karakter lain di akunmu." }, { status: 409 });
    }
    throw error;
  }

  if (!row) return NextResponse.json(NOT_FOUND, { status: 404 });

  return NextResponse.json({ character: serializeDetail(row) });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await context.params;
  const owned = await findOwnedCharacter(id, user.id);
  if (!owned) return NextResponse.json(NOT_FOUND, { status: 404 });

  const mediaKeys = collectMediaKeys(parseCharacterMedia(owned.media));
  const msgImages = await db
    .select({ imageUrl: messages.imageUrl })
    .from(messages)
    .where(eq(messages.characterId, id));

  await db.delete(characters).where(eq(characters.id, id));
  if (mediaKeys.length > 0) {
    await Promise.allSettled(mediaKeys.map((key) => deleteR2Object(key)));
  }
  await removeStoredImages(
    [owned.avatarUrl, ...msgImages.map((m) => m.imageUrl)],
    user.id
  );
  return NextResponse.json({ ok: true });
}
