import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const providerTypeValues = ["gemini", "grok", "openrouter", "custom"] as const;
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
