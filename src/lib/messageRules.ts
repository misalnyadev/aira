/**
 * Aturan seputar pesan — dipisah dari komponen supaya bisa diuji tanpa React,
 * dan dipakai bersama oleh layar chat dan mesin balasan.
 */

export type MinimalMessage = {
  id: string;
  role: "user" | "assistant" | string;
  content: string;
  imageUrl?: string | null;
};

/** Balasan asisten paling akhir — satu-satunya yang boleh diulang. */
export function lastAssistantId(messages: MinimalMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") return messages[i].id;
  }
  return null;
}

export type ActionLabel = "Salin teks" | "Ulangi balasan" | "Hapus pesan";

/**
 * Aksi apa saja yang masuk akal untuk sebuah pesan.
 *
 * - "Salin" hanya kalau ada teksnya (pesan foto saja tidak ada yang disalin).
 * - "Ulangi" hanya untuk balasan asisten terakhir, dan tidak saat karakter
 *   sedang mengetik — kalau tidak, dua balasan bisa dibuat sekaligus.
 * - "Hapus" selalu ada.
 */
export function messageActionsFor(
  message: MinimalMessage,
  options: { isLastAssistant: boolean; isTyping: boolean }
): ActionLabel[] {
  const actions: ActionLabel[] = [];
  if (message.content.trim()) actions.push("Salin teks");
  if (options.isLastAssistant && !options.isTyping) actions.push("Ulangi balasan");
  actions.push("Hapus pesan");
  return actions;
}

/** Ubah baris pesan jadi riwayat siap kirim ke model. */
export function toChatTurns(rows: MinimalMessage[], excludeId?: string) {
  return rows
    .filter((m) => m.id !== excludeId)
    .map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content || (m.imageUrl ? "[mengirim foto]" : ""),
    }))
    .filter((t) => t.content);
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
