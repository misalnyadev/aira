import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Kode undangan pendaftaran.
 *
 * Aplikasi ini untuk lingkaran teman, bukan untuk umum. Kodenya disimpan di
 * environment variable supaya tidak ikut masuk repositori dan bisa diganti
 * kapan saja tanpa mengubah kode.
 *
 * Aturan penting: kalau variabelnya KOSONG, pendaftaran DITUTUP — bukan
 * terbuka. Salah ketik di sisi konfigurasi berujung pada "tidak bisa daftar",
 * bukan "siapa pun boleh daftar".
 */

export const SIGNUP_CODE_ENV = "SIGNUP_CODE";

export type SignupInviteSummary = {
  code: string;
  enabled: boolean;
  /**
   * - `env`    : memakai nilai bawaan dari environment variable `SIGNUP_CODE` di Vercel
   * - `custom` : diganti oleh Admin lewat Panel Admin (tersimpan di database)
   * - `closed` : pendaftaran sengaja ditutup sementara oleh Admin
   */
  source: "env" | "custom" | "closed";
  hasEnvDefault: boolean;
};

/**
 * Hitung kode undangan aktif berdasarkan override di database vs variabel `SIGNUP_CODE` di server.
 */
export function resolveActiveSignupCode(
  dbOverride: string | null | undefined,
  envValue: string | undefined | null
): SignupInviteSummary {
  const envTrimmed = (envValue ?? "").trim();
  const hasEnvDefault = Boolean(envTrimmed);

  if (typeof dbOverride === "string") {
    const cleanOverride = dbOverride.trim();
    if (!cleanOverride) {
      return {
        code: "",
        enabled: false,
        source: "closed",
        hasEnvDefault,
      };
    }
    return {
      code: cleanOverride,
      enabled: true,
      source: "custom",
      hasEnvDefault,
    };
  }

  return {
    code: envTrimmed,
    enabled: hasEnvDefault,
    source: "env",
    hasEnvDefault,
  };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Periksa kode undangan. Mengembalikan pesan kesalahan, atau `null` kalau lolos.
 *
 * Kode dibandingkan lewat digest SHA-256 dengan `timingSafeEqual`, jadi lama
 * pemeriksaannya tidak bergantung pada berapa banyak karakter awal yang cocok.
 * Perbandingan mengabaikan spasi di ujung dan huruf besar/kecil, karena kode
 * ini akan sering diketik ulang di ponsel.
 */
export function checkInvite(
  expected: string | undefined | null,
  provided: string | undefined | null
): string | null {
  const valid = (expected ?? "").trim();

  if (!valid) {
    return "Pendaftaran sedang ditutup. Hubungi pemilik aplikasi.";
  }

  const input = (provided ?? "").trim();
  if (!input) {
    return "Kode undangan wajib diisi.";
  }

  const same = timingSafeEqual(digest(valid.toLowerCase()), digest(input.toLowerCase()));
  return same ? null : "Kode undangan salah.";
}
