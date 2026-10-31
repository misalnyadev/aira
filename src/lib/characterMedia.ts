/**
 * Media pribadi karakter yang disimpan di Cloudflare R2.
 *
 * Database hanya menyimpan `key` objek R2 dan pengaturan tampilannya, bukan isi
 * file video/suara — sehingga kuota Neon tetap ringan dan video bisa di-stream.
 */
export type CharacterMedia = {
  /** Kunci objek R2 untuk klip video saat mengobrol. */
  chatVideoKey?: string;
  /** Poster bingkai pertama (`/api/attachments/...` atau `/uploads/...`). */
  chatVideoPosterUrl?: string;
  /** `tile` = panel 16:9 di atas pesan, `full` = latar penuh ruang chat. */
  chatVideoLayout?: "tile" | "full";
  /** Kunci objek R2 untuk klip adegan video call. */
  callVideoKey?: string;
  /** Poster bingkai pertama video call. */
  callVideoPosterUrl?: string;
  /** Perbesaran video call (100–200%) untuk memotong bingkai hitam di tepi. */
  callVideoZoom?: number;
  /** Kunci objek R2 untuk rekaman suara panggilan telepon. */
  callAudioKey?: string;
  /** Nama file rekaman suara untuk ditampilkan di profil karakter. */
  callAudioName?: string;
};

const SAFE_KEY_FORMAT =
  /^media\/([0-9a-f-]{36})\/[0-9a-f-]{36}\/(chatVideo|callVideo|callAudio)-[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

function cleanMediaKey(value: unknown, expectedUserId?: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  const match = SAFE_KEY_FORMAT.exec(trimmed);
  if (!match) return undefined;
  if (expectedUserId && match[1] !== expectedUserId) return undefined;
  return trimmed;
}

function cleanPosterUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4800) return undefined;
  if (/["'\\)]/.test(trimmed)) return undefined;
  const ok =
    trimmed.startsWith("/api/attachments/") ||
    trimmed.startsWith("/uploads/") ||
    trimmed.startsWith("data:image/");
  return ok ? trimmed : undefined;
}

/**
 * Bersihkan objek `CharacterMedia` dari klien atau database.
 * Mengembalikan `null` bila semua slot media kosong.
 */
export function normalizeCharacterMedia(
  input: unknown,
  expectedUserId?: string
): CharacterMedia | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const chatVideoKey = cleanMediaKey(raw.chatVideoKey, expectedUserId);
  const callVideoKey = cleanMediaKey(raw.callVideoKey, expectedUserId);
  const callAudioKey = cleanMediaKey(raw.callAudioKey, expectedUserId);

  if (!chatVideoKey && !callVideoKey && !callAudioKey) {
    return null;
  }

  const result: CharacterMedia = {};

  if (chatVideoKey) {
    result.chatVideoKey = chatVideoKey;
    const poster = cleanPosterUrl(raw.chatVideoPosterUrl);
    if (poster) result.chatVideoPosterUrl = poster;
    result.chatVideoLayout = raw.chatVideoLayout === "full" ? "full" : "tile";
  }

  if (callVideoKey) {
    result.callVideoKey = callVideoKey;
    const poster = cleanPosterUrl(raw.callVideoPosterUrl);
    if (poster) result.callVideoPosterUrl = poster;
    const zoomRaw =
      typeof raw.callVideoZoom === "number" && Number.isFinite(raw.callVideoZoom)
        ? raw.callVideoZoom
        : 100;
    result.callVideoZoom = Math.min(200, Math.max(100, Math.round(zoomRaw)));
  }

  if (callAudioKey) {
    result.callAudioKey = callAudioKey;
    if (typeof raw.callAudioName === "string" && raw.callAudioName.trim()) {
      result.callAudioName = raw.callAudioName.trim().slice(0, 160);
    }
  }

  return result;
}

export function parseCharacterMedia(json: string | null | undefined): CharacterMedia | null {
  if (!json) return null;
  try {
    return normalizeCharacterMedia(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Daftar seluruh kunci objek R2 yang sedang dipakai oleh karakter ini. */
export function collectMediaKeys(media: CharacterMedia | null | undefined): string[] {
  if (!media) return [];
  const keys: string[] = [];
  if (media.chatVideoKey) keys.push(media.chatVideoKey);
  if (media.callVideoKey) keys.push(media.callVideoKey);
  if (media.callAudioKey) keys.push(media.callAudioKey);
  return keys;
}
