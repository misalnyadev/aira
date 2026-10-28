export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type GenerateReplyInput = {
  apiKey: string;
  model: string;
  baseUrl?: string | null;
  systemPrompt: string;
  history: ChatTurn[];
  userText: string;
  image?: { base64: string; mimeType: string } | null;
};

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}
