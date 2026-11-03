/**
 * Utilitas Kode PIN Karakter & Status Kontak Antar-Pengguna.
 *
 * Modul ini murni (tanpa impor database) sehingga aman dipakai
 * baik di Server Routes maupun di Client Components.
 */

const PIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const DEFAULT_PIN_LENGTH = 6;

export type ContactAdminStatus = "pending" | "approved" | "rejected";
export type ContactOwnerStatus = "pending" | "approved" | "rejected" | "blocked";

export type EffectiveContactState =
  | "active"
  | "pending_both"
  | "pending_admin"
  | "pending_owner"
  | "rejected"
  | "blocked";

/**
 * Buat kode PIN bawaan 6 karakter (tanpa 0/O/1/I agar tidak tertukar saat dibaca).
 */
export function generateCharacterPin(length = DEFAULT_PIN_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += PIN_ALPHABET[bytes[i] % PIN_ALPHABET.length];
  }
  return out;
}

/**
 * Bersihkan masukan PIN dari pengguna (hapus spasi/tanda hubung, jadikan huruf besar).
 */
export function normalizePinInput(raw: string): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .trim();
}

/**
 * Validasi format PIN karakter (6–10 karakter alfanumerik jelas).
 */
export function isValidPinFormat(pin: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6,10}$/.test(pin);
}

/**
 * Hitung status efektif sambungan kontak berdasarkan persetujuan Admin & Pemilik Karakter.
 * Kontak hanya aktif (`active`) bila KEDUANYA telah menyetujui (`approved`).
 */
export function effectiveContactState(
  adminStatus: string,
  ownerStatus: string
): EffectiveContactState {
  if (ownerStatus === "blocked") return "blocked";
  if (adminStatus === "rejected" || ownerStatus === "rejected") return "rejected";
  if (adminStatus === "approved" && ownerStatus === "approved") return "active";
  if (adminStatus !== "approved" && ownerStatus !== "approved") {
    return "pending_both";
  }
  if (adminStatus !== "approved") return "pending_admin";
  return "pending_owner";
}

export function describeContactState(state: EffectiveContactState): string {
  switch (state) {
    case "active":
      return "Aktif · Terhubung";
    case "pending_both":
      return "Menunggu Admin & Pemilik";
    case "pending_admin":
      return "Menunggu Persetujuan Admin";
    case "pending_owner":
      return "Menunggu Persetujuan Pemilik";
    case "rejected":
      return "Ditolak";
    case "blocked":
      return "Diblokir";
  }
}
