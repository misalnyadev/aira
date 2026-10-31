import { createHash, createHmac } from "node:crypto";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

/**
 * Baca konfigurasi Cloudflare R2 dari Environment Variables server.
 * Mengembalikan `null` bila belum lengkap supaya server bisa memberi pesan jelas.
 */
export function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = process.env.R2_BUCKET_NAME?.trim() ?? "";

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

/** RFC 3986 percent-encoding wajib untuk AWS Signature V4. */
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

/**
 * Buat Presigned URL AWS Signature V4 untuk Cloudflare R2 (`GET`, `PUT`, `DELETE`).
 *
 * Hanya menandatangani header `host` dengan payload `UNSIGNED-PAYLOAD` agar
 * unggahan langsung dari Safari iPhone (`PUT`) tidak pernah gagal akibat
 * perbedaan kecil header `Content-Type` otomatis bawaan iOS.
 */
export function presignR2Url(
  params: {
    method: "GET" | "PUT" | "DELETE";
    key: string;
    expiresInSeconds: number;
    now?: Date;
  },
  explicitConfig?: R2Config
): string {
  const cfg = explicitConfig ?? getR2Config();
  if (!cfg) {
    throw new Error("Cloudflare R2 belum dikonfigurasi di server.");
  }

  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const region = "auto";
  const service = "s3";
  const { amzDate, dateStamp } = formatAmzDate(params.now ?? new Date());
  const expires = Math.min(604800, Math.max(1, Math.floor(params.expiresInSeconds)));

  const encodedKey = params.key
    .split("/")
    .filter(Boolean)
    .map(encodeRfc3986)
    .join("/");
  const canonicalUri = `/${encodeRfc3986(cfg.bucket)}/${encodedKey}`;

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const queryEntries: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${cfg.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  queryEntries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const canonicalQuery = queryEntries
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    params.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

const SAFE_MEDIA_KEY_RE =
  /^media\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/(chatVideo|callVideo|callAudio)-[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

const SAFE_TTS_KEY_RE = /^tts\/([0-9a-f-]{36})\/[a-z0-9_-]{6,64}\.(wav|mp3)$/;

/**
 * Pastikan kunci objek R2 benar-benar berada di bawah folder milik pengguna ini.
 * Mencegah pengguna membaca atau menghapus media milik akun lain.
 */
export function isOwnedMediaKey(key: string, userId: string): boolean {
  if (!key || key.length > 260) return false;
  const match = SAFE_MEDIA_KEY_RE.exec(key);
  if (!match) return false;
  return match[1] === userId;
}

export function isOwnedTtsKey(key: string, userId: string): boolean {
  if (!key || key.length > 260) return false;
  const match = SAFE_TTS_KEY_RE.exec(key);
  if (!match) return false;
  return match[1] === userId;
}

/** Simpan berkas biner langsung ke Cloudflare R2 dari sisi server. */
export async function putR2Object(
  key: string,
  data: Uint8Array,
  contentType: string
): Promise<boolean> {
  if (!isR2Configured()) return false;
  try {
    const url = presignR2Url({ method: "PUT", key, expiresInSeconds: 120 });
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: Buffer.from(data),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Ambil berkas biner dari Cloudflare R2 (mengembalikan `null` bila 404/gagal). */
export async function getR2Object(
  key: string
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  if (!isR2Configured()) return null;
  try {
    const url = presignR2Url({ method: "GET", key, expiresInSeconds: 120 });
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = await res.arrayBuffer();
    if (!body.byteLength) return null;
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    return { body, contentType };
  } catch {
    return null;
  }
}

/** Hapus satu objek dari Cloudflare R2 (aman bila objek sudah tidak ada). */
export async function deleteR2Object(key: string): Promise<boolean> {
  if (!isR2Configured()) return false;
  try {
    const url = presignR2Url({ method: "DELETE", key, expiresInSeconds: 120 });
    const res = await fetch(url, { method: "DELETE" });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}
