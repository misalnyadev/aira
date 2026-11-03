import { ADMIN_CHARACTER_QUOTA, DEFAULT_USER_CHARACTER_QUOTA } from "./limits";

export type QuotaRequestStatus = "pending" | "approved" | "rejected";

export type QuotaActor = {
  isAdmin: boolean;
  characterQuota: number;
};

export const MAX_REQUESTED_QUOTA = 30;
export const MAX_QUOTA_REASON_CHARS = 300;
export const MAX_ADMIN_NOTE_CHARS = 300;

/**
 * Hitung batas efektif pembuatan karakter milik sendiri untuk sebuah akun.
 * - Admin bebas membuat banyak karakter (minimal ADMIN_CHARACTER_QUOTA = 50).
 * - User biasa dibatasi `characterQuota` (bawaan 1 karakter), harus request ke Admin bila ingin lebih.
 */
export function effectiveCharacterLimit(actor: QuotaActor): number {
  const normalizedQuota =
    typeof actor.characterQuota === "number" && Number.isFinite(actor.characterQuota)
      ? Math.max(DEFAULT_USER_CHARACTER_QUOTA, Math.floor(actor.characterQuota))
      : DEFAULT_USER_CHARACTER_QUOTA;

  if (actor.isAdmin) {
    return Math.max(ADMIN_CHARACTER_QUOTA, normalizedQuota);
  }
  return normalizedQuota;
}

export function normalizeQuotaValue(
  input: unknown,
  fallback = DEFAULT_USER_CHARACTER_QUOTA
): number {
  const num = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(ADMIN_CHARACTER_QUOTA, Math.floor(num)));
}

export function validateNewQuotaRequest(params: {
  isAdmin: boolean;
  currentQuota: number;
  addSlots?: unknown;
  requestedQuota?: unknown;
  reason?: unknown;
}):
  | { ok: true; requestedQuota: number; reason: string }
  | { ok: false; error: string } {
  if (params.isAdmin) {
    return {
      ok: false,
      error: "Akun Admin sudah memiliki kuota karakter penuh.",
    };
  }

  const baseQuota = Math.max(
    DEFAULT_USER_CHARACTER_QUOTA,
    Math.floor(params.currentQuota || DEFAULT_USER_CHARACTER_QUOTA)
  );

  let targetQuota: number;
  if (params.requestedQuota !== undefined) {
    targetQuota = Number(params.requestedQuota);
  } else {
    const add = params.addSlots !== undefined ? Number(params.addSlots) : 1;
    targetQuota = baseQuota + (Number.isFinite(add) ? Math.floor(add) : 1);
  }

  if (!Number.isFinite(targetQuota) || targetQuota <= baseQuota) {
    return {
      ok: false,
      error: "Jumlah slot yang diajukan harus lebih besar dari kuota saat ini.",
    };
  }

  if (targetQuota > MAX_REQUESTED_QUOTA) {
    return {
      ok: false,
      error: `Maksimal pengajuan adalah ${MAX_REQUESTED_QUOTA} slot karakter.`,
    };
  }

  const rawReason = typeof params.reason === "string" ? params.reason.trim() : "";
  if (rawReason.length > MAX_QUOTA_REASON_CHARS) {
    return {
      ok: false,
      error: `Alasan pengajuan maksimal ${MAX_QUOTA_REASON_CHARS} karakter.`,
    };
  }

  return {
    ok: true,
    requestedQuota: Math.floor(targetQuota),
    reason: rawReason,
  };
}

export function cleanAdminNote(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_ADMIN_NOTE_CHARS);
}
