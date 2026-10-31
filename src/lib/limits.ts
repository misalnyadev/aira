/**
 * Satu tempat untuk semua batas angka.
 *
 * Dipakai bersama oleh validasi API dan penghitung di UI supaya pesan yang
 * dilihat pengguna tidak pernah berbeda dengan aturan yang sebenarnya berlaku.
 */

/** Jumlah karakter maksimal per akun. */
export const MAX_CHARACTERS = 10;

/**
 * Panjang maksimal bible peran.
 *
 * 24.000 karakter kira-kira 6.000–8.000 token. Bible dikirim di SETIAP pesan,
 * jadi angka ini menjaga biaya dan kecepatan tetap wajar. Naikkan hanya kalau
 * memang perlu, dan ingat konsekuensinya.
 */
export const MAX_BIBLE_CHARS = 24_000;

/** Batas ringkasan kepribadian (kolom yang diisi manual). */
export const MAX_PERSONALITY_CHARS = 8_000;

/** Batas pesan pembuka otomatis. */
export const MAX_GREETING_CHARS = 1_000;

/** Batas status singkat di bawah nama karakter. */
export const MAX_SHORT_BIO_CHARS = 120;

/** Batas isian profil pengguna. */
export const MAX_DISPLAY_NAME_CHARS = 60;
export const MAX_NICKNAME_CHARS = 30;
export const MAX_OCCUPATION_CHARS = 80;
export const MAX_ABOUT_CHARS = 500;
export const MIN_AGE = 10;
export const MAX_AGE = 120;

/** Batas multi API key & auto-fallback (menjaga fungsi serverless tidak kehabisan waktu). */
export const MAX_BACKUP_KEYS = 5;
export const MAX_KEY_ATTEMPTS = 4;
export const MAX_PROVIDER_FALLBACKS = 3;
