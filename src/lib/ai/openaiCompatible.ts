import { AiProviderError, type GenerateReplyInput } from "./types";

type Options = GenerateReplyInput & {
  baseUrl: string;
  providerLabel: string;
  extraHeaders?: Record<string, string>;
};

/**
 * Works for any OpenAI "chat/completions"-compatible endpoint: xAI (Grok),
 * OpenRouter, and arbitrary custom/self-hosted endpoints (LM Studio, Ollama
 * OpenAI shim, Groq-cloud, etc.)
 */
export async function generateOpenAICompatibleReply(options: Options): Promise<string> {
  const { apiKey, model, systemPrompt, history, userText, image, baseUrl, providerLabel, extraHeaders } =
    options;

  if (!model) {
    throw new AiProviderError(`Model untuk ${providerLabel} belum diatur.`);
  }

  const userContent: Record<string, unknown>[] = [];
  if (userText) userContent.push({ type: "text", text: userText });
  if (image) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
    });
  }
  if (userContent.length === 0) userContent.push({ type: "text", text: "(tidak ada pesan)" });

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user", content: userContent },
  ];

  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: 1.0,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AiProviderError(
      `${providerLabel} API error (${res.status}): ${text.slice(0, 400) || res.statusText}`
    );
  }

  const data = await res.json();
  const textOut: string | undefined = data?.choices?.[0]?.message?.content;

  if (!textOut || !textOut.trim()) {
    throw new AiProviderError(`${providerLabel} tidak mengembalikan teks balasan.`);
  }

  return textOut.trim();
}
