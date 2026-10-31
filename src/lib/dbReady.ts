import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * DDL idempoten — dijalankan otomatis sekali per instance server.
 * Dengan ini deploy ke Vercel tidak perlu menjalankan migrasi manual
 * (cukup set DATABASE_URL di Environment Variables lalu deploy).
 */
const DDL = [
  sql`CREATE TABLE IF NOT EXISTS "users" (
    "id" uuid PRIMARY KEY NOT NULL,
    "email" text NOT NULL UNIQUE,
    "password_hash" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS "sessions" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id")`,
  sql`CREATE TABLE IF NOT EXISTS "api_providers" (
    "id" uuid PRIMARY KEY NOT NULL,
    "type" text NOT NULL,
    "label" text NOT NULL,
    "api_key" text DEFAULT '' NOT NULL,
    "base_url" text,
    "model" text NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS "characters" (
    "id" uuid PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "avatar_url" text,
    "short_bio" text DEFAULT '' NOT NULL,
    "personality" text DEFAULT '' NOT NULL,
    "greeting" text DEFAULT '' NOT NULL,
    "provider_id" uuid,
    "model" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS "messages" (
    "id" uuid PRIMARY KEY NOT NULL,
    "character_id" uuid NOT NULL,
    "role" text NOT NULL,
    "content" text DEFAULT '' NOT NULL,
    "image_url" text,
    "status" text DEFAULT 'sent' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS "attachments" (
    "id" uuid PRIMARY KEY NOT NULL,
    "mime_type" text DEFAULT 'image/jpeg' NOT NULL,
    "data" text NOT NULL,
    "bytes" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`DO $$ BEGIN
    ALTER TABLE "characters"
      ADD CONSTRAINT "characters_provider_id_api_providers_id_fk"
      FOREIGN KEY ("provider_id") REFERENCES "api_providers"("id")
      ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$`,
  sql`DO $$ BEGIN
    ALTER TABLE "messages"
      ADD CONSTRAINT "messages_character_id_characters_id_fk"
      FOREIGN KEY ("character_id") REFERENCES "characters"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$`,
  sql`CREATE INDEX IF NOT EXISTS "messages_character_id_idx" ON "messages" ("character_id")`,
  sql`CREATE INDEX IF NOT EXISTS "messages_created_at_idx" ON "messages" ("created_at")`,
  sql`CREATE INDEX IF NOT EXISTS "characters_provider_id_idx" ON "characters" ("provider_id")`,

  // ---- Penyesuaian untuk database yang sudah terlanjur ada ----
  // Semua memakai IF NOT EXISTS / DEFAULT supaya aman dijalankan berulang.
  sql`ALTER TABLE "api_providers" ADD COLUMN IF NOT EXISTS "user_id" uuid`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "user_id" uuid`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "bible" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "user_id" uuid`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nickname" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age" integer`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "occupation" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "about" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auto_fallback" boolean NOT NULL DEFAULT true`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "chat_background" text NOT NULL DEFAULT '{"kind":"default"}'`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bubble_style" text NOT NULL DEFAULT '{"glass":false,"opacity":70,"textColorIn":null,"bgColorIn":null,"textColorOut":null,"bgColorOut":null}'`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tts_config" text NOT NULL DEFAULT '{}'`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "chat_background" text`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "bubble_style" text`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "media" text`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "voice_config" text`,
  sql`ALTER TABLE "api_providers" ADD COLUMN IF NOT EXISTS "backup_keys" text NOT NULL DEFAULT '[]'`,
  sql`CREATE INDEX IF NOT EXISTS "characters_user_id_idx" ON "characters" ("user_id")`,
  sql`CREATE INDEX IF NOT EXISTS "api_providers_user_id_idx" ON "api_providers" ("user_id")`,
];

let readyPromise: Promise<void> | null = null;

/** Pastikan seluruh tabel tersedia. Aman dipanggil berkali-kali. */
export function ensureDb(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      for (const statement of DDL) {
        await db.execute(statement);
      }
    })().catch((err) => {
      // Reset supaya percobaan berikutnya bisa mencoba lagi.
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}
