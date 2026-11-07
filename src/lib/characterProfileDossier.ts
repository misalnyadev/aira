import { validateCharacterSkillPortfolio, type CharacterSkill } from "./characterSkills";
import {
  MAX_BIBLE_CHARS,
  MAX_GREETING_CHARS,
  MAX_OWNER_RELATIONSHIP_CHARS,
  MAX_PERSONALITY_CHARS,
  MAX_SHARED_TEAM_MEMORY_CHARS,
  MAX_SHORT_BIO_CHARS,
  MAX_TEAM_ROLE_CHARS,
} from "./limits";

export type CharacterProfileDossier = {
  name?: string;
  shortBio?: string;
  greeting?: string;
  skillPortfolio?: CharacterSkill[];
  teamRole?: string;
  sharedTeamMemory?: string;
  ownerRelationship?: string;
  personality?: string;
  bible?: string;
};

export type CharacterProfileDossierResult =
  | { ok: true; data: CharacterProfileDossier }
  | { ok: false; error: string };

type OptionalTextResult =
  | { ok: true; present: false }
  | { ok: true; present: true; value: string }
  | { ok: false; error: string };

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function readOptionalText(
  record: Record<string, unknown>,
  key: string,
  label: string,
  maxChars: number
): OptionalTextResult {
  if (!hasOwn(record, key)) return { ok: true, present: false };
  if (typeof record[key] !== "string") {
    return { ok: false, error: `Bagian "${label}" harus berupa teks.` };
  }

  const value = (record[key] as string).trim();
  if (value.length > maxChars) {
    return {
      ok: false,
      error: `${label} maksimal ${maxChars.toLocaleString("id-ID")} karakter.`,
    };
  }
  return { ok: true, present: true, value };
}

/** Membaca satu file JSON dossier; field yang tidak ada dibiarkan apa adanya di formulir. */
export function parseCharacterProfileDossier(rawText: string): CharacterProfileDossierResult {
  const text = (rawText ?? "").replace(/^\uFEFF/, "").trim();
  if (!text) return { ok: false, error: "Berkas dossier kosong." };
  if (text.length > MAX_BIBLE_CHARS) {
    return {
      ok: false,
      error: `Dossier terlalu besar. Maksimal ${MAX_BIBLE_CHARS.toLocaleString("id-ID")} karakter.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON dossier tidak valid. Periksa tanda kutip dan koma." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Dossier harus berupa objek JSON, bukan daftar." };
  }

  const record = parsed as Record<string, unknown>;
  const data: CharacterProfileDossier = {};

  if (hasOwn(record, "name")) {
    if (typeof record.name !== "string" || !record.name.trim()) {
      return { ok: false, error: "Nama dossier harus berupa teks yang tidak kosong." };
    }
    data.name = record.name.trim();
  }

  const shortBio = readOptionalText(record, "shortBio", "Status singkat", MAX_SHORT_BIO_CHARS);
  if (!shortBio.ok) return { ok: false, error: shortBio.error };
  if (shortBio.present) data.shortBio = shortBio.value;

  const greeting = readOptionalText(record, "greeting", "Pesan pembuka", MAX_GREETING_CHARS);
  if (!greeting.ok) return { ok: false, error: greeting.error };
  if (greeting.present) data.greeting = greeting.value;

  if (hasOwn(record, "skillPortfolio")) {
    const skills = validateCharacterSkillPortfolio(record.skillPortfolio);
    if (!skills.ok) return { ok: false, error: skills.error };
    data.skillPortfolio = skills.skills;
  }

  const teamRole = readOptionalText(record, "teamRole", "Peran Tim 1", MAX_TEAM_ROLE_CHARS);
  if (!teamRole.ok) return { ok: false, error: teamRole.error };
  if (teamRole.present) data.teamRole = teamRole.value;

  const sharedTeamMemory = readOptionalText(
    record,
    "sharedTeamMemory",
    "Memori bersama Tim 1",
    MAX_SHARED_TEAM_MEMORY_CHARS
  );
  if (!sharedTeamMemory.ok) return { ok: false, error: sharedTeamMemory.error };
  if (sharedTeamMemory.present) data.sharedTeamMemory = sharedTeamMemory.value;

  const ownerRelationship = readOptionalText(
    record,
    "ownerRelationship",
    "Hubungan dengan pemilik",
    MAX_OWNER_RELATIONSHIP_CHARS
  );
  if (!ownerRelationship.ok) return { ok: false, error: ownerRelationship.error };
  if (ownerRelationship.present) data.ownerRelationship = ownerRelationship.value;

  const personality = readOptionalText(
    record,
    "personality",
    "Kepribadian & latar belakang",
    MAX_PERSONALITY_CHARS
  );
  if (!personality.ok) return { ok: false, error: personality.error };
  if (personality.present) data.personality = personality.value;

  const bible = readOptionalText(record, "bible", "Bible karakter", MAX_BIBLE_CHARS);
  if (!bible.ok) return { ok: false, error: bible.error };
  if (bible.present) data.bible = bible.value;

  const hasImportableField =
    hasOwn(record, "shortBio") ||
    hasOwn(record, "greeting") ||
    hasOwn(record, "skillPortfolio") ||
    hasOwn(record, "teamRole") ||
    hasOwn(record, "sharedTeamMemory") ||
    hasOwn(record, "ownerRelationship") ||
    hasOwn(record, "personality") ||
    hasOwn(record, "bible");
  if (!hasImportableField) {
    return {
      ok: false,
      error: "Dossier belum memuat field profil, tim, hubungan dengan pemilik, kepribadian, atau bible yang bisa diimpor.",
    };
  }

  return { ok: true, data };
}
