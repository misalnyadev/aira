/**
 * Satu tempat untuk semua batas angka.
 *
 * Dipakai bersama oleh validasi API dan penghitung di UI supaya pesan yang
 * dilihat pengguna tidak pernah berbeda dengan aturan yang sebenarnya berlaku.
 */

/** Kuota karakter bawaan untuk user biasa (1 karakter; tambah slot lewat persetujuan Admin). */
export const DEFAULT_USER_CHARACTER_QUOTA = 1;

/** Kuota karakter untuk Admin. */
export const ADMIN_CHARACTER_QUOTA = 50;

/** Batas karakter fallback bila kuota akun belum termuat di klien. */
export const MAX_CHARACTERS = DEFAULT_USER_CHARACTER_QUOTA;

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

/** Batas detail profil karakter yang diisi terpisah agar mudah diedit. */
export const MAX_CHARACTER_NAME_CHARS = 80;
export const MAX_CHARACTER_ORIGIN_CHARS = 120;
export const MAX_CHARACTER_PROFESSION_CHARS = 100;
export const MIN_CHARACTER_AGE = 1;
export const MAX_CHARACTER_AGE = 120;

/** Batas label peran karakter di Tim 1. */
export const MAX_TEAM_ROLE_CHARS = 120;

/** Batas relasi personal karakter dengan pemilik di pengaturan karakter. */
export const MAX_OWNER_RELATIONSHIP_CHARS = 2_000;

/** Batas catatan hubungan tim yang bisa dibagikan bersama karakter. */
export const MAX_SHARED_TEAM_MEMORY_CHARS = 2_000;

/** Batas roster tim yang disertakan di prompt agar konteks tidak membengkak. */
export const MAX_SHARED_TEAM_MEMBERS = 12;

/** Batas total catatan relasi Tim 1 dalam satu prompt. */
export const MAX_SHARED_TEAM_PROMPT_CHARS = 6_000;

/** Batas karakter AI per Tatap Muka: tepat satu karakter bersama pengguna. */
export const MAX_MEETUP_MEMBERS = 1;

/** Batas isian profil pengguna. */
export const MAX_DISPLAY_NAME_CHARS = 15;
export const MAX_NICKNAME_CHARS = 15;
export const MAX_OCCUPATION_CHARS = 80;
export const MAX_ABOUT_CHARS = 500;
export const MIN_AGE = 10;
export const MAX_AGE = 120;

/** Batas multi API key & auto-fallback (menjaga fungsi serverless tidak kehabisan waktu). */
export const MAX_BACKUP_KEYS = 5;
export const MAX_KEY_ATTEMPTS = 4;
export const MAX_PROVIDER_FALLBACKS = 3;

/**
 * Jumlah baris gelembung pesan terbaru yang diikutkan sebagai konteks ingatan percakapan.
 * Karena 1 balasan karakter bisa terdiri dari 2–4 gelembung, angka 80 menjaga sekitar
 * 25–35 tanya-jawab utuh tetap diingat tanpa memberatkan kuota token.
 */
export const MAX_HISTORY_MESSAGES = 80;

/** Batas karakter Buku Ingatan Jangka Panjang per karakter (~600–800 token). */
export const MAX_MEMORY_SUMMARY_CHARS = 4_000;

/** Minimal gelembung lama yang belum dirangkum sebelum rangkuman otomatis jalan. */
export const AUTO_MEMORY_BATCH_MIN = 20;
