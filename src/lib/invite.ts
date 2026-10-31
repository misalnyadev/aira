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
