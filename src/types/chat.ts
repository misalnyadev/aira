import type { BubbleStyle } from "@/lib/bubbleStyle";
import type { CallEmotion } from "@/lib/callEmotion";
import type { CharacterMedia } from "@/lib/characterMedia";
import type { ChatBackground } from "@/lib/chatBackground";
import type { CharacterVoiceConfig } from "@/lib/hdVoice";
import type { OwnerProfileShareField } from "@/lib/characterInvite";
import type { CharacterSkill } from "@/lib/characterSkills";

export type ProviderType = "gemini" | "groq" | "openrouter" | "custom" | "grok";

export type ProviderSummary = {
  id: string;
  type: ProviderType;
  label: string;
  baseUrl: string | null;
  model: string;
  isDefault: boolean;
  hasKey: boolean;
  maskedKey: string;
  /** Banyaknya key cadangan tersimpan (di luar key utama). */
  backupCount: number;
  /** Daftar samaran key cadangan untuk ditampilkan saat edit. */
  maskedBackupKeys: string[];
  createdAt: string;
};

export type ThreadKind = "owned" | "guest_contact" | "owner_contact";

export type CharacterSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
  shortBio: string;
  /** Portofolio keahlian dan layanan yang diatur pemilik karakter. */
  skillPortfolio?: CharacterSkill[];
  greeting: string;
  /** Ada bible peran atau tidak — dipakai untuk menandai 📖 di daftar. */
  hasBible: boolean;
  /** Tampilan per-mode milik karakter; null hanya untuk utas kontak tanpa karakter pribadi. */
  chatBackground: ChatBackground | null;
  meetupBackground: ChatBackground | null;
  bubbleStyle: BubbleStyle | null;
  meetupBubbleStyle: BubbleStyle | null;
  /** Media karakter (video chat, video call, suara telepon). */
  media: CharacterMedia | null;
  /** Pilihan suara khusus karakter; `null` berarti ikut mesin bawaan akun. */
  voiceConfig: CharacterVoiceConfig | null;
  /** Apakah ingatan jangka panjang & kesadaran waktu aktif pada karakter ini. */
  memoryEnabled: boolean;
  /** Peran karakter dalam Tim 1 pemiliknya. */
  teamRole: string;
  /** Apakah konteks Tim 1 boleh dibawa saat karakter diundang pengguna lain. */
  shareTeamMemory: boolean;
  /** Apakah akses browsing internet & pembaca link aktif pada karakter ini. */
  browsingEnabled: boolean;
  /** Apakah sapaan duluan otomatis (Proactive Check-In) aktif pada karakter ini. */
  proactiveEnabled?: boolean;
  /** Kode PIN bawaan karakter (tampil pada karakter milik sendiri). */
  invitePin?: string | null;
  /** Jenis utas di daftar kontak Chat (`owned`, `guest_contact`, atau `owner_contact`). */
  threadKind?: ThreadKind;
  /** ID baris `character_contacts` bila ini utas kontak 2 arah. */
  contactId?: string;
  /** ID karakter asli bila ini utas kontak 2 arah. */
  sourceCharacterId?: string;
  /** Nama lawan bicara (pemilik karakter / tamu pengundang). */
  partnerName?: string;
  /** Nama karakter yang terhubung pada utas kontak 2 arah. */
  contactCharacterName?: string;
  /** Apakah balasan AI otomatis sedang aktif pada utas kontak ini. */
  aiAutoReply?: boolean;
  preview: string;
  updatedAt: string;
};

export type CharacterDetail = {
  id: string;
  name: string;
  avatarUrl: string | null;
  shortBio: string;
  skillPortfolio: CharacterSkill[];
  personality: string;
  /** Naskah bible peran; kosong kalau belum diimpor. */
  bible: string;
  /** Relasi pribadi karakter dengan akun pemilik; tidak dibagikan ke pengguna undangan. */
  ownerRelationship: string;
  greeting: string;
  providerId: string | null;
  model: string | null;
  chatBackground: ChatBackground;
  meetupBackground: ChatBackground;
  bubbleStyle: BubbleStyle;
  meetupBubbleStyle: BubbleStyle;
  media: CharacterMedia | null;
  voiceConfig: CharacterVoiceConfig | null;
  memoryEnabled: boolean;
  teamRole: string;
  sharedTeamMemory: string;
  shareTeamMemory: boolean;
  /** Field profil pemilik yang boleh masuk ke brief undangan karakter ini. */
  shareOwnerProfileFields: OwnerProfileShareField[];
  memorySummary: string;
  memoryUpdatedAt: string | null;
  browsingEnabled: boolean;
  proactiveEnabled: boolean;
  invitePin?: string | null;
};

export type ChatMessage = {
  id: string;
  characterId: string;
  role: "user" | "assistant";
  content: string;
  imageUrl: string | null;
  isVoiceNote?: boolean;
  status: string;
  createdAt: string;
  pending?: boolean;
  emotion?: CallEmotion;
  /** Pesan diagnostik panggilan yang hanya muncul di UI chat dan tidak disimpan ke server. */
  isCallError?: boolean;
  /** Asal pengirim pada ruang obrolan kontak 2 arah. */
  senderKind?: "guest" | "character_ai" | "owner_manual";
};

export type QuotaDiscussionMessage = {
  id: string;
  senderRole: "admin" | "member";
  senderName: string;
  text: string;
  createdAt: string;
};

export type QuotaRequestSummary = {
  id: string;
  requestedQuota: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | string;
  adminNote: string;
  discussion?: QuotaDiscussionMessage[];
  createdAt: string;
  resolvedAt?: string | null;
};

export type IncomingContactItem = {
  id: string;
  characterId: string;
  characterName: string;
  characterAvatarUrl: string | null;
  guestUserId: string;
  guestName: string;
  guestEmail: string;
  guestAvatarUrl: string | null;
  adminStatus: string;
  ownerStatus: string;
  aiAutoReply: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type OutgoingContactItem = {
  id: string;
  characterId: string;
  characterName: string;
  characterAvatarUrl: string | null;
  characterShortBio: string;
  ownerUserId: string;
  ownerName: string;
  adminStatus: string;
  ownerStatus: string;
  aiAutoReply: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactInvitePreview = {
  characterName: string;
  characterAvatarUrl: string | null;
  characterShortBio: string;
  skillPortfolio: CharacterSkill[];
};

/** `meetup` remains for legacy rows; new group scenes use `scene`. */
export type BrainstormRoomMode = "brainstorm" | "scene" | "meetup";

export type BrainstormMemberSummary = {
  characterId: string;
  name: string;
  avatarUrl: string | null;
  shortBio: string;
};

export type BrainstormRoomSummary = {
  id: string;
  title: string;
  mode: BrainstormRoomMode;
  /** Hanya relevan untuk `scene`: apakah adegan dianggap bagian dari cerita utama. */
  sceneCanonical: boolean;
  members: BrainstormMemberSummary[];
  preview: string;
  updatedAt: string;
  messageCount: number;
};

export type BrainstormMessage = {
  id: string;
  roomId: string;
  role: "user" | "assistant";
  characterId: string | null;
  characterName?: string | null;
  characterAvatarUrl?: string | null;
  content: string;
  imageUrl: string | null;
  isVoiceNote?: boolean;
  emotion?: string | null;
  createdAt: string;
};
