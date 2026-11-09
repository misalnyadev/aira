export const GENDER_OPTIONS = [
  { value: "", label: "Tidak ditentukan" },
  { value: "female", label: "Perempuan" },
  { value: "male", label: "Laki-laki" },
  { value: "nonbinary", label: "Nonbiner" },
  { value: "other", label: "Lainnya" },
] as const;

export type Gender = (typeof GENDER_OPTIONS)[number]["value"];

const GENDER_VALUE_SET = new Set<string>(GENDER_OPTIONS.map(({ value }) => value));

/** Normalisasi nilai tersimpan/API; null berarti nilai tidak dikenal. */
export function normalizeGender(value: unknown): Gender | null {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" || !GENDER_VALUE_SET.has(value)) return null;
  return value as Gender;
}

/** Label aman untuk UI dan prompt; nilai kosong/tidak dikenal tidak ditampilkan. */
export function genderLabel(value: unknown): string {
  const normalized = normalizeGender(value);
  if (normalized === null || normalized === "") return "";
  return GENDER_OPTIONS.find((option) => option.value === normalized)?.label ?? "";
}
