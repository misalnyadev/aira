import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/**
 * Format yang disimpan di database: `scrypt$<salt hex>$<kunci hex>`
 * Salt dibuat ulang untuk setiap pengguna supaya dua orang dengan kata sandi
 * sama tetap punya hash berbeda.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const key = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const [, salt, expectedHex] = parts;
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const actual = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}

/**
 * Hash umpan untuk email yang tidak ada.
 *
 * Tanpa ini, permintaan masuk dengan email tak terdaftar akan selesai jauh
 * lebih cepat daripada email yang terdaftar — dari selisih waktunya orang bisa
 * menebak email mana yang punya akun. Dibuat sekali lalu dipakai ulang.
 */
let decoyPromise: Promise<string> | null = null;

export function decoyHash(): Promise<string> {
  if (!decoyPromise) {
    decoyPromise = hashPassword(randomBytes(24).toString("hex"));
  }
  return decoyPromise;
}

export type PasswordProblem = string | null;

/** Aturan kata sandi — satu tempat, dipakai server dan bisa ditampilkan di UI. */
export function checkPasswordStrength(password: string): PasswordProblem {
  if (password.length < 8) return "Kata sandi minimal 8 karakter.";
  if (password.length > 200) return "Kata sandi terlalu panjang (maksimal 200 karakter).";
  if (!/[a-zA-Z]/.test(password)) return "Kata sandi harus mengandung huruf.";
  if (!/[0-9]/.test(password)) return "Kata sandi harus mengandung angka.";
  return null;
}

/** Pemeriksaan email yang sengaja longgar — cukup untuk mencegah salah ketik. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function checkEmail(email: string): PasswordProblem {
  if (!email) return "Email wajib diisi.";
  if (email.length > 254) return "Email terlalu panjang.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Format email tidak valid.";
  return null;
}
