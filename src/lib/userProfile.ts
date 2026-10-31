import {
  MAX_ABOUT_CHARS,
  MAX_AGE,
  MAX_DISPLAY_NAME_CHARS,
  MAX_NICKNAME_CHARS,
  MAX_OCCUPATION_CHARS,
  MIN_AGE,
} from "./limits";

/**
 * Profil lawan bicara — data milik PENGGUNA, bukan karakter.
 *
 * Isinya dibaca model sebelum membalas supaya karakter tahu sedang mengobrol
 * dengan siapa. Tanpa bergantung ke Node API, jadi bisa diuji langsung.
 */
export type UserProfile = {
  displayName: string;
  nickname: string;
  age: number | null;
  occupation: string;
  about: string;
};

export const EMPTY_PROFILE: UserProfile = {
  displayName: "",
  nickname: "",
  age: null,
  occupation: "",
  about: "",
};

/** Apakah profil ini sudah cukup berarti untuk dikirim ke model. */
export function hasProfileContent(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  return Boolean(
    profile.displayName?.trim() ||
      profile.nickname?.trim() ||
      profile.occupation?.trim() ||
      profile.about?.trim() ||
      profile.age
  );
}

export type ProfileCheck = { ok: true; profile: UserProfile } | { ok: false; error: string };

/**
 * Rapikan dan periksa isian profil.
 *
 * Semua field opsional; yang diperiksa hanya panjangnya, plus usia yang masuk
 * akal. Teks disimpan apa adanya (hanya di-trim) karena profil boleh ditulis
 * santai, tidak perlu aturan ketat.
 */
export function normalizeProfile(input: {
  displayName?: unknown;
  nickname?: unknown;
  age?: unknown;
  occupation?: unknown;
  about?: unknown;
}): ProfileCheck {
  const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

  const displayName = str(input.displayName);
  const nickname = str(input.nickname);
  const occupation = str(input.occupation);
  const about = str(input.about);

  if (displayName.length > MAX_DISPLAY_NAME_CHARS) {
    return { ok: false, error: `Nama maksimal ${MAX_DISPLAY_NAME_CHARS} karakter.` };
  }
  if (nickname.length > MAX_NICKNAME_CHARS) {
    return { ok: false, error: `Panggilan maksimal ${MAX_NICKNAME_CHARS} karakter.` };
  }
  if (occupation.length > MAX_OCCUPATION_CHARS) {
    return { ok: false, error: `Kesibukan maksimal ${MAX_OCCUPATION_CHARS} karakter.` };
  }
  if (about.length > MAX_ABOUT_CHARS) {
    return { ok: false, error: `Cerita maksimal ${MAX_ABOUT_CHARS} karakter.` };
  }

  let age: number | null = null;
  const rawAge = input.age;
  if (rawAge !== undefined && rawAge !== null && rawAge !== "") {
    const parsed = typeof rawAge === "number" ? rawAge : Number(String(rawAge).trim());
    if (!Number.isInteger(parsed)) {
      return { ok: false, error: "Usia harus berupa angka bulat." };
    }
    if (parsed < MIN_AGE || parsed > MAX_AGE) {
      return { ok: false, error: `Usia harus antara ${MIN_AGE} dan ${MAX_AGE}.` };
    }
    age = parsed;
  }

  return {
    ok: true,
    profile: { displayName, nickname, age, occupation, about },
  };
}
