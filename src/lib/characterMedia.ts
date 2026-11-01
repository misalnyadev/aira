import type { CallEmotion } from "./callEmotion";

/**
 * Media pribadi karakter yang disimpan di Cloudflare R2.
 *
 * Database hanya menyimpan `key` objek R2 dan pengaturan tampilannya, bukan isi
 * file video/suara — sehingga kuota Neon tetap ringan dan video bisa di-stream.
 */

export const CALL_CLIP_SLOTS = [
  "listening",
  "thinking",
  "talking",
  "laugh",
  "shy",
  "pout",
] as const;

export type CallClipSlot = (typeof CALL_CLIP_SLOTS)[number];

export type CallClipItem = {
  key: string;
  posterUrl?: string;
};

export type CallClips = Partial<Record<CallClipSlot, CallClipItem>>;

export type CharacterMedia = {
  /** Kunci objek R2 untuk klip video saat mengobrol di ruang chat. */
  chatVideoKey?: string;
  /** Poster bingkai pertama (`/api/attachments/...` atau `/uploads/...`). */
  chatVideoPosterUrl?: string;
  /** `tile` = panel 16:9 di atas pesan, `full` = latar penuh ruang chat. */
  chatVideoLayout?: "tile" | "full";
  /** Kunci objek R2 untuk klip utama / diam (idle) layar video call. */
  callVideoKey?: string;
  /** Poster bingkai pertama klip utama video call. */
  callVideoPosterUrl?: string;
  /** Paket klip reaksi & ekspresi tambahan khusus layar video call. */
  callClips?: CallClips;
  /** Perbesaran video call (100–200%) untuk memotong bingkai hitam di tepi. */
  callVideoZoom?: number;
  /** Kunci objek R2 untuk rekaman suara panggilan telepon. */
  callAudioKey?: string;
  /** Nama file rekaman suara untuk ditampilkan di profil karakter. */
  callAudioName?: string;
};

export type CallVisualPhase =
  | { kind: "idle" }
  | { kind: "listening" }
  | { kind: "thinking" }
  | { kind: "speaking"; emotion: CallEmotion };

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

function cleanCallClips(raw: unknown, expectedUserId?: string): CallClips | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Record<string, unknown>;
  const cleaned: CallClips = {};
  let count = 0;

  for (const slot of CALL_CLIP_SLOTS) {
    const entry = source[slot];
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const key = cleanMediaKey(obj.key, expectedUserId);
    if (!key) continue;
    const posterUrl = cleanPosterUrl(obj.posterUrl);
    cleaned[slot] = posterUrl ? { key, posterUrl } : { key };
    count += 1;
  }

  return count > 0 ? cleaned : undefined;
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
  const callClips = cleanCallClips(raw.callClips, expectedUserId);
  const callAudioKey = cleanMediaKey(raw.callAudioKey, expectedUserId);

  if (!chatVideoKey && !callVideoKey && !callClips && !callAudioKey) {
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
  }

  if (callClips) {
    result.callClips = callClips;
  }

  if (callVideoKey || callClips) {
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

/** Daftar seluruh kunci objek R2 unik yang sedang dipakai oleh karakter ini. */
export function collectMediaKeys(media: CharacterMedia | null | undefined): string[] {
  if (!media) return [];
  const keys = new Set<string>();
  if (media.chatVideoKey) keys.add(media.chatVideoKey);
  if (media.callVideoKey) keys.add(media.callVideoKey);
  if (media.callClips) {
    for (const slot of CALL_CLIP_SLOTS) {
      const k = media.callClips[slot]?.key;
      if (k) keys.add(k);
    }
  }
  if (media.callAudioKey) keys.add(media.callAudioKey);
  return Array.from(keys);
}

/**
 * Daftar klip unik khusus layar Video Call (tidak pernah mencampur `chatVideoKey`
 * selama karakter sudah memiliki minimal satu klip khusus Video Call).
 */
export function listUniqueCallClips(
  media: CharacterMedia | null | undefined
): CallClipItem[] {
  if (!media) return [];
  const map = new Map<string, CallClipItem>();

  if (media.callVideoKey) {
    map.set(media.callVideoKey, {
      key: media.callVideoKey,
      posterUrl: media.callVideoPosterUrl,
    });
  }
  if (media.callClips) {
    for (const slot of CALL_CLIP_SLOTS) {
      const item = media.callClips[slot];
      if (item?.key && !map.has(item.key)) {
        map.set(item.key, item);
      }
    }
  }

  if (map.size > 0) {
    return Array.from(map.values());
  }

  // Cadangan terakhir hanya bila belum ada satupun klip Video Call yang diisi.
  if (media.chatVideoKey) {
    return [{ key: media.chatVideoKey, posterUrl: media.chatVideoPosterUrl }];
  }
  return [];
}

/**
 * Pilih klip Video Call yang paling pas untuk fase interaksi & emosi saat ini,
 * tanpa pernah melompat ke video latar ruang chat bila klip Video Call tersedia.
 */
export function resolveActiveCallClip(
  media: CharacterMedia | null | undefined,
  phase: CallVisualPhase
): CallClipItem | null {
  if (!media) return null;
  const clips = media.callClips;

  let idleBase: CallClipItem | null = media.callVideoKey
    ? { key: media.callVideoKey, posterUrl: media.callVideoPosterUrl }
    : null;

  if (!idleBase && clips) {
    for (const slot of CALL_CLIP_SLOTS) {
      if (clips[slot]?.key) {
        idleBase = clips[slot]!;
        break;
      }
    }
  }

  if (!idleBase) {
    return media.chatVideoKey
      ? { key: media.chatVideoKey, posterUrl: media.chatVideoPosterUrl }
      : null;
  }

  if (phase.kind === "idle") {
    return idleBase;
  }
  if (phase.kind === "listening") {
    return clips?.listening ?? idleBase;
  }
  if (phase.kind === "thinking") {
    return clips?.thinking ?? clips?.listening ?? idleBase;
  }

  // phase.kind === "speaking"
  switch (phase.emotion) {
    case "laugh":
      return clips?.laugh ?? clips?.talking ?? idleBase;
    case "shy":
      return clips?.shy ?? clips?.talking ?? idleBase;
    case "pout":
      return clips?.pout ?? clips?.talking ?? idleBase;
    default:
      return clips?.talking ?? idleBase;
  }
}
