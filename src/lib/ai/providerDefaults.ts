import type { ProviderType } from "@/db/schema";

export const PROVIDER_META: Record<
  ProviderType,
  { name: string; defaultModel: string; baseUrl?: string; needsBaseUrl: boolean; keyHelpUrl: string }
> = {
  gemini: {
    name: "Google Gemini",
    defaultModel: "gemini-2.5-flash",
    needsBaseUrl: false,
    keyHelpUrl: "https://aistudio.google.com/apikey",
  },
  grok: {
    name: "Grok (xAI)",
    defaultModel: "grok-4",
    baseUrl: "https://api.x.ai/v1",
    needsBaseUrl: false,
    keyHelpUrl: "https://console.x.ai",
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
};

export const PROVIDER_ORDER: ProviderType[] = ["gemini", "grok", "openrouter", "custom"];
