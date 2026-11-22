import crypto from "node:crypto";

/**
 * Tautan karakter HeyTalent <-> AK Talent (server saja).
 * Kontrak lengkap ada di heytalent-aktalent-sync-plan.md (repo AK Talent).
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_CODE_RE = /^LINK-[A-HJ-NP-Z2-9]{8}$/;
export const LINK_CODE_TTL_MS = 15 * 60 * 1000;
export const LINK_CODE_MAX_TRIES = 5;
export const SIGNATURE_MAX_SKEW_SEC = 300;

export function generateLinkCode(): string {
  const bytes = crypto.randomBytes(8);
  let out = "LINK-";
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function normalizeLinkCode(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/\s+/g, "");
}

export function newLinkSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Tanda tangan: HMAC-SHA256 atas timestamp, nonce, metode, path, dan hash badan. */
export function signRequest(
  secret: string,
  method: string,
  path: string,
  body: string,
  ts: number,
  nonce: string
): string {
  const canonical = `${ts}\n${nonce}\n${method}\n${path}\n${crypto.createHash("sha256").update(body).digest("hex")}`;
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

export function verifySignature(
  secret: string,
  input: { method: string; path: string; body: string; ts: string | null; nonce: string | null; sig: string | null },
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  const ts = Number(input.ts);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > SIGNATURE_MAX_SKEW_SEC) return false;
  if (!input.nonce || input.nonce.length < 8 || input.nonce.length > 64 || !input.sig) return false;
  const expected = signRequest(secret, input.method, input.path, input.body, ts, input.nonce);
  const a = Buffer.from(expected, "hex");
  let b: Buffer;
  try { b = Buffer.from(input.sig, "hex"); } catch { return false; }
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
