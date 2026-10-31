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
  /** Kode HTTP dari penyedia AI, bila ada. */
  status?: number;
  /** true = layak dicoba ulang dengan key cadangan di provider yang sama. */
  retryable?: boolean;
  /** true = layak dicoba ke provider cadangan lain walau key yang sama tidak perlu diulang. */
  providerFallback?: boolean;

  constructor(
    message: string,
    options?: { status?: number; retryable?: boolean; providerFallback?: boolean }
  ) {
    super(message);
    this.name = "AiProviderError";
    this.status = options?.status;
    this.retryable = options?.retryable;
    this.providerFallback = options?.providerFallback;
  }
}

/** Kode HTTP yang biasanya pulih kalau API key diganti (limit, key mati, gangguan server). */
const KEY_ROTATABLE_STATUS = new Set([401, 403, 408, 409, 425, 429, 500, 502, 503, 504, 529]);

/** Kode HTTP tambahan yang layak dicoba ke PROVIDER LAIN (mis. saldo habis atau model tak ada). */
const PROVIDER_FALLBACK_STATUS = new Set([...KEY_ROTATABLE_STATUS, 402, 404]);

const NETWORK_ERROR_RE =
  /fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|network|terminated|timeout|aborted|UND_ERR/i;

/** Apakah kegagalan ini layak dicoba lagi dengan API key cadangan berikutnya di provider yang sama. */
export function isKeyRotatableError(err: unknown): boolean {
  if (err instanceof AiProviderError) {
    if (err.retryable !== undefined) return err.retryable;
    if (err.status !== undefined) return KEY_ROTATABLE_STATUS.has(err.status);
    return false;
  }
  const message = err instanceof Error ? err.message : "";
  return NETWORK_ERROR_RE.test(message);
}

/** Apakah kegagalan ini layak dialihkan ke provider cadangan lain saat auto-fallback menyala. */
export function isProviderFallbackError(err: unknown): boolean {
  if (isKeyRotatableError(err)) return true;
  if (err instanceof AiProviderError) {
    if (err.providerFallback) return true;
    if (err.status !== undefined) return PROVIDER_FALLBACK_STATUS.has(err.status);
  }
  return false;
}

/** Ubah error mentah fetch/jaringan menjadi kalimat yang mudah dipahami pengguna. */
export function toUserFacingError(
  err: unknown,
  fallback = "Gagal menghubungi penyedia AI. Coba lagi."
): string {
  if (err instanceof AiProviderError) return err.message;

  const message = err instanceof Error ? err.message : "";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|network|terminated/i.test(message)) {
    return "Tidak bisa menghubungi penyedia AI (masalah jaringan/URL). Periksa Base URL atau koneksi.";
  }
  if (/timeout|aborted|UND_ERR/i.test(message)) {
    return "Penyedia AI terlalu lama merespons. Coba model yang lebih ringan atau ulangi.";
  }
  return fallback;
}
