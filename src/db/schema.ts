import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const providerTypeValues = ["gemini", "groq", "openrouter", "custom", "grok"] as const;
export type ProviderType = (typeof providerTypeValues)[number];

/**
 * Akun pengguna.
 *
 * `password_hash` menyimpan hasil scrypt (lihat `src/lib/password.ts`), bukan
 * kata sandi aslinya — kata sandi tidak pernah disimpan dalam bentuk terbaca.
 */
export const users = pgTable("users", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),

  /*
   * Profil pengguna — dibaca karakter sebelum membalas, supaya mereka tahu
   * sedang mengobrol dengan siapa dan memanggil dengan benar.
   * Semua opsional: akun tetap bisa dipakai walau profil belum diisi.
   */
  displayName: text("display_name").notNull().default(""),
  nickname: text("nickname").notNull().default(""),
  age: integer("age"),
  occupation: text("occupation").notNull().default(""),
  about: text("about").notNull().default(""),
  /** Foto profil pengguna (`/api/attachments/{id}` atau `/uploads/...`). */
  avatarUrl: text("avatar_url"),

  /** Pindah otomatis ke provider lain saat semua key provider utama kena limit/gagal. */
  autoFallback: boolean("auto_fallback").notNull().default(true),

  /**
   * Latar area chat, disimpan sebagai JSON pendek:
   * `{"kind":"default"}`, `{"kind":"preset","id":"sand"}`,
   * `{"kind":"animated","id":"aurora"}`, atau
   * `{"kind":"image","imageUrl":"/uploads/..","dim":0.25}`.
   * Disimpan di akun supaya ikut ke semua perangkat.
   */
  chatBackground: text("chat_background").notNull().default('{"kind":"default"}'),
  /** Gaya gelembung pesan bawaan akun (tembus pandang & warna per sisi). */
  bubbleStyle: text("bubble_style")
    .notNull()
    .default(
      '{"glass":false,"opacity":70,"textColorIn":null,"bgColorIn":null,"textColorOut":null,"bgColorOut":null}'
    ),
  /** Pengaturan Suara HD (ElevenLabs) milik akun: API key, key cadangan, dan 2 slot suara (JSON). */
  ttsConfig: text("tts_config").notNull().default("{}"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Sesi login.
 *
 * `id` adalah SHA-256 dari token yang dikirim ke browser. Kalau isi tabel ini
 * bocor, token di dalamnya tidak bisa langsung dipakai untuk masuk.
 */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiProviders = pgTable("api_providers", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** Pemilik key. Null hanya untuk data lama sebelum ada sistem akun. */
  userId: uuid("user_id"),
  type: text("type").notNull(), // gemini | grok | openrouter | custom
  label: text("label").notNull(),
  apiKey: text("api_key").notNull().default(""),
  /** JSON array string API key cadangan (dicoba berurutan saat key utama kena limit). */
  backupKeys: text("backup_keys").notNull().default("[]"),
  baseUrl: text("base_url"),
  model: text("model").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const characters = pgTable("characters", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** Pemilik karakter. Null hanya untuk data lama sebelum ada sistem akun. */
  userId: uuid("user_id"),
  name: text("name").notNull(),
  /** Bisa berupa path `/uploads/...` (lokal) atau `/api/attachments/{id}` (Vercel). */
  avatarUrl: text("avatar_url"),
  shortBio: text("short_bio").notNull().default(""),
  personality: text("personality").notNull().default(""),
  /**
   * Bible peran — naskah lengkap karakter yang diimpor dari berkas.
   * Kalau terisi, isinya jadi acuan utama di atas ringkasan kepribadian.
   */
  bible: text("bible").notNull().default(""),
  greeting: text("greeting").notNull().default(""),
  providerId: uuid("provider_id").references(() => apiProviders.id, {
    onDelete: "set null",
  }),
  model: text("model"),
  /** Latar chat khusus karakter (JSON); `null` = ikut latar bawaan akun. */
  chatBackground: text("chat_background"),
  /** Gaya gelembung khusus karakter (JSON); `null` = ikut gelembung bawaan akun. */
  bubbleStyle: text("bubble_style"),
  /** Media pribadi karakter di R2: video chat, video call, dan suara telepon (JSON). */
  media: text("media"),
  /** Pilihan suara khusus karakter: ikut bawaan, perangkat, HD perempuan, HD laki-laki, atau custom (JSON). */
  voiceConfig: text("voice_config"),
  /** Aktifkan ingatan jangka panjang + kesadaran waktu & pencarian arsip obrolan pada karakter ini. */
  memoryEnabled: boolean("memory_enabled").notNull().default(false),
  /** Buku ingatan jangka panjang (rencana, fakta lawan bicara, dan momen penting ber-tanggal). */
  memorySummary: text("memory_summary").notNull().default(""),
  /** Batas waktu pesan terakhir yang sudah dirangkum ke dalam `memory_summary`. */
  memoryThroughAt: timestamp("memory_through_at", { withTimezone: true }),
  /** Kapan `memory_summary` terakhir kali diperbarui. */
  memoryUpdatedAt: timestamp("memory_updated_at", { withTimezone: true }),
  /** Aktifkan akses browsing internet & pembaca link URL pada karakter ini. */
  browsingEnabled: boolean("browsing_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  characterId: uuid("character_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull().default(""),
  /** URL gambar: `/uploads/...` (lokal) atau `/api/attachments/{id}` (Vercel). */
  imageUrl: text("image_url"),
  status: text("status").notNull().default("sent"), // sent | read
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Penyimpanan gambar di dalam database.
 * Dipakai otomatis saat filesystem bersifat read-only (Vercel/serverless),
 * sehingga fitur kirim foto & foto profil tetap jalan tanpa layanan tambahan.
 */
export const attachments = pgTable("attachments", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  /** Pemilik gambar. Null hanya untuk data lama sebelum ada sistem akun. */
  userId: uuid("user_id"),
  mimeType: text("mime_type").notNull().default("image/jpeg"),
  data: text("data").notNull(), // base64 tanpa prefix data:
  bytes: integer("bytes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Indeks ringan rekaman Suara HD yang tersimpan di Cloudflare R2 (`tts/{userId}/...`).
 * Berkas audionya berada di R2, sedangkan tabel ini hanya mencatat metadata kecil
 * agar Bank Rekaman tersinkron di PC & HP dan bisa langsung diputar tanpa API key.
 */
export const ttsClips = pgTable(
  "tts_clips",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clipHash: text("clip_hash").notNull(),
    r2Key: text("r2_key").notNull(),
    provider: text("provider").notNull(), // 'gemini' | 'elevenlabs'
    voice: text("voice").notNull(),
    text: text("text").notNull(),
    mimeType: text("mime_type").notNull().default("audio/wav"),
    bytes: integer("bytes").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("tts_clips_user_hash_idx").on(table.userId, table.clipHash)]
);
