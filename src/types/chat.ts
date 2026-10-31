import type { BubbleStyle } from "@/lib/bubbleStyle";
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
};

export type ChatMessage = {
  id: string;
  characterId: string;
  role: "user" | "assistant";
  content: string;
  imageUrl: string | null;
  status: string;
  createdAt: string;
  pending?: boolean;
};
