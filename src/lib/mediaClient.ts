"use client";

import { useSyncExternalStore } from "react";

/**
 * Klien media karakter (Cloudflare R2).
 *
 * Unggahan: browser meminta tiket `PUT` ke `/api/media/upload-url`, lalu
 * mengirim berkas langsung ke bucket R2. Untuk sesi yang sama, berkas langsung
 * diputar dari memori (`URL.createObjectURL(file)`) sehingga tidak ada jeda.
 *
 * Pemutaran lintas perangkat: komponen memanggil `ensureMediaUrl(key)` yang
 * meminta URL streaming bertanda tangan (berlaku 6 jam) dari `/api/media` lalu
 * menyimpannya di cache memori selama 5 jam.
 */

export const MAX_VIDEO_MB = 24;
export const MAX_AUDIO_MB = 25;
const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;
const MAX_AUDIO_BYTES = MAX_AUDIO_MB * 1024 * 1024;

/** Masa simpan URL bertanda tangan di cache memori (5 jam dari 6 jam masa berlaku). */
const SIGNED_URL_TTL_MS = 5 * 60 * 60 * 1000;

type MediaEntry = {
  url: string | null;
  status: "loading" | "ready" | "error";
  localObjectUrl: boolean;
  streamFallback?: boolean;
  expiresAt: number;
};

const cache = new Map<string, MediaEntry>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeMedia(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isFresh(entry: MediaEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.status === "loading") return true;
  if (entry.status !== "ready" || !entry.url) return false;
  if (entry.localObjectUrl) return true;
  return Date.now() < entry.expiresAt;
}

export function getMediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const entry = cache.get(key);
  if (!entry || entry.status !== "ready") return null;
  return entry.url;
}

export function getMediaStatus(
  key: string | null | undefined
): "idle" | "loading" | "ready" | "missing" {
  if (!key) return "idle";
  const entry = cache.get(key);
  if (!entry) return "idle";
  if (entry.status === "ready") return "ready";
  if (entry.status === "loading") return "loading";
  return "missing";
}

/** Muat URL streaming untuk sebuah `key` R2. Aman dipanggil berulang kali. */
export function ensureMediaUrl(key: string | null | undefined): void {
  if (!key) return;
  const existing = cache.get(key);
  if (isFresh(existing)) return;

  cache.set(key, {
    url: null,
    status: "loading",
    localObjectUrl: false,
    expiresAt: 0,
  });

  fetch(`/api/media?key=${encodeURIComponent(key)}`)
    .then(async (res) => {
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (typeof data.url !== "string" || !data.url) throw new Error();
      cache.set(key, {
        url: data.url,
        status: "ready",
        localObjectUrl: false,
        expiresAt: Date.now() + SIGNED_URL_TTL_MS,
      });
      emit();
    })
    .catch(() => {
      cache.set(key, {
        url: null,
        status: "error",
        localObjectUrl: false,
        expiresAt: 0,
      });
      emit();
    });
}

/**
 * Alihkan pemutaran ke rute streaming satu-domain (`/api/media/stream`) bila
 * URL langsung `*.r2.cloudflarestorage.com` gagal dimuat di browser/jaringan
 * perangkat saat ini (mis. pemblokir pihak ketiga / DNS / CORS di laptop).
 * Mengembalikan `true` bila dialihkan ke cadangan, `false` bila cadangan juga gagal.
 */
export function fallbackMediaToStream(key: string | null | undefined): boolean {
  if (!key) return false;
  const current = cache.get(key);
  if (current?.localObjectUrl && current.url) {
    URL.revokeObjectURL(current.url);
  }
  if (current?.streamFallback) {
    cache.set(key, {
      url: null,
      status: "error",
      localObjectUrl: false,
      streamFallback: true,
      expiresAt: 0,
    });
    emit();
    return false;
  }
  cache.set(key, {
    url: `/api/media/stream?key=${encodeURIComponent(key)}`,
    status: "ready",
    localObjectUrl: false,
    streamFallback: true,
    expiresAt: Date.now() + SIGNED_URL_TTL_MS,
  });
  emit();
  return true;
}

function primeLocalBlob(key: string, blob: Blob) {
  const previous = cache.get(key);
  if (previous?.localObjectUrl && previous.url) {
    URL.revokeObjectURL(previous.url);
  }
  cache.set(key, {
    url: URL.createObjectURL(blob),
    status: "ready",
    localObjectUrl: true,
    expiresAt: Number.POSITIVE_INFINITY,
  });
  emit();
}

/** Hapus berkas media dari cache memori sekaligus dari Cloudflare R2. */
export async function removeCharacterMediaKey(key: string | null | undefined): Promise<void> {
  if (!key) return;
  const entry = cache.get(key);
  if (entry?.localObjectUrl && entry.url) {
    URL.revokeObjectURL(entry.url);
  }
  cache.delete(key);
  emit();

  try {
    await fetch(`/api/media?key=${encodeURIComponent(key)}`, { method: "DELETE" });
  } catch {
    // Pembersihan best-effort; kegagalan jaringan tidak perlu memutus alur pengguna.
  }
}

/* ------------------------------------------------------------------ */
/* Poster bingkai pertama video + unggah langsung ke R2                */
/* ------------------------------------------------------------------ */

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    try {
      video.currentTime = time;
    } catch {
      done();
      return;
    }
    window.setTimeout(done, 900);
  });
}

async function extractVideoPosterBlob(file: File): Promise<Blob | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("timeout")), 5000);
      video.onloadeddata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("error"));
      };
      video.load();
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration > 0.2) {
      await seekVideo(video, Math.min(0.6, duration / 4));
    }

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 360;
    const scale = Math.min(1, 720 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.68)
    );
  } catch {
    // Sebagian codec di browser bisa gagal diambil bingkainya — video tetap boleh diunggah.
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function uploadPosterBlob(poster: Blob | null): Promise<string | undefined> {
  if (!poster) return undefined;
  try {
    const form = new FormData();
    form.append("file", new File([poster], "poster.jpg", { type: "image/jpeg" }));
    const res = await fetch("/api/upload", { method: "POST", body: form });
    if (!res.ok) return undefined;
    const data = await res.json().catch(() => ({}));
    return typeof data.url === "string" ? data.url : undefined;
  } catch {
    return undefined;
  }
}

async function putToR2(uploadUrl: string, file: File, fallbackMime: string) {
  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || fallbackMime,
      },
      body: file,
    });
  } catch {
    throw new Error(
      "Gagal mengunggah ke Cloudflare R2. Pastikan CORS Policy di tab Settings bucket aisherly-media sudah disimpan."
    );
  }

  if (!res.ok) {
    throw new Error(`Unggahan ditolak penyimpanan media (kode ${res.status}).`);
  }
}

export async function uploadCharacterVideo(
  characterId: string,
  slot: "chatVideo" | "callVideo",
  file: File
): Promise<{ key: string; posterUrl?: string }> {
  const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
  if (!isVideo) {
    throw new Error("Pilih berkas video (MP4, MOV, atau WebM).");
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error(
      `Video terlalu besar (${Math.round(file.size / (1024 * 1024))} MB). Maksimal ${MAX_VIDEO_MB} MB — potong dulu jadi klip pendek.`
    );
  }

  const posterPromise = extractVideoPosterBlob(file);

  const ticketRes = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      characterId,
      slot,
      contentType: file.type || "video/mp4",
      bytes: file.size,
      filename: file.name,
    }),
  });
  const ticket = await ticketRes.json().catch(() => ({}));
  if (!ticketRes.ok) {
    throw new Error(ticket.error || "Gagal menyiapkan unggahan video.");
  }

  await putToR2(ticket.uploadUrl, file, "video/mp4");
  const posterBlob = await posterPromise;
  const posterUrl = await uploadPosterBlob(posterBlob);

  primeLocalBlob(ticket.key, file);
  return { key: ticket.key, posterUrl };
}

export async function uploadCharacterAudio(
  characterId: string,
  file: File
): Promise<{ key: string; name: string }> {
  const isAudio =
    file.type.startsWith("audio/") || /\.(mp3|m4a|aac|ogg|wav|wave)$/i.test(file.name);
  if (!isAudio) {
    throw new Error("Pilih berkas suara (MP3, M4A, atau WAV).");
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new Error(
      `Berkas suara terlalu besar (${Math.round(file.size / (1024 * 1024))} MB). Maksimal ${MAX_AUDIO_MB} MB.`
    );
  }

  const ticketRes = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      characterId,
      slot: "callAudio",
      contentType: file.type || "audio/mpeg",
      bytes: file.size,
      filename: file.name,
    }),
  });
  const ticket = await ticketRes.json().catch(() => ({}));
  if (!ticketRes.ok) {
    throw new Error(ticket.error || "Gagal menyiapkan unggahan suara.");
  }

  await putToR2(ticket.uploadUrl, file, "audio/mpeg");
  primeLocalBlob(ticket.key, file);
  return { key: ticket.key, name: file.name };
}

export function useMediaUrl(key: string | null | undefined): string | null {
  return useSyncExternalStore(
    subscribeMedia,
    () => getMediaUrl(key),
    () => null
  );
}

export function useMediaStatus(
  key: string | null | undefined
): "idle" | "loading" | "ready" | "missing" {
  return useSyncExternalStore(
    subscribeMedia,
    () => getMediaStatus(key),
    () => "idle" as const
  );
}
