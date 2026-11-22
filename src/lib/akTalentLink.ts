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

const clean = (v: unknown, max: number) =>
  String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);

/** Panduan aturan & fitur AK Talent (ak-guide/1) untuk membantu talent menyusun draf. Hanya teks; tidak pernah mengubah karakter. */
export type AkGuide = { version: number; text: string };

export function parseGuide(raw: unknown, akPubId: string): AkGuide | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schema !== "ak-guide/1" || String(o.akPubId ?? "") !== akPubId) return null;
  const version = Number(o.version);
  const text = clean(o.text, 6000);
  if (!Number.isInteger(version) || version < 1 || text.length < 40) return null;
  return { version, text };
}

export const DEFAULT_AK_BASE = "https://aktalent.vercel.app";

/** Paket peran (ht-role-package/1): hasil pelatihan komunikasi di HeyTalent. Tidak memuat hubungan pemilik, memori, atau catatan tim. */
export type RoleSource = {
  name: string; shortBio: string | null; personality: string | null; greeting: string | null;
  teamRole: string | null; skillPortfolio: string | null; bible: string | null;
};

export function buildRolePackage(akPubId: string, version: number, c: RoleSource) {
  let skills: { title: string; description: string }[] = [];
  try {
    const parsed = JSON.parse(c.skillPortfolio || "[]");
    if (Array.isArray(parsed)) skills = parsed.slice(0, 8).map((x) => ({ title: clean(x?.title, 80), description: clean(x?.description, 320) })).filter((x) => x.title);
  } catch { /* abaikan */ }
  return {
    schema: "ht-role-package/1",
    akPubId,
    version,
    updatedAt: new Date().toISOString(),
    character: {
      name: clean(c.name, 60),
      shortBio: clean(c.shortBio, 120),
      personality: clean(c.personality, 8000),
      greeting: clean(c.greeting, 1000),
      teamRole: clean(c.teamRole, 120),
      skillPortfolio: skills,
      bible: clean(c.bible, 24000),
    },
  };
}
