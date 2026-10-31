import type { ProviderType } from "@/db/schema";
import { generateGeminiReply } from "./gemini";
import { generateOpenAICompatibleReply } from "./openaiCompatible";
import { PROVIDER_META } from "./providerDefaults";
import {
  AiProviderError,
  isKeyRotatableError,
  isProviderFallbackError,
  toUserFacingError,
  type GenerateReplyInput,
} from "./types";

export { AiProviderError, isKeyRotatableError, isProviderFallbackError, toUserFacingError };
export {
  buildSystemPrompt,
  splitIntoBubbles,
  BUBBLE_DELIMITER,
  type MemoryPromptContext,
} from "./promptBuilder";
export type { ChatTurn } from "./types";

export async function generateCharacterReply(
  providerType: ProviderType,
  input: GenerateReplyInput
): Promise<string> {
  switch (providerType) {
    case "gemini":
      return generateGeminiReply(input);
    case "groq":
      return generateOpenAICompatibleReply({
        ...input,
        baseUrl: input.baseUrl || PROVIDER_META.groq.baseUrl!,
        providerLabel: "Groq",
      });
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
          "X-Title": "Aisherly",
        },
      });
    case "custom": {
      if (!input.baseUrl) {
        throw new AiProviderError("Base URL untuk provider custom belum diatur.", {
          retryable: false,
        });
      }
      return generateOpenAICompatibleReply({
        ...input,
        baseUrl: input.baseUrl,
        providerLabel: "Custom Provider",
      });
    }
    default:
      throw new AiProviderError(`Provider tidak dikenal: ${providerType}`, { retryable: false });
  }
}
