import { isNull, or, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { generateCharacterPin } from "@/lib/contactPin";

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
    "gender" text NOT NULL DEFAULT '',
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
    "gender" text NOT NULL DEFAULT '',
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
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "gender" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "bible" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "owner_relationship" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "user_id" uuid`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nickname" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gender" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "age" integer`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "occupation" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "about" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auto_fallback" boolean NOT NULL DEFAULT true`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "chat_background" text NOT NULL DEFAULT '{"kind":"default"}'`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bubble_style" text NOT NULL DEFAULT '{"glass":false,"opacity":70,"textColorIn":null,"bgColorIn":null,"textColorOut":null,"bgColorOut":null}'`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meetup_background" text`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meetup_bubble_style" text`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tts_config" text NOT NULL DEFAULT '{}'`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "chat_background" text`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "meetup_background" text`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "bubble_style" text`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "meetup_bubble_style" text`,
  // Salin tampilan lama ke Tatap Muka sekali agar tampilannya tidak mendadak berubah.
  sql`CREATE TABLE IF NOT EXISTS "_aira_migrations" (
    "id" text PRIMARY KEY,
    "applied_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`DO $$
    DECLARE
      migration_claimed integer;
    BEGIN
      INSERT INTO "_aira_migrations" ("id")
      VALUES ('split_chat_and_meetup_appearance_v1')
      ON CONFLICT ("id") DO NOTHING;
      GET DIAGNOSTICS migration_claimed = ROW_COUNT;
      IF migration_claimed = 1 THEN
        UPDATE "users"
        SET "meetup_background" = "chat_background",
            "meetup_bubble_style" = "bubble_style";
        UPDATE "characters"
        SET "meetup_background" = "chat_background",
            "meetup_bubble_style" = "bubble_style"
        WHERE "chat_background" IS NOT NULL OR "bubble_style" IS NOT NULL;
      END IF;
    END $$`,
  // Materialisasikan tampilan akun ke karakter lama sekali sebelum fallback akun dihapus.
  sql`DO $$
    DECLARE
      migration_claimed integer;
    BEGIN
      INSERT INTO "_aira_migrations" ("id")
      VALUES ('character_appearance_defaults_v1')
      ON CONFLICT ("id") DO NOTHING;
      GET DIAGNOSTICS migration_claimed = ROW_COUNT;
      IF migration_claimed = 1 THEN
        UPDATE "characters" AS c
        SET "chat_background" = COALESCE(c."chat_background", u."chat_background", '{"kind":"default"}'),
            "meetup_background" = COALESCE(c."meetup_background", u."meetup_background", '{"kind":"default"}'),
            "bubble_style" = COALESCE(c."bubble_style", u."bubble_style", '{"glass":false,"opacity":70,"textColorIn":null,"bgColorIn":null,"textColorOut":null,"bgColorOut":null,"hideMessages":false,"minimalBars":false}'),
            "meetup_bubble_style" = COALESCE(c."meetup_bubble_style", u."meetup_bubble_style", '{"glass":false,"opacity":70,"textColorIn":null,"bgColorIn":null,"textColorOut":null,"bgColorOut":null,"hideMessages":false,"minimalBars":false}')
        FROM "users" AS u
        WHERE c."user_id" = u."id";

        UPDATE "characters"
        SET "chat_background" = COALESCE("chat_background", '{"kind":"default"}'),
            "meetup_background" = COALESCE("meetup_background", '{"kind":"default"}'),
            "bubble_style" = COALESCE("bubble_style", '{"glass":false,"opacity":70,"textColorIn":null,"bgColorIn":null,"textColorOut":null,"bgColorOut":null,"hideMessages":false,"minimalBars":false}'),
            "meetup_bubble_style" = COALESCE("meetup_bubble_style", '{"glass":false,"opacity":70,"textColorIn":null,"bgColorIn":null,"textColorOut":null,"bgColorOut":null,"hideMessages":false,"minimalBars":false}')
        WHERE "chat_background" IS NULL
           OR "meetup_background" IS NULL
           OR "bubble_style" IS NULL
           OR "meetup_bubble_style" IS NULL;
      END IF;
    END $$`,
  sql`ALTER TABLE "characters" ALTER COLUMN "chat_background" SET DEFAULT '{"kind":"default"}'`,
  sql`ALTER TABLE "characters" ALTER COLUMN "chat_background" SET NOT NULL`,
  sql`ALTER TABLE "characters" ALTER COLUMN "meetup_background" SET DEFAULT '{"kind":"default"}'`,
  sql`ALTER TABLE "characters" ALTER COLUMN "meetup_background" SET NOT NULL`,
  sql`ALTER TABLE "characters" ALTER COLUMN "bubble_style" SET DEFAULT '{"glass":false,"opacity":70,"textColorIn":null,"bgColorIn":null,"textColorOut":null,"bgColorOut":null,"hideMessages":false,"minimalBars":false}'`,
  sql`ALTER TABLE "characters" ALTER COLUMN "bubble_style" SET NOT NULL`,
  sql`ALTER TABLE "characters" ALTER COLUMN "meetup_bubble_style" SET DEFAULT '{"glass":false,"opacity":70,"textColorIn":null,"bgColorIn":null,"textColorOut":null,"bgColorOut":null,"hideMessages":false,"minimalBars":false}'`,
  sql`ALTER TABLE "characters" ALTER COLUMN "meetup_bubble_style" SET NOT NULL`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "media" text`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "voice_config" text`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "memory_enabled" boolean NOT NULL DEFAULT false`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "memory_summary" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "memory_through_at" timestamp with time zone`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "memory_updated_at" timestamp with time zone`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "team_role" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "shared_team_memory" text NOT NULL DEFAULT ''`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "share_team_memory" boolean NOT NULL DEFAULT false`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "share_owner_profile_fields" text NOT NULL DEFAULT '[]'`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "skill_portfolio" text NOT NULL DEFAULT '[]'`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "browsing_enabled" boolean NOT NULL DEFAULT false`,
  sql`ALTER TABLE "api_providers" ADD COLUMN IF NOT EXISTS "backup_keys" text NOT NULL DEFAULT '[]'`,
  sql`CREATE INDEX IF NOT EXISTS "characters_user_id_idx" ON "characters" ("user_id")`,
  sql`CREATE INDEX IF NOT EXISTS "api_providers_user_id_idx" ON "api_providers" ("user_id")`,
  sql`CREATE TABLE IF NOT EXISTS "tts_clips" (
    "id" uuid PRIMARY KEY NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "clip_hash" text NOT NULL,
    "r2_key" text NOT NULL,
    "provider" text NOT NULL,
    "voice" text NOT NULL,
    "text" text NOT NULL,
    "mime_type" text DEFAULT 'audio/wav' NOT NULL,
    "bytes" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "tts_clips_user_hash_idx" ON "tts_clips" ("user_id", "clip_hash")`,
  sql`CREATE INDEX IF NOT EXISTS "tts_clips_user_created_idx" ON "tts_clips" ("user_id", "created_at" DESC)`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_admin" boolean NOT NULL DEFAULT false`,
  sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "character_quota" integer NOT NULL DEFAULT 1`,
  sql`CREATE TABLE IF NOT EXISTS "character_quota_requests" (
    "id" uuid PRIMARY KEY NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "requested_quota" integer NOT NULL,
    "reason" text DEFAULT '' NOT NULL,
    "status" text DEFAULT 'pending' NOT NULL,
    "admin_note" text DEFAULT '' NOT NULL,
    "discussion" text DEFAULT '[]' NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`ALTER TABLE "character_quota_requests" ADD COLUMN IF NOT EXISTS "discussion" text DEFAULT '[]' NOT NULL`,
  sql`CREATE INDEX IF NOT EXISTS "quota_requests_user_idx" ON "character_quota_requests" ("user_id", "created_at" DESC)`,
  sql`CREATE INDEX IF NOT EXISTS "quota_requests_status_idx" ON "character_quota_requests" ("status", "created_at" DESC)`,
  // Jika belum ada satu pun Admin di database, otomatis angkat akun pertama (pemilik utama) menjadi Admin.
  sql`UPDATE "users"
      SET "is_admin" = true,
          "character_quota" = GREATEST("character_quota", 50)
      WHERE "id" = (
        SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1
      )
      AND NOT EXISTS (SELECT 1 FROM "users" WHERE "is_admin" = true)`,

  // ---- PIN Karakter & Kontak 2 Arah Antar-Pengguna ----
  sql`ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "is_voice_note" boolean DEFAULT false NOT NULL`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "proactive_enabled" boolean DEFAULT false NOT NULL`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "proactive_last_at" timestamp with time zone`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "story_auto_enabled" boolean DEFAULT false NOT NULL`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "story_auto_frequency" text DEFAULT 'every_other_day' NOT NULL`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "story_auto_last_attempt_at" timestamp with time zone`,
  sql`DO $$ BEGIN
      ALTER TABLE "characters" ADD CONSTRAINT "characters_story_auto_frequency_check"
      CHECK ("story_auto_frequency" IN ('daily', 'every_other_day'));
    EXCEPTION WHEN duplicate_object THEN null; END $$`,
  sql`ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "invite_pin" text`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "characters_invite_pin_idx" ON "characters" ("invite_pin") WHERE "invite_pin" IS NOT NULL`,
  sql`CREATE TABLE IF NOT EXISTS "character_contacts" (
    "id" uuid PRIMARY KEY NOT NULL,
    "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
    "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "guest_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "admin_status" text DEFAULT 'approved' NOT NULL,
    "owner_status" text DEFAULT 'pending' NOT NULL,
    "ai_auto_reply" boolean DEFAULT true NOT NULL,
    "note" text DEFAULT '' NOT NULL,
    "memory_summary" text DEFAULT '' NOT NULL,
    "memory_through_at" timestamp with time zone,
    "memory_updated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`ALTER TABLE "character_contacts" ALTER COLUMN "admin_status" SET DEFAULT 'approved'`,
  sql`UPDATE "character_contacts" SET "admin_status" = 'approved' WHERE "admin_status" = 'pending'`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "character_contacts_char_guest_idx" ON "character_contacts" ("character_id", "guest_user_id")`,
  sql`CREATE INDEX IF NOT EXISTS "character_contacts_owner_idx" ON "character_contacts" ("owner_user_id", "updated_at" DESC)`,
  sql`CREATE INDEX IF NOT EXISTS "character_contacts_guest_idx" ON "character_contacts" ("guest_user_id", "updated_at" DESC)`,
  sql`CREATE INDEX IF NOT EXISTS "character_contacts_admin_status_idx" ON "character_contacts" ("admin_status", "created_at" ASC)`,
  sql`CREATE TABLE IF NOT EXISTS "contact_messages" (
    "id" uuid PRIMARY KEY NOT NULL,
    "contact_id" uuid NOT NULL REFERENCES "character_contacts"("id") ON DELETE cascade,
    "sender_kind" text NOT NULL,
    "content" text DEFAULT '' NOT NULL,
    "image_url" text,
    "is_voice_note" boolean DEFAULT false NOT NULL,
    "status" text DEFAULT 'sent' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`ALTER TABLE "contact_messages" ADD COLUMN IF NOT EXISTS "is_voice_note" boolean DEFAULT false NOT NULL`,
  sql`CREATE INDEX IF NOT EXISTS "contact_messages_contact_idx" ON "contact_messages" ("contact_id", "created_at" ASC)`,
  sql`CREATE TABLE IF NOT EXISTS "character_notes" (
    "id" uuid PRIMARY KEY NOT NULL,
    "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "kind" text DEFAULT 'plan' NOT NULL,
    "title" text DEFAULT '' NOT NULL,
    "due_date" text,
    "url" text,
    "done" boolean DEFAULT false NOT NULL,
    "source" text DEFAULT 'manual' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE INDEX IF NOT EXISTS "character_notes_char_user_idx" ON "character_notes" ("character_id", "user_id", "done", "created_at" DESC)`,
  sql`CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" text PRIMARY KEY NOT NULL,
    "value" text DEFAULT '' NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS "brainstorm_rooms" (
    "id" uuid PRIMARY KEY NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "title" text DEFAULT '' NOT NULL,
    "mode" text DEFAULT 'brainstorm' NOT NULL,
    "scene_canonical" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`ALTER TABLE "brainstorm_rooms" ADD COLUMN IF NOT EXISTS "mode" text NOT NULL DEFAULT 'brainstorm'`,
  sql`ALTER TABLE "brainstorm_rooms" ADD COLUMN IF NOT EXISTS "scene_canonical" boolean NOT NULL DEFAULT false`,
  sql`CREATE TABLE IF NOT EXISTS "brainstorm_room_members" (
    "id" uuid PRIMARY KEY NOT NULL,
    "room_id" uuid NOT NULL REFERENCES "brainstorm_rooms"("id") ON DELETE cascade,
    "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "brainstorm_room_members_room_char_idx" ON "brainstorm_room_members" ("room_id", "character_id")`,
  sql`CREATE INDEX IF NOT EXISTS "brainstorm_room_members_room_idx" ON "brainstorm_room_members" ("room_id")`,
  sql`CREATE TABLE IF NOT EXISTS "brainstorm_messages" (
    "id" uuid PRIMARY KEY NOT NULL,
    "room_id" uuid NOT NULL REFERENCES "brainstorm_rooms"("id") ON DELETE cascade,
    "role" text NOT NULL,
    "character_id" uuid,
    "content" text DEFAULT '' NOT NULL,
    "image_url" text,
    "attachment_name" text,
    "attachment_text" text,
    "is_voice_note" boolean DEFAULT false NOT NULL,
    "emotion" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`ALTER TABLE "brainstorm_messages" ADD COLUMN IF NOT EXISTS "attachment_name" text`,
  sql`ALTER TABLE "brainstorm_messages" ADD COLUMN IF NOT EXISTS "attachment_text" text`,
  sql`CREATE INDEX IF NOT EXISTS "brainstorm_messages_room_idx" ON "brainstorm_messages" ("room_id", "created_at" ASC)`,
  sql`CREATE TABLE IF NOT EXISTS "character_continuity_memories" (
    "id" uuid PRIMARY KEY NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "character_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE cascade,
    "source_room_id" uuid NOT NULL REFERENCES "brainstorm_rooms"("id") ON DELETE cascade,
    "source_message_id" uuid NOT NULL REFERENCES "brainstorm_messages"("id") ON DELETE cascade,
    "source_mode" text NOT NULL,
    "continuity_status" text NOT NULL,
    "title" text DEFAULT '' NOT NULL,
    "summary" text DEFAULT '' NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "continuity_memories_char_message_idx" ON "character_continuity_memories" ("character_id", "source_message_id")`,
  sql`CREATE INDEX IF NOT EXISTS "continuity_memories_user_char_time_idx" ON "character_continuity_memories" ("user_id", "character_id", "occurred_at" DESC)`,

  sql`CREATE INDEX IF NOT EXISTS "brainstorm_rooms_user_idx" ON "brainstorm_rooms" ("user_id", "updated_at" DESC)`,
  // ---- Status / Reels (WA Story + IG Reels) ----
  sql`CREATE TABLE IF NOT EXISTS "character_statuses" (
    "id" uuid PRIMARY KEY NOT NULL,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "character_id" uuid REFERENCES "characters"("id") ON DELETE cascade,
    "kind" text DEFAULT 'status' NOT NULL,
    "media_type" text DEFAULT 'text' NOT NULL,
    "caption" text DEFAULT '' NOT NULL,
    "content" text DEFAULT '' NOT NULL,
    "image_url" text,
    "video_key" text,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE INDEX IF NOT EXISTS "character_statuses_user_idx" ON "character_statuses" ("user_id", "created_at" DESC)`,
  sql`CREATE INDEX IF NOT EXISTS "character_statuses_char_idx" ON "character_statuses" ("character_id", "created_at" DESC)`,
  sql`CREATE INDEX IF NOT EXISTS "character_statuses_kind_idx" ON "character_statuses" ("kind", "created_at" DESC)`,
  sql`CREATE INDEX IF NOT EXISTS "character_statuses_expires_idx" ON "character_statuses" ("expires_at")`,
  sql`CREATE TABLE IF NOT EXISTS "status_likes" (
    "id" uuid PRIMARY KEY NOT NULL,
    "status_id" uuid NOT NULL REFERENCES "character_statuses"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "status_likes_status_user_idx" ON "status_likes" ("status_id", "user_id")`,
  sql`CREATE TABLE IF NOT EXISTS "status_comments" (
    "id" uuid PRIMARY KEY NOT NULL,
    "status_id" uuid NOT NULL REFERENCES "character_statuses"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "image_url" text,
    "content" text DEFAULT '' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`ALTER TABLE "status_comments" ADD COLUMN IF NOT EXISTS "parent_comment_id" uuid`,
  sql`ALTER TABLE "status_comments" ADD COLUMN IF NOT EXISTS "image_url" text`,
  sql`DO $$ BEGIN
    ALTER TABLE "status_comments"
      ADD CONSTRAINT "status_comments_parent_comment_id_fk"
      FOREIGN KEY ("parent_comment_id") REFERENCES "status_comments"("id")
      ON DELETE cascade ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN null; END $$`,
  sql`CREATE INDEX IF NOT EXISTS "status_comments_status_idx" ON "status_comments" ("status_id", "created_at" ASC)`,
  sql`CREATE INDEX IF NOT EXISTS "status_comments_parent_idx" ON "status_comments" ("parent_comment_id")`,
  sql`CREATE TABLE IF NOT EXISTS "status_comment_likes" (
    "id" uuid PRIMARY KEY NOT NULL,
    "comment_id" uuid NOT NULL REFERENCES "status_comments"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "status_comment_likes_comment_user_idx" ON "status_comment_likes" ("comment_id", "user_id")`,
  sql`CREATE TABLE IF NOT EXISTS "status_views" (
    "id" uuid PRIMARY KEY NOT NULL,
    "status_id" uuid NOT NULL REFERENCES "character_statuses"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "status_views_status_user_idx" ON "status_views" ("status_id", "user_id")`,
  sql`CREATE TABLE IF NOT EXISTS "status_bookmarks" (
    "id" uuid PRIMARY KEY NOT NULL,
    "status_id" uuid NOT NULL REFERENCES "character_statuses"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "status_bookmarks_status_user_idx" ON "status_bookmarks" ("status_id", "user_id")`,
  sql`CREATE TABLE IF NOT EXISTS "status_follows" (
    "id" uuid PRIMARY KEY NOT NULL,
    "follower_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "target_user_id" uuid REFERENCES "users"("id") ON DELETE cascade,
    "target_character_id" uuid REFERENCES "characters"("id") ON DELETE cascade,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "status_follows_one_target_check"
      CHECK (num_nonnulls("target_user_id", "target_character_id") = 1)
  )`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "status_follows_follower_user_idx" ON "status_follows" ("follower_user_id", "target_user_id")`,
  sql`CREATE UNIQUE INDEX IF NOT EXISTS "status_follows_follower_character_idx" ON "status_follows" ("follower_user_id", "target_character_id")`,
];

async function backfillMissingCharacterPins(): Promise<void> {
  const missing = await db
    .select({ id: characters.id })
    .from(characters)
    .where(or(isNull(characters.invitePin), eq(characters.invitePin, "")));

  for (const row of missing) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = generateCharacterPin();
      try {
        await db
          .update(characters)
          .set({ invitePin: candidate })
          .where(eq(characters.id, row.id));
        break;
      } catch {
        // Ulangi bila kebetulan bertabrakan dengan PIN lain.
      }
    }
  }
}

let readyPromise: Promise<void> | null = null;

/** Pastikan seluruh tabel tersedia. Aman dipanggil berkali-kali. */
export function ensureDb(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      for (const statement of DDL) {
        await db.execute(statement);
      }
      const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      if (adminEmail) {
        await db.execute(
          sql`UPDATE "users"
              SET "is_admin" = true,
                  "character_quota" = GREATEST("character_quota", 50)
              WHERE lower("email") = ${adminEmail}`
        );
      }
      await backfillMissingCharacterPins();
    })().catch((err) => {
      // Reset supaya percobaan berikutnya bisa mencoba lagi.
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}
