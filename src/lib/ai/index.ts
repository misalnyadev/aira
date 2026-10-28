import type { ProviderType } from "@/db/schema";
import { generateGeminiReply } from "./gemini";
import { generateOpenAICompatibleReply } from "./openaiCompatible";
import { PROVIDER_META } from "./providerDefaults";
import { AiProviderError, type GenerateReplyInput } from "./types";

export { AiProviderError };
export { buildSystemPrompt, splitIntoBubbles, BUBBLE_DELIMITER } from "./promptBuilder";
export type { ChatTurn } from "./types";

export async function generateCharacterReply(
  providerType: ProviderType,
  input: GenerateReplyInput
): Promise<string> {
  switch (providerType) {
    case "gemini":
      return generateGeminiReply(input);
    case "grok":
      return generateOpenAICompatibleReply({
        ...input,
        baseUrl: input.baseUrl || PROVIDER_META.grok.baseUrl!,
        providerLabel: "Grok (xAI)",
      });
    case "openrouter":
      return generateOpenAICompatibleReply({
        ...input,
        baseUrl: input.baseUrl || PROVIDER_META.openrouter.baseUrl!,
        providerLabel: "OpenRouter",
        extraHeaders: {
          "HTTP-Referer": "http://localhost",
          "X-Title": "Persona Chat",
        },
      });
    case "custom": {
      if (!input.baseUrl) {
        throw new AiProviderError("Base URL untuk provider custom belum diatur.");
      }
      return generateOpenAICompatibleReply({
        ...input,
        baseUrl: input.baseUrl,
        providerLabel: "Custom Provider",
      });
    }
    default:
      throw new AiProviderError(`Provider tidak dikenal: ${providerType}`);
  }
}
