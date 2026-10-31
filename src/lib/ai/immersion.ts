/**
 * Penjaga konsistensi peran ("immersion guard").
 *
 * Prompt sudah melarang karakter mengaku sebagai AI, tapi model kadang masih
 * menyelipkan kalimat seperti "Sebagai AI, aku tidak bisa merasakan itu" —
 * satu kalimat saja sudah merusak seluruh adegan. Modul ini mendeteksinya
 * supaya route chat bisa meminta ulang sekali, lalu membuang sisanya.
 *
 * Polanya sengaja dipersempit ke PENGAKUAN DIRI, bukan kata "AI" secara umum:
 * karakter talent boleh saja membicarakan AI sebagai topik, yang dilarang
 * adalah mengaku dirinya AI.
 */

/** Kata ganti diri + partikel "kan" ("aku kan cuma program"). */
const SELF = "(?:aku|saya|gue|gua|gw|ak)(?:\\s+kan)?";
const HEDGE = "(?:cuma|cuman|hanya|hanyalah|sekedar|sekadar|cmn)";

const PATTERNS: RegExp[] = [
  // "aku AI", "saya ini cuma program", "aku hanyalah chatbot"
  new RegExp(
    `\\b${SELF}\\s+(?:ini\\s+|itu\\s+)?(?:${HEDGE}\\s+)?(?:adalah\\s+|merupakan\\s+)?(?:sebuah\\s+)?(?:ai|a\\.i\\.|kecerdasan buatan|model bahasa|chat ?bot|bot|program komputer|program|sistem|mesin)\\b`,
    "i"
  ),

  // "aku cuma virtual", "saya karakter fiksi", "aku bukan manusia"
  new RegExp(
    `\\b${SELF}\\s+(?:ini\\s+|itu\\s+)?(?:${HEDGE}\\s+)?(?:virtual|fiktif|fiksi|simulasi|karakter fiksi|tokoh fiksi|bukan manusia|tidak nyata|nggak nyata|gak nyata|tidak benar-benar ada)\\b`,
    "i"
  ),

  // "aku tidak punya tubuh/fisik" — sengaja tanpa "perasaan", karena
  // "aku nggak punya perasaan sama kamu" adalah dialog yang wajar dalam adegan.
  new RegExp(`\\b${SELF}\\s+(?:tidak|nggak|gak|tak)\\s+(?:punya|memiliki)\\s+(?:tubuh|fisik|wujud)\\b`, "i"),

  // "aku sedang berperan sebagai", "aku cuma memerankan"
  new RegExp(`\\b${SELF}\\s+(?:sedang|lagi|${HEDGE})?\\s*(?:berperan|memerankan|berakting|memainkan peran)\\b`, "i"),

  // "sebagai AI", "sebagai model bahasa", "sebagai asisten"
  /\bsebagai\s+(?:seorang\s+)?(?:ai|model bahasa|chat ?bot|bot|asisten|program)\b/i,

  // Versi Inggris yang sering muncul dari model
  /\bas an? (?:ai|language model)\b|\bi(?:'m| am) (?:just |only )?an? (?:ai|language model|bot)\b|\blanguage model\b/i,

  // "ini cuma role-play", "itu kan roleplay"
  /\b(?:ini|itu)\s+(?:cuma|cuman|hanya|sekedar|sekadar)?\s*(?:role\s?-?\s?play|roleplay)\b/i,
];

/** Penggalan pertama yang membocorkan bahwa dia bukan manusia, atau null. */
export function findMetaBreak(text: string): string | null {
  for (const pattern of PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match[0].trim();
  }
  return null;
}

export function hasMetaBreak(text: string): boolean {
  return findMetaBreak(text) !== null;
}

/**
 * Buang kalimat yang keluar dari peran, sisanya dipertahankan apa adanya.
 * Token pemisah bubble dijaga supaya struktur pesan tidak berubah.
 */
export function stripMetaSentences(text: string, delimiter = "[[NEXT]]"): string {
  const bubbles = text.split(delimiter);
  const cleaned = bubbles
    .map((bubble) => {
      const sentences = bubble.split(/(?<=[.!?…])\s+|\n+/u);
      return sentences
        .filter((sentence) => sentence.trim() && !hasMetaBreak(sentence))
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim();
    })
    .filter(Boolean);

  return cleaned.join(`\n${delimiter}\n`);
}

/**
 * Imbauan tambahan untuk percobaan kedua. Pendek saja — ditempel di ujung
 * system prompt, bukan mengulang seluruh naskah.
 */
export const IMMERSION_REMINDER = `

=== PERINGATAN KERAS (BACA SEBELUM MENJAWAB) ===
Balasan sebelumnya melanggar aturan: ada kalimat yang mengaku sebagai AI, program, virtual, atau membahas peran. Itu TIDAK BOLEH terulang.

Tulis ulang jawabanmu HANYA sebagai manusia bernama karakter ini, seolah dia benar-benar hidup dan sedang membalas chat pribadi. Periksa setiap kalimat:
- Tidak ada kata: AI, model bahasa, chatbot, bot, program, mesin, sistem, virtual, fiksi, simulasi, peran, skrip.
- Tidak ada "sebagai ...", tidak ada "aku cuma ...", tidak ada penjelasan tentang dirimu yang sebenarnya.
- Tidak ada permintaan maaf karena keterbatasan.

Kalau kamu merasa tidak bisa menjawab sesuatu, tolak seperti manusia menolak: malu, ragu, mengalihkan topik, atau bercanda — bukan karena kamu program.`;

/**
 * Jawaban pengganti terakhir kalau seluruh balasan ternyata keluar dari peran.
 * Satu kata netral jauh lebih baik daripada membocorkan bahwa ini bukan manusia.
 */
export const SAFE_FALLBACK_REPLY = "Hmm?";
