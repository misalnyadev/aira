import { ADMIN_CHARACTER_QUOTA, DEFAULT_USER_CHARACTER_QUOTA } from "./limits";
import type { QuotaDiscussionMessage } from "@/types/chat";

export type QuotaRequestStatus = "pending" | "approved" | "rejected";

export type QuotaActor = {
  isAdmin: boolean;
  characterQuota: number;
};

export const MAX_REQUESTED_QUOTA = 30;
export const MAX_QUOTA_REASON_CHARS = 300;
export const MAX_ADMIN_NOTE_CHARS = 300;
export const MAX_QUOTA_DISCUSSION_MSG_CHARS = 500;
export const MAX_QUOTA_DISCUSSION_ITEMS = 60;

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

/**
 * Parse aman riwayat diskusi pengajuan slot karakter dari kolom JSON string di DB.
 */
export function parseQuotaDiscussion(raw: unknown): QuotaDiscussionMessage[] {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: QuotaDiscussionMessage[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const senderRole =
      obj.senderRole === "admin" || obj.senderRole === "member"
        ? obj.senderRole
        : null;
    const text = typeof obj.text === "string" ? obj.text.trim() : "";
    if (!senderRole || !text) continue;
    const id =
      typeof obj.id === "string" && obj.id
        ? obj.id
        : `${Date.now()}-${out.length}`;
    const senderName =
      typeof obj.senderName === "string" && obj.senderName.trim()
        ? obj.senderName.trim().slice(0, 60)
        : senderRole === "admin"
          ? "Admin"
          : "Member";
    const createdAt =
      typeof obj.createdAt === "string" && obj.createdAt
        ? obj.createdAt
        : new Date(0).toISOString();
    out.push({
      id,
      senderRole,
      senderName,
      text: text.slice(0, MAX_QUOTA_DISCUSSION_MSG_CHARS),
      createdAt,
    });
  }
  return out.slice(-MAX_QUOTA_DISCUSSION_ITEMS);
}

export function appendQuotaDiscussionMessage(
  existingRaw: unknown,
  params: {
    id: string;
    senderRole: "admin" | "member";
    senderName: string;
    text: unknown;
    nowIso?: string;
  }
):
  | {
      ok: true;
      message: QuotaDiscussionMessage;
      next: QuotaDiscussionMessage[];
      serialized: string;
    }
  | { ok: false; error: string } {
  const rawText = typeof params.text === "string" ? params.text.trim() : "";
  if (!rawText) {
    return { ok: false, error: "Pesan tidak boleh kosong." };
  }
  if (rawText.length > MAX_QUOTA_DISCUSSION_MSG_CHARS) {
    return {
      ok: false,
      error: `Pesan maksimal ${MAX_QUOTA_DISCUSSION_MSG_CHARS} karakter.`,
    };
  }
  const history = parseQuotaDiscussion(existingRaw);
  const message: QuotaDiscussionMessage = {
    id: params.id,
    senderRole: params.senderRole,
    senderName:
      params.senderName.trim().slice(0, 60) ||
      (params.senderRole === "admin" ? "Admin" : "Member"),
    text: rawText,
    createdAt: params.nowIso ?? new Date().toISOString(),
  };
  const next = [...history, message].slice(-MAX_QUOTA_DISCUSSION_ITEMS);
  return {
    ok: true,
    message,
    next,
    serialized: JSON.stringify(next),
  };
}
