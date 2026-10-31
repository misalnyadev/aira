import type { ProviderType } from "@/db/schema";

export const PROVIDER_META: Record<
  ProviderType,
  { name: string; defaultModel: string; baseUrl?: string; needsBaseUrl: boolean; keyHelpUrl: string }
> = {
  gemini: {
    name: "Google Gemini",
    defaultModel: "gemini-3.5-flash-lite",
    needsBaseUrl: false,
    keyHelpUrl: "https://aistudio.google.com/apikey",
  },
  groq: {
    name: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    baseUrl: "https://api.groq.com/openai/v1",
    needsBaseUrl: false,
    keyHelpUrl: "https://console.groq.com/keys",
  },
  openrouter: {
    name: "OpenRouter",
    defaultModel: "openai/gpt-4o-mini",
    baseUrl: "https://openrouter.ai/api/v1",
    needsBaseUrl: false,
    keyHelpUrl: "https://openrouter.ai/keys",
  },
  custom: {
    name: "Custom (OpenAI-compatible)",
    defaultModel: "",
    needsBaseUrl: true,
    keyHelpUrl: "",
  },
  // Kompatibilitas mundur bila masih ada entri lama di database sebelum ditukar ke Groq.
  grok: {
    name: "Grok (xAI)",
    defaultModel: "grok-4",
    baseUrl: "https://api.x.ai/v1",
    needsBaseUrl: false,
    keyHelpUrl: "https://console.x.ai",
  },
};

export const PROVIDER_ORDER: ProviderType[] = ["gemini", "groq", "openrouter", "custom"];

/**
 * Fallback saran awal hanya sebelum API key dideteksi secara live.
 * Begitu API key terisi / provider diedit, UI otomatis menggantinya dengan
 * hasil deteksi model yang benar-benar aktif di API key pengguna.
 */
export const RECOMMENDED_MODELS: Partial<Record<ProviderType, string[]>> = {
  gemini: ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.5-pro"],
  groq: [
    "llama-3.3-70b-versatile",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "llama-3.1-8b-instant",
  ],
  openrouter: [
    "openai/gpt-4o-mini",
    "google/gemini-3.5-flash-lite",
    "deepseek/deepseek-chat-v3-0324",
  ],
  grok: ["grok-4", "grok-3-mini"],
};
