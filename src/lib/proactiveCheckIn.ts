import { BUBBLE_DELIMITER } from "@/lib/ai/promptBuilder";
import {
  describeTimeAwareness,
  diffWibCalendarDays,
  formatWibFull,
  getWibParts,
} from "./characterMemory";

/**
 * Mesin kelayakan & perancang sapaan duluan alami (*Proactive Check-In*).
 *
 * Seluruh fungsi di berkas ini murni (tanpa impor DB) agar deterministik
 * dan dapat diuji unit secara langsung.
 */

/** Minimal jeda hening bila masih di hari kalender WIB yang sama (4 jam). */
export const SAME_DAY_MIN_IDLE_MS = 4 * 60 * 60 * 1000;

/** Minimal jeda hening bila sudah berganti hari kalender WIB (2 jam). */
export const NEXT_DAY_MIN_IDLE_MS = 2 * 60 * 60 * 1000;

/** Cooldown minimal antar sapaan duluan pada satu karakter (6 jam). */
export const MIN_PROACTIVE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Maksimal jumlah gelembung sapaan duluan agar tetap ringan seperti chat teman. */
export const MAX_PROACTIVE_BUBBLES = 2;

export type ProactiveSkipReason =
  | "disabled"
  | "no_conversation_yet"
  | "awaiting_user_reply"
  | "cooldown"
  | "too_recent";

export type ProactiveEligibility =
  | {
      eligible: true;
      idleMs: number;
      dayDiff: number;
    }
  | {
      eligible: false;
      reason: ProactiveSkipReason;
    };

export function evaluateProactiveEligibility(params: {
  proactiveEnabled: boolean;
  proactiveLastAt: Date | null;
  lastMessageAt: Date | null;
  lastUserMessageAt: Date | null;
  messageCount: number;
  now?: Date;
}): ProactiveEligibility {
  const {
    proactiveEnabled,
    proactiveLastAt,
    lastMessageAt,
    lastUserMessageAt,
    messageCount,
    now = new Date(),
  } = params;

  if (!proactiveEnabled) {
    return { eligible: false, reason: "disabled" };
  }

  if (messageCount < 2 || !lastMessageAt || !lastUserMessageAt) {
    return { eligible: false, reason: "no_conversation_yet" };
  }

  // Anti-spam mutlak: jika karakter sudah pernah menyapa duluan dan pengguna
  // belum membalas sejak saat itu, jangan pernah mengirim sapaan bertumpuk.
  if (
    proactiveLastAt &&
    proactiveLastAt.getTime() >= lastUserMessageAt.getTime()
  ) {
    return { eligible: false, reason: "awaiting_user_reply" };
  }

  if (
    proactiveLastAt &&
    now.getTime() - proactiveLastAt.getTime() < MIN_PROACTIVE_COOLDOWN_MS
  ) {
    return { eligible: false, reason: "cooldown" };
  }

  const idleMs = now.getTime() - lastMessageAt.getTime();
  const dayDiff = diffWibCalendarDays(now, lastMessageAt);
  const requiredIdleMs =
    dayDiff >= 1 ? NEXT_DAY_MIN_IDLE_MS : SAME_DAY_MIN_IDLE_MS;

  if (idleMs < requiredIdleMs) {
    return { eligible: false, reason: "too_recent" };
  }

  return {
    eligible: true,
    idleMs,
    dayDiff,
  };
}

/**
 * Filter ringan di sisi klien sebelum menembak endpoint `/check-in`
 * agar obrolan yang masih hangat tidak mengirim request jaringan sia-sia.
 */
export function shouldAttemptClientCheckIn(
  messages: ReadonlyArray<{
    role: "user" | "assistant";
    createdAt: string;
    pending?: boolean;
  }>,
  now = new Date()
): boolean {
  if (messages.length < 2) return false;
  if (messages.some((m) => m.pending)) return false;

  let lastUserAt: Date | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      const parsed = new Date(messages[i].createdAt);
      if (!Number.isNaN(parsed.getTime())) lastUserAt = parsed;
      break;
    }
  }
  if (!lastUserAt) return false;

  const lastMsgAt = new Date(messages[messages.length - 1].createdAt);
  if (Number.isNaN(lastMsgAt.getTime())) return false;

  const res = evaluateProactiveEligibility({
    proactiveEnabled: true,
    proactiveLastAt: null,
    lastMessageAt: lastMsgAt,
    lastUserMessageAt: lastUserAt,
    messageCount: messages.length,
    now,
  });

  return res.eligible;
}

function describeDayMoment(now: Date): string {
  const { hour } = getWibParts(now);
  if (hour < 4) return "larut malam / dini hari";
  if (hour < 10) return "pagi hari";
  if (hour < 15) return "siang hari";
  if (hour < 18) return "sore hari";
  if (hour < 22) return "malam hari";
  return "malam menjelang istirahat";
}

/**
 * Arahan giliran internal (tidak disimpan ke tabel `messages`) untuk meminta
 * karakter mengirim chat sapaan duluan yang hangat, ringkas, dan kontekstual.
 */
export function buildProactiveCheckInDirective(params: {
  now?: Date;
  lastMessageAt: Date;
  hasMemorySummary?: boolean;
}): string {
  const now = params.now ?? new Date();
  const timeInfo = describeTimeAwareness(now, params.lastMessageAt);
  const moment = describeDayMoment(now);

  return `[SITUASI INTERNAL — JANGAN DISEBUT ATAU DIULANGI SECARA HARFIAH]
Sekarang ${formatWibFull(now)} (suasana ${moment}).
${timeInfo}

Kamu berinisiatif mengirim chat duluan kepadanya seperti teman dekat / pasangan ngobrol manusia sungguhan setelah jeda waktu di atas.
Panduan sapaan duluanmu:
- Kirim 1 gelembung chat pendek yang alami (atau maksimal 2 gelembung pendek dipisahkan ${BUBBLE_DELIMITER} bila memang lebih luwes).
- Sesuaikan nuansa sapaan dengan jam WIB saat ini (${moment}) dan sambungkan secara ringan dengan obrolan terakhir kalian${params.hasMemorySummary ? " atau rencana/target di Buku Ingatanmu bila pas" : ""} — misalnya menanyakan kabar kelanjutan naskah/garapan/aktivitasnya, ngopinya, atau kesibukannya hari ini.
- Gunakan panggilan dan gaya bahasa sehari-harimu sendiri sesuai kepribadian/Bible-mu. Jangan kaku, jangan terdengar seperti alarm/pengingat sistem, dan jangan menuntut balasan.`;
}
