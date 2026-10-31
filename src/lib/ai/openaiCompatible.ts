import { AiProviderError, type GenerateReplyInput } from "./types";

type Options = GenerateReplyInput & {
  baseUrl: string;
  providerLabel: string;
  extraHeaders?: Record<string, string>;
};

type OpenAIContentPart = Record<string, unknown>;
type OpenAIMessage = { role: string; content: string | OpenAIContentPart[] };

/**
 * Endpoint "chat/completions" bergaya OpenAI: xAI (Grok), OpenRouter, maupun
 * endpoint custom milik sendiri (LM Studio, Ollama, gateway lain).
 */
export async function generateOpenAICompatibleReply(options: Options): Promise<string> {
  const {
    apiKey,
    model,
    systemPrompt,
    history,
    userText,
    image,
    baseUrl,
    providerLabel,
    extraHeaders,
  } = options;

  if (!model) {
    throw new AiProviderError(`Model untuk ${providerLabel} belum diatur.`, { retryable: false });
  }

  const userContent: OpenAIContentPart[] = [];
  if (userText) userContent.push({ type: "text", text: userText });
  if (image) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
    });
  }
  if (userContent.length === 0) userContent.push({ type: "text", text: "(tidak ada pesan)" });

  // Kirim string biasa bila tidak ada foto supaya endpoint lokal (Ollama/LM Studio) lebih toleran.
  const hasImage = userContent.some((part) => part.type === "image_url");
  const lastUserContent: string | OpenAIContentPart[] = hasImage
    ? userContent
    : userText || "(tidak ada pesan)";

  const messages: OpenAIMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user", content: lastUserContent },
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
    const detail = text.slice(0, 350) || res.statusText;
    if (res.status === 401 || res.status === 403) {
      throw new AiProviderError(
        `${providerLabel}: API key ditolak (${res.status}). Periksa key di Pengaturan.`,
        { status: res.status, retryable: true }
      );
    }
    if (res.status === 402) {
      throw new AiProviderError(
        `${providerLabel}: saldo/kredit habis (402). Isi kredit atau ganti provider.`,
        { status: 402, retryable: true }
      );
    }
    if (res.status === 429) {
      throw new AiProviderError(
        `${providerLabel}: kuota/limit tercapai (429). Tunggu sebentar atau pakai key cadangan.`,
        { status: 429, retryable: true }
      );
    }
    throw new AiProviderError(`${providerLabel} API error (${res.status}): ${detail}`, {
      status: res.status,
    });
  }

  const data = await res.json();
  const rawContent = data?.choices?.[0]?.message?.content as unknown;
  const textOut =
    typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent
            .map((part) =>
              typeof part === "string"
                ? part
                : typeof (part as { text?: unknown })?.text === "string"
                  ? (part as { text: string }).text
                  : ""
            )
            .join("\n")
        : "";

  if (!textOut.trim()) {
    throw new AiProviderError(`${providerLabel} tidak mengembalikan teks balasan.`, {
      retryable: false,
    });
  }

  return textOut.trim();
}
