import type { BubbleStyle } from "@/lib/bubbleStyle";
import type { CallEmotion } from "@/lib/callEmotion";
import type { CharacterMedia } from "@/lib/characterMedia";
import type { ChatBackground } from "@/lib/chatBackground";
import type { CharacterVoiceConfig } from "@/lib/hdVoice";

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
  greeting: string;
  /** Ada bible peran atau tidak — dipakai untuk menandai 📖 di daftar. */
  hasBible: boolean;
  /** Latar khusus karakter; `null` berarti ikut latar bawaan akun. */
  chatBackground: ChatBackground | null;
  /** Gaya gelembung khusus karakter; `null` berarti ikut gelembung bawaan akun. */
  bubbleStyle: BubbleStyle | null;
  /** Media karakter (video chat, video call, suara telepon). */
  media: CharacterMedia | null;
  /** Pilihan suara khusus karakter; `null` berarti ikut mesin bawaan akun. */
  voiceConfig: CharacterVoiceConfig | null;
  /** Apakah ingatan jangka panjang & kesadaran waktu aktif pada karakter ini. */
  memoryEnabled: boolean;
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
  personality: string;
  /** Naskah bible peran; kosong kalau belum diimpor. */
  bible: string;
  greeting: string;
  providerId: string | null;
  model: string | null;
  chatBackground: ChatBackground | null;
  bubbleStyle: BubbleStyle | null;
  media: CharacterMedia | null;
  voiceConfig: CharacterVoiceConfig | null;
  memoryEnabled: boolean;
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

export type BrainstormMemberSummary = {
  characterId: string;
  name: string;
  avatarUrl: string | null;
  shortBio: string;
};

export type BrainstormRoomSummary = {
  id: string;
  title: string;
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
