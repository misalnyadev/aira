export type ProviderType = "gemini" | "grok" | "openrouter" | "custom";

export type ProviderSummary = {
  id: string;
  type: ProviderType;
  label: string;
  baseUrl: string | null;
  model: string;
  isDefault: boolean;
  hasKey: boolean;
  maskedKey: string;
  createdAt: string;
};

export type CharacterSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
  shortBio: string;
  /** Ada bible peran atau tidak — dipakai untuk menandai 📖 di daftar. */
  hasBible: boolean;
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
