import { AiProviderError, type GenerateReplyInput } from "./types";

export async function generateGeminiReply(input: GenerateReplyInput): Promise<string> {
  const { apiKey, model, systemPrompt, history, userText, image } = input;

  if (!apiKey) {
    throw new AiProviderError("API key Gemini belum diisi. Buka Pengaturan untuk menambahkannya.");
  }

  const contents = history.map((turn) => ({
    role: turn.role === "assistant" ? "model" : "user",
    parts: [{ text: turn.content }],
  }));

  const currentParts: Record<string, unknown>[] = [];
  if (userText) currentParts.push({ text: userText });
  if (image) {
    currentParts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.base64,
      },
    });
  }
  if (currentParts.length === 0) currentParts.push({ text: "(tidak ada pesan)" });

  contents.push({ role: "user", parts: currentParts as { text: string }[] });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        temperature: 1.05,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AiProviderError(
      `Gemini API error (${res.status}): ${text.slice(0, 400) || res.statusText}`
    );
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts as { text?: string }[] | undefined;
  const textOut = parts?.map((p) => p.text ?? "").join("\n").trim();

  if (!textOut) {
    const finishReason = candidate?.finishReason;
    throw new AiProviderError(
      finishReason
        ? `Gemini tidak mengembalikan teks (finishReason: ${finishReason}).`
        : "Gemini tidak mengembalikan teks."
    );
  }

  return textOut;
}
