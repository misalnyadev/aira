import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const providerTypeValues = ["gemini", "grok", "openrouter", "custom"] as const;
export type ProviderType = (typeof providerTypeValues)[number];

export const apiProviders = pgTable("api_providers", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
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
  name: text("name").notNull(),
  /** Bisa berupa path `/uploads/...` (lokal) atau `/api/attachments/{id}` (Vercel). */
  avatarUrl: text("avatar_url"),
  shortBio: text("short_bio").notNull().default(""),
  personality: text("personality").notNull().default(""),
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
  mimeType: text("mime_type").notNull().default("image/jpeg"),
  data: text("data").notNull(), // base64 tanpa prefix data:
  bytes: integer("bytes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
