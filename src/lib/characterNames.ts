import { MAX_CHARACTER_NAME_CHARS } from "@/lib/limits";

export function cleanCharacterName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function normalizeCharacterName(value: string): string {
  return cleanCharacterName(value).toLocaleLowerCase("id-ID");
}

export function characterNameError(value: string): string | null {
  const name = cleanCharacterName(value);
  if (!name) return "Nama karakter wajib diisi.";
  if (name.length > MAX_CHARACTER_NAME_CHARS) {
    return `Nama karakter maksimal ${MAX_CHARACTER_NAME_CHARS} karakter.`;
  }
  return null;
}

export function isCharacterNameUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const issue = error as { code?: unknown; constraint?: unknown };
  return issue.code === "23505" && issue.constraint === "characters_user_name_unique_idx";
}
