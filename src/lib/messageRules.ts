import { speakableText } from "./voiceRules";

/**
 * Aturan seputar pesan — dipisah dari komponen supaya bisa diuji tanpa React,
 * dan dipakai bersama oleh layar chat dan mesin balasan.
 */

export type MinimalMessage = {
  id: string;
  role: "user" | "assistant" | string;
  content: string;
  imageUrl?: string | null;
  createdAt?: Date | string | number | null;
};

/** Balasan asisten paling akhir — satu-satunya yang boleh diulang. */
export function lastAssistantId(messages: MinimalMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return messages[i].id;
  }
  return null;
}

export type ActionLabel = "Salin teks" | "Bacakan" | "Ulangi balasan" | "Hapus pesan";

/**
 * Aksi apa saja yang masuk akal untuk sebuah pesan.
 *
 * - "Salin" hanya kalau ada teksnya (pesan foto saja tidak ada yang disalin).
 * - "Bacakan" hanya untuk balasan asisten yang punya kata-kata terbaca, bila
 *   browser mendukung suara.
 * - "Ulangi" hanya untuk balasan asisten terakhir, dan tidak saat karakter
 *   sedang mengetik — kalau tidak, dua balasan bisa dibuat sekaligus.
 * - "Hapus" selalu ada.
 */
export function messageActionsFor(
  message: MinimalMessage,
  options: { isLastAssistant: boolean; isTyping: boolean; canSpeak?: boolean }
): ActionLabel[] {
  const actions: ActionLabel[] = [];
  if (message.content.trim()) actions.push("Salin teks");
  if (options.canSpeak && message.role === "assistant" && speakableText(message.content)) {
    actions.push("Bacakan");
  }
  if (options.isLastAssistant && !options.isTyping) actions.push("Ulangi balasan");
  actions.push("Hapus pesan");
  return actions;
}

function toEpochMs(value: MinimalMessage["createdAt"]): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * Ubah baris pesan jadi riwayat siap kirim ke model:
 * 1) Pastikan urutan selalu kronologis dari LAMA ke BARU (mencegah alur mundur
 *    bila baris diambil memakai `ORDER BY created_at DESC`).
 * 2) Gabungkan gelembung berurutan dari pengirim yang sama menjadi satu giliran
 *    utuh (`[[NEXT]]` untuk asisten) agar giliran `user` ↔ `assistant` selalu
 *    bergantian rapi dan hemat konteks.
 */
export function toChatTurns(rows: MinimalMessage[], excludeId?: string) {
  const indexed = rows
    .filter((m) => m.id !== excludeId)
    .map((m, idx) => ({ m, idx, time: toEpochMs(m.createdAt) }));

  const hasTimestamps = indexed.some((item) => item.time !== null);
  if (hasTimestamps) {
    indexed.sort((a, b) => {
      if (a.time !== null && b.time !== null && a.time !== b.time) {
        return a.time - b.time;
      }
      return a.idx - b.idx;
    });
  }

  const turns: { role: "user" | "assistant"; content: string }[] = [];

  for (const { m } of indexed) {
    const role: "user" | "assistant" = m.role === "assistant" ? "assistant" : "user";
    const content = (m.content || (m.imageUrl ? "[mengirim foto]" : "")).trim();
    if (!content) continue;

    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) {
      prev.content =
        role === "assistant"
          ? `${prev.content}\n[[NEXT]]\n${content}`
          : `${prev.content}\n${content}`;
    } else {
      turns.push({ role, content });
    }
  }

  return turns;
}

/**
 * Balasan asisten yang harus dihapus sebelum mengulang.
 *
 * Yang dihapus hanya balasan yang muncul SETELAH pesan pengguna terakhir.
 * Pesan pengguna tidak pernah ikut terhapus — bedanya `>=` vs `>` di sini
 * penting: dua baris bisa punya timestamp sama persis, dan balasan yang lahir
 * di detik yang sama dengan pesannya tetap harus ikut dibersihkan.
 */
export function staleAssistantIds<T extends { id: string; role: string; createdAt: Date }>(
  rows: T[],
  lastUserCreatedAt: Date
): string[] {
  return rows
    .filter((m) => m.role === "assistant" && m.createdAt.getTime() >= lastUserCreatedAt.getTime())
    .map((m) => m.id);
}
