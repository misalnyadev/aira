import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { apiProviders, characters, users } from "@/db/schema";
import { AiProviderError, toUserFacingError } from "@/lib/ai";
import { characterNameError, cleanCharacterName, normalizeCharacterName } from "@/lib/characterNames";
import {
  isCharacterStarterArchetype,
  type CharacterStarterInput,
} from "@/lib/characterStarter";
import { ensureDb } from "@/lib/dbReady";
import { normalizeGender } from "@/lib/gender";
import {
  MAX_BIBLE_CHARS,
  MAX_CHARACTER_AGE,
  MAX_CHARACTER_ORIGIN_CHARS,
  MAX_CHARACTER_PROFESSION_CHARS,
  MAX_GREETING_CHARS,
  MAX_PERSONALITY_CHARS,
  MAX_SHORT_BIO_CHARS,
  MIN_CHARACTER_AGE,
} from "@/lib/limits";
import { validateCharacterSkillPortfolio } from "@/lib/characterSkills";
import { requireUser } from "@/lib/auth";
import { parseBackupKeys } from "@/lib/providerPool";
import {
  generateCharacterProfessionSuggestion,
  generateCharacterStarterDraft,
  pickProviderCandidates,
} from "@/lib/chatEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function textField(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length <= max ? text : null;
}

export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }
  const inputBody = body as Record<string, unknown>;
  if (!isCharacterStarterArchetype(inputBody.archetype)) {
    return NextResponse.json({ error: "Pilih gaya awal karakter yang tersedia." }, { status: 400 });
  }
  const rawFieldsToRegenerate = inputBody.fieldsToRegenerate;
  if (
    rawFieldsToRegenerate !== undefined &&
    (!Array.isArray(rawFieldsToRegenerate) || rawFieldsToRegenerate.some((field) => field !== "profession"))
  ) {
    return NextResponse.json({ error: "Field yang diminta untuk diperbarui AI tidak valid." }, { status: 400 });
  }
  const regenerateProfession = Array.isArray(rawFieldsToRegenerate) && rawFieldsToRegenerate.includes("profession");

  if (inputBody.name !== undefined && typeof inputBody.name !== "string") {
    return NextResponse.json({ error: "Nama karakter harus berupa teks." }, { status: 400 });
  }
  const name = cleanCharacterName(typeof inputBody.name === "string" ? inputBody.name : "");
  const nameProblem = name ? characterNameError(name) : null;
  if (nameProblem) return NextResponse.json({ error: nameProblem }, { status: 400 });

  const rawAge = inputBody.age;
  const age = rawAge === undefined || rawAge === null || rawAge === ""
    ? null
    : typeof rawAge === "number" ? rawAge : Number(String(rawAge).trim());
  if (age !== null && (!Number.isInteger(age) || age < MIN_CHARACTER_AGE || age > MAX_CHARACTER_AGE)) {
    return NextResponse.json({ error: `Usia karakter harus antara ${MIN_CHARACTER_AGE} dan ${MAX_CHARACTER_AGE}.` }, { status: 400 });
  }

  const gender = normalizeGender(inputBody.gender);
  if (gender === null) {
    return NextResponse.json({ error: "Pilih gender dari opsi yang tersedia." }, { status: 400 });
  }

  const origin = textField(inputBody.origin, MAX_CHARACTER_ORIGIN_CHARS);
  const profession = textField(inputBody.profession, MAX_CHARACTER_PROFESSION_CHARS);
  const shortBio = textField(inputBody.shortBio, MAX_SHORT_BIO_CHARS);
  const personality = textField(inputBody.personality, MAX_PERSONALITY_CHARS);
  const bible = textField(inputBody.bible, MAX_BIBLE_CHARS);
  const greeting = textField(inputBody.greeting, MAX_GREETING_CHARS);
  const concept = textField(inputBody.concept, 800);
  if ([origin, profession, shortBio, personality, bible, greeting, concept].some((value) => value === null)) {
    return NextResponse.json({ error: "Salah satu isian karakter terlalu panjang atau formatnya tidak valid." }, { status: 400 });
  }

  const skills = validateCharacterSkillPortfolio(inputBody.skillPortfolio ?? []);
  if (!skills.ok) return NextResponse.json({ error: skills.error }, { status: 400 });

  const excludeCharacterId = typeof inputBody.excludeCharacterId === "string"
    ? inputBody.excludeCharacterId
    : "";
  const existingRows = await db
    .select({ id: characters.id, name: characters.name })
    .from(characters)
    .where(
      excludeCharacterId
        ? and(eq(characters.userId, user.id), ne(characters.id, excludeCharacterId))
        : eq(characters.userId, user.id)
    );
  const existingNames = existingRows.map((row) => row.name);
  if (name && existingNames.some((existingName) => normalizeCharacterName(existingName) === normalizeCharacterName(name))) {
    return NextResponse.json({ error: `Nama “${name}” sudah dipakai karakter lain di akunmu.` }, { status: 409 });
  }

  const [account] = await db
    .select({ autoFallback: users.autoFallback })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const candidates = await pickProviderCandidates(user.id, null, account?.autoFallback ?? true);
  if (!candidates.some((provider) => Boolean(provider.apiKey.trim() || parseBackupKeys(provider.backupKeys, provider.apiKey).length))) {
    return NextResponse.json({ error: "Simpan API key provider terlebih dahulu agar AI bisa membuat draf." }, { status: 409 });
  }

  const starterInput: CharacterStarterInput = {
    archetype: inputBody.archetype,
    concept: concept!,
    name,
    age,
    gender,
    origin: origin!,
    profession: profession!,
    skillPortfolio: skills.skills,
    shortBio: shortBio!,
    personality: personality!,
    bible: bible!,
    greeting: greeting!,
  };

  try {
    if (regenerateProfession) {
      const professionSuggestion = await generateCharacterProfessionSuggestion({
        userId: user.id,
        candidates,
        input: starterInput,
      });
      return NextResponse.json({ draft: { profession: professionSuggestion } });
    }

    const draft = await generateCharacterStarterDraft({
      userId: user.id,
      candidates,
      input: starterInput,
      existingNames,
    });
    if (!name && existingNames.some((existingName) => normalizeCharacterName(existingName) === normalizeCharacterName(draft.name))) {
      return NextResponse.json({ error: "AI menyarankan nama yang sudah dipakai. Coba buat draf lagi atau isi nama lain." }, { status: 409 });
    }
    return NextResponse.json({ draft });
  } catch (error) {
    const fallbackMessage = regenerateProfession
      ? "Gagal membuat usulan profesi. Coba lagi."
      : "Gagal membuat draf karakter. Coba lagi.";
    const message = error instanceof AiProviderError
      ? error.message
      : toUserFacingError(error, fallbackMessage);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
