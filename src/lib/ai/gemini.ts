import { AiProviderError, type GenerateReplyInput } from "./types";

function describeGeminiError(status: number, raw: string): {
  message: string;
  retryable?: boolean;
} {
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(raw)) {
    return {
      message:
        "API key Gemini tidak valid. Ambil key baru di aistudio.google.com/apikey lalu perbarui di Pengaturan.",
      retryable: true,
    };
  }
  if (status === 401 || status === 403) {
    return {
      message: `Gemini menolak API key (${status}). Periksa key di Pengaturan.`,
      retryable: true,
    };
  }
  if (status === 404) {
    return {
      message: `Model Gemini tidak ditemukan. Coba model seperti gemini-2.5-flash. (${raw.slice(0, 160)})`,
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      message:
        "Kuota Gemini habis atau terlalu banyak permintaan (429). Tunggu sebentar atau tambahkan key cadangan.",
      retryable: true,
    };
  }
  return {
    message: `Gemini API error (${status}): ${raw.slice(0, 300)}`,
  };
}

function normalizeModelName(model: string): string {
  const clean = model.trim();
  return clean.startsWith("models/") ? clean.slice("models/".length) : clean;
}

export async function generateGeminiReply(input: GenerateReplyInput): Promise<string> {
  const { apiKey, systemPrompt, history, userText, image, enableWebSearch } = input;
  const model = normalizeModelName(input.model);

  if (!apiKey) {
    throw new AiProviderError("API key Gemini belum diisi. Buka Pengaturan untuk menambahkannya.", {
      status: 401,
      retryable: true,
    });
  }
  if (!model) {
    throw new AiProviderError("Model Gemini belum diisi (contoh: gemini-2.5-flash).", {
      retryable: false,
    });
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

  const lastContent = contents[contents.length - 1];
  if (lastContent && lastContent.role === "user") {
    lastContent.parts.push(...(currentParts as { text: string }[]));
  } else {
    contents.push({ role: "user", parts: currentParts as { text: string }[] });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const generationConfig: Record<string, unknown> = {
    temperature: 1.05,
    topP: 0.95,
    maxOutputTokens: 1024,
  };
  // Gemini 2.5 Flash menyalakan "thinking" secara bawaan; matikan supaya balasan chat cepat.
  if (/^gemini-2\.5-flash/i.test(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const sendRequest = (withGoogleSearch: boolean) => {
    const payload: Record<string, unknown> = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig,
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      ],
    };
    if (withGoogleSearch) {
      payload.tools = [{ google_search: {} }];
    }
    return fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });
  };

  let res = await sendRequest(Boolean(enableWebSearch));
  // Jika varian model Gemini tidak mendukung tool `google_search` (400), ulangi mulus tanpa tool.
  if (!res.ok && res.status === 400 && enableWebSearch) {
    res = await sendRequest(false);
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    const described = describeGeminiError(res.status, raw || res.statusText);
    throw new AiProviderError(described.message, {
      status: res.status,
      retryable: described.retryable,
    });
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts as { text?: string; thought?: boolean }[] | undefined;
  const textOut = parts
    ?.filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text ?? "")
    .join("\n")
    .trim();

  if (!textOut) {
    const finishReason = candidate?.finishReason;
    const blockReason = data?.promptFeedback?.blockReason;
    if (blockReason) {
      throw new AiProviderError(
        `Pesan diblokir filter keamanan Gemini (${blockReason}). Coba ubah kalimatnya.`,
        { retryable: false }
      );
    }
    throw new AiProviderError(
      finishReason
        ? `Gemini tidak mengembalikan teks (${finishReason}).`
        : "Gemini tidak mengembalikan teks.",
      { retryable: false }
    );
  }

  return textOut;
}
