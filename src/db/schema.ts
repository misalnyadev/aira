import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { generateCharacterPin } from "@/lib/contactPin";

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
  gender: text("gender").notNull().default(""),
  age: integer("age"),
  occupation: text("occupation").notNull().default(""),
  about: text("about").notNull().default(""),
  /** Foto profil pengguna (`/api/attachments/{id}` atau `/uploads/...`). */
  avatarUrl: text("avatar_url"),

  /** Pindah otomatis ke provider lain saat semua key provider utama kena limit/gagal. */
  autoFallback: boolean("auto_fallback").notNull().default(true),

  /** Data tampilan lama milik akun; dipertahankan untuk backfill per-karakter. */
  chatBackground: text("chat_background").notNull().default('{"kind":"default"}'),
  /** Data tampilan lama Tatap Muka; bukan lagi sumber tampilan runtime. */
  meetupBackground: text("meetup_background"),
  /** Data gaya gelembung lama untuk Chat; dipertahankan untuk backfill per-karakter. */
  bubbleStyle: text("bubble_style")
    .notNull()
    .default(
      '{"glass":false,"opacity":70,"textColorIn":null,"bgColorIn":null,"textColorOut":null,"bgColorOut":null}'
    ),
  /** Data gaya gelembung lama Tatap Muka; bukan lagi sumber tampilan runtime. */
  meetupBubbleStyle: text("meetup_bubble_style"),
  /** Pengaturan Suara HD (ElevenLabs) milik akun: API key, key cadangan, dan 2 slot suara (JSON). */
  ttsConfig: text("tts_config").notNull().default("{}"),

  /** Status Admin — hanya Admin yang bebas membuat banyak karakter & menyetujui kuota user. */
  isAdmin: boolean("is_admin").notNull().default(false),
  /** Kuota maksimal pembuatan karakter milik sendiri (bawaan 1 untuk user biasa). */
  characterQuota: integer("character_quota").notNull().default(1),

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
  gender: text("gender").notNull().default(""),
  /** Bisa berupa path `/uploads/...` (lokal) atau `/api/attachments/{id}` (Vercel). */
  avatarUrl: text("avatar_url"),
  shortBio: text("short_bio").notNull().default(""),
  personality: text("personality").notNull().default(""),
  /**
   * Bible peran — naskah lengkap karakter yang diimpor dari berkas.
   * Kalau terisi, isinya jadi acuan utama di atas ringkasan kepribadian.
   */
  bible: text("bible").notNull().default(""),
  /** Relasi khusus karakter dengan pemiliknya; hanya dimasukkan ke prompt saat pemilik yang berbicara. */
  ownerRelationship: text("owner_relationship").notNull().default(""),
  greeting: text("greeting").notNull().default(""),
  providerId: uuid("provider_id").references(() => apiProviders.id, {
    onDelete: "set null",
  }),
  model: text("model"),
  /** Tampilan Chat milik karakter (JSON); karakter baru memakai tampilan default. */
  chatBackground: text("chat_background").notNull().default('{"kind":"default"}'),
  /** Tampilan Tatap Muka milik karakter (JSON); karakter baru memakai tampilan default. */
  meetupBackground: text("meetup_background").notNull().default('{"kind":"default"}'),
  /** Gaya gelembung Chat milik karakter (JSON). */
  bubbleStyle: text("bubble_style")
    .notNull()
    .default(
      '{"glass":false,"opacity":70,"textColorIn":null,"bgColorIn":null,"textColorOut":null,"bgColorOut":null,"hideMessages":false,"minimalBars":false}'
    ),
  /** Gaya gelembung Tatap Muka milik karakter (JSON). */
  meetupBubbleStyle: text("meetup_bubble_style")
    .notNull()
    .default(
      '{"glass":false,"opacity":70,"textColorIn":null,"bgColorIn":null,"textColorOut":null,"bgColorOut":null,"hideMessages":false,"minimalBars":false}'
    ),
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
  /** Peran karakter di Tim 1 pemiliknya; boleh dibagikan bila konteks tim diaktifkan. */
  teamRole: text("team_role").notNull().default(""),
  /** Catatan inti tentang rekan/relasi tim yang berbeda dari memori chat privat. */
  sharedTeamMemory: text("shared_team_memory").notNull().default(""),
  /** Izin agar peran, roster, dan catatan Tim 1 ikut saat karakter diundang pengguna lain. */
  shareTeamMemory: boolean("share_team_memory").notNull().default(false),
  /** Field profil pemilik yang boleh dibagikan dalam brief undangan (JSON array). */
  shareOwnerProfileFields: text("share_owner_profile_fields").notNull().default("[]"),
  /** Daftar keahlian dan layanan talent karakter (JSON array). */
  skillPortfolio: text("skill_portfolio").notNull().default("[]"),
  /** Aktifkan akses browsing internet & pembaca link URL pada karakter ini. */
  browsingEnabled: boolean("browsing_enabled").notNull().default(false),
  /** Aktifkan inisiatif karakter menyapa duluan secara alami saat chat dibuka setelah jeda lama. */
  proactiveEnabled: boolean("proactive_enabled").notNull().default(false),
  /** Waktu terakhir karakter mengirim sapaan duluan otomatis (penjaga anti-spam). */
  proactiveLastAt: timestamp("proactive_last_at", { withTimezone: true }),
  /** Kode PIN bawaan karakter untuk diundang sebagai kontak oleh pengguna lain. */
  invitePin: text("invite_pin")
    .unique()
    .$defaultFn(() => generateCharacterPin()),
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
  /** Apakah gelembung ini berupa Pesan Suara / Voice Note (VN). */
  isVoiceNote: boolean("is_voice_note").notNull().default(false),
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

/**
 * Permintaan penambahan kuota karakter dari pengguna standar ke Admin.
 */
export const characterQuotaRequests = pgTable("character_quota_requests", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  requestedQuota: integer("requested_quota").notNull(),
  reason: text("reason").notNull().default(""),
  /** 'pending' | 'approved' | 'rejected' */
    status: text("status").notNull().default("pending"),
    adminNote: text("admin_note").notNull().default(""),
    discussion: text("discussion").notNull().default("[]"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Sambungan kontak karakter antar-pengguna melalui PIN Karakter.
 *
 * Sebuah sambungan kontak hanya aktif (`active`) bila:
 *   `admin_status = 'approved'` DAN `owner_status = 'approved'`.
 */
export const characterContacts = pgTable(
  "character_contacts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    guestUserId: uuid("guest_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 'approved' | 'rejected' — otomatis disetujui saat member saling mengundang */
    adminStatus: text("admin_status").notNull().default("approved"),
    /** 'pending' | 'approved' | 'rejected' | 'blocked' — kendali pemilik karakter */
    ownerStatus: text("owner_status").notNull().default("pending"),
    /** Jika true, AI karakter membalas otomatis memakai API key pengundang. */
    aiAutoReply: boolean("ai_auto_reply").notNull().default(true),
    /** Catatan sapaan dari pengundang saat memasukkan PIN. */
    note: text("note").notNull().default(""),
    /** Buku ingatan terpisah khusus antara karakter & pengundang ini. */
    memorySummary: text("memory_summary").notNull().default(""),
    memoryThroughAt: timestamp("memory_through_at", { withTimezone: true }),
    memoryUpdatedAt: timestamp("memory_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("character_contacts_char_guest_idx").on(
      table.characterId,
      table.guestUserId
    ),
  ]
);

/**
 * Riwayat obrolan 2 arah pada sebuah kontak karakter (terisolasi per kontak).
 * `sender_kind`:
 *   - 'guest'        : pesan dari pengguna pengundang
 *   - 'character_ai' : balasan otomatis AI karakter (memakai API key pengundang)
 *   - 'owner_manual' : balasan manual langsung dari pemilik karakter tanpa AI
 */
export const contactMessages = pgTable("contact_messages", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => characterContacts.id, { onDelete: "cascade" }),
  senderKind: text("sender_kind").notNull(),
    content: text("content").notNull().default(""),
    imageUrl: text("image_url"),
    isVoiceNote: boolean("is_voice_note").notNull().default(false),
    status: text("status").notNull().default("sent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Papan "Catatan & Janji Kita" per karakter & per akun pengguna.
 *
 * `user_id` menyimpan pemilik papan ini (pemilik karakter saat chat pribadi,
 * atau pengundang saat chat di ruang Kontak 2 Arah) sehingga catatan tetap
 * privat per pasangan lawan bicara.
 */
export const characterNotes = pgTable("character_notes", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  characterId: uuid("character_id")
    .notNull()
    .references(() => characters.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** 'promise' | 'idea' | 'plan' | 'link' */
  kind: text("kind").notNull().default("plan"),
  title: text("title").notNull().default(""),
  /** Tanggal target kalender WIB ('YYYY-MM-DD') atau null. */
  dueDate: text("due_date"),
  url: text("url"),
  done: boolean("done").notNull().default(false),
  /** 'auto' | 'manual' */
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Pengaturan global aplikasi yang dikelola oleh Admin (mis. override kode undangan pendaftaran).
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Ruang Brainstorm milik satu pengguna. Baris mode `meetup` hanya dipertahankan untuk data lama;
 * Tatap Muka baru memakai riwayat `messages` per karakter.
 */
export const brainstormRooms = pgTable("brainstorm_rooms", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  /** 'brainstorm' | 'scene' | 'meetup' (legacy). */
  mode: text("mode").notNull().default("brainstorm"),
  /** Adegan `scene` menjadi bagian cerita utama; false berarti latihan. */
  sceneCanonical: boolean("scene_canonical").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const brainstormRoomMembers = pgTable(
  "brainstorm_room_members",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    roomId: uuid("room_id")
      .notNull()
      .references(() => brainstormRooms.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("brainstorm_room_members_room_char_idx").on(table.roomId, table.characterId)]
);

export const brainstormMessages = pgTable("brainstorm_messages", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  roomId: uuid("room_id")
    .notNull()
    .references(() => brainstormRooms.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  /** Karakter yang berbicara (null untuk pesan user). */
  characterId: uuid("character_id"),
  content: text("content").notNull().default(""),
  imageUrl: text("image_url"),
  /** Nama & teks hasil ekstraksi dokumen; berkas aslinya tidak disimpan. */
  attachmentName: text("attachment_name"),
  attachmentText: text("attachment_text"),
  isVoiceNote: boolean("is_voice_note").notNull().default(false),
  /** Emosi yang terdeteksi (untuk sinkron klip video/voice). */
  emotion: text("emotion"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Ringkasan lintas mode per karakter peserta. Mengikuti pengaturan ingatan karakter;
 * sumber pesan/ruang membuatnya terhapus saat pengguna menghapus sesi tersebut.
 */
export const characterContinuityMemories = pgTable(
  "character_continuity_memories",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    sourceRoomId: uuid("source_room_id")
      .notNull()
      .references(() => brainstormRooms.id, { onDelete: "cascade" }),
    sourceMessageId: uuid("source_message_id")
      .notNull()
      .references(() => brainstormMessages.id, { onDelete: "cascade" }),
    sourceMode: text("source_mode").notNull(),
    continuityStatus: text("continuity_status").notNull(),
    title: text("title").notNull().default(""),
    summary: text("summary").notNull().default(""),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("continuity_memories_char_message_idx").on(
      table.characterId,
      table.sourceMessageId
    ),
    index("continuity_memories_user_char_time_idx").on(
      table.userId,
      table.characterId,
      table.occurredAt
    ),
  ]
);

/**
 * Status/Reels ala WA & IG — story 24 jam & feed permanen.
 * `characterId = null` berarti status milik akun user sendiri,
 * selain itu milik karakter yang di-own user tersebut.
 * `kind`: 'status' (hilang 24 jam) | 'reel' (permanen feed)
 * `mediaType`: 'text' | 'image' | 'video'
 */
export const characterStatuses = pgTable("character_statuses", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  characterId: uuid("character_id").references(() => characters.id, {
    onDelete: "cascade",
  }),
  kind: text("kind").notNull().default("status"),
  mediaType: text("media_type").notNull().default("text"),
  caption: text("caption").notNull().default(""),
  content: text("content").notNull().default(""),
  imageUrl: text("image_url"),
  videoKey: text("video_key"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const statusLikes = pgTable(
  "status_likes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    statusId: uuid("status_id")
      .notNull()
      .references(() => characterStatuses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("status_likes_status_user_idx").on(t.statusId, t.userId)]
);

export const statusComments = pgTable("status_comments", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  statusId: uuid("status_id")
    .notNull()
    .references(() => characterStatuses.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  parentCommentId: uuid("parent_comment_id").references((): AnyPgColumn => statusComments.id, {
    onDelete: "cascade",
  }),
  imageUrl: text("image_url"),
  content: text("content").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const statusCommentLikes = pgTable(
  "status_comment_likes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => statusComments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("status_comment_likes_comment_user_idx").on(t.commentId, t.userId)]
);

export const statusViews = pgTable(
  "status_views",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    statusId: uuid("status_id")
      .notNull()
      .references(() => characterStatuses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("status_views_status_user_idx").on(t.statusId, t.userId)]
);

export const statusBookmarks = pgTable(
  "status_bookmarks",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    statusId: uuid("status_id")
      .notNull()
      .references(() => characterStatuses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("status_bookmarks_status_user_idx").on(t.statusId, t.userId)]
);

export const statusFollows = pgTable(
  "status_follows",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    followerUserId: uuid("follower_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "cascade" }),
    targetCharacterId: uuid("target_character_id").references(() => characters.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("status_follows_follower_user_idx").on(t.followerUserId, t.targetUserId),
    uniqueIndex("status_follows_follower_character_idx").on(t.followerUserId, t.targetCharacterId),
    check(
      "status_follows_one_target_check",
      sql`num_nonnulls(${t.targetUserId}, ${t.targetCharacterId}) = 1`
    ),
  ]
);

