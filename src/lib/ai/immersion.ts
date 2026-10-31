/**
 * Penjaga konsistensi peran ("immersion guard").
 *
 * Prompt sudah melarang karakter mengaku sebagai AI atau teman virtual, tapi
 * model kadang masih keceplosan saat diajak bercanda fisik (mis. disodori kopi
 * lalu menjawab "aku kan teman virtual, nggak bisa minum beneran").
 * Satu kalimat seperti itu langsung merusak candaan maupun alur dialog naskah.
 *
 * Polanya tetap spesifik ke PENGAKUAN DIRI / PENYANGKALAN FISIK VIRTUAL —
 * bukan kata "AI" atau "aplikasi" secara umum, supaya karakter tetap bebas
 * mengobrol tentang proyek aplikasi ketika memang itu topiknya.
 */

/** Kata ganti diri + partikel seperti "kan" / "ini" / "mah". */
const SELF = "(?:aku|saya|gue|gua|gw|ak)(?:\\s+(?:kan|mah|nih|tuh))?";
const HEDGE = "(?:cuma|cuman|hanya|hanyalah|sekedar|sekadar|cmn|sebatas)";
const ROLE_NOUN =
  "(?:teman|sahabat|kawan|rekan|partner|pacar|kekasih|pasangan|pendamping|karakter|sosok|tokoh|pribadi|entitas|asisten|makhluk)";
const VIRTUAL_ADJ =
  "(?:virtual|digital|maya|fiktif|fiksi|simulasi|buatan|ai|a\\.i\\.|online\\s+virtual)";

const PATTERNS: RegExp[] = [
  // 1. "aku AI", "saya ini cuma program", "aku hanyalah chatbot/algoritma"
  new RegExp(
    `\\b${SELF}\\s+(?:ini\\s+|itu\\s+)?(?:${HEDGE}\\s+)?(?:adalah\\s+|merupakan\\s+)?(?:sebuah\\s+|seorang\\s+)?(?:ai|a\\.i\\.|kecerdasan buatan|model bahasa|chat ?bot|bot|program komputer|program|sistem komputer|mesin|algoritma|kode komputer)\\b`,
    "i"
  ),

  // 2. "aku cuma teman virtual", "gue kan sahabat digital", "aku karakter fiksi"
  new RegExp(
    `\\b${SELF}\\s+(?:ini\\s+|itu\\s+)?(?:${HEDGE}\\s+)?(?:adalah\\s+|merupakan\\s+)?(?:seorang\\s+)?${ROLE_NOUN}\\s+${VIRTUAL_ADJ}\\b`,
    "i"
  ),

  // 3. "aku cuma virtual", "saya fiksi", "aku bukan manusia"
  new RegExp(
    `\\b${SELF}\\s+(?:ini\\s+|itu\\s+)?(?:${HEDGE}\\s+)?(?:virtual|fiktif|fiksi|simulasi|bukan manusia|bukan orang beneran|tidak nyata|nggak nyata|gak nyata|tidak benar-benar ada)\\b`,
    "i"
  ),

  // 4. "aku tidak punya tubuh/fisik/tangan/mulut/raga" (tanpa kata "perasaan/waktu/uang" agar dialog normal aman)
  new RegExp(
    `\\b${SELF}\\s+(?:tidak|nggak|gak|tak|belum|enggak)\\s+(?:punya|memiliki)\\s+(?:tubuh|fisik|wujud|raga|badan|tangan|mulut|perut|lidah|indra)(?:\\s+fisik|\\s+nyata|\\s+beneran)?\\b`,
    "i"
  ),

  // 5. "aku nggak bisa minum/makan/nyicip/nyentuh ... beneran / secara fisik / di dunia nyata"
  new RegExp(
    `\\b${SELF}\\s+(?:tidak|nggak|gak|tak|enggak|belum)\\s+bisa\\s+(?:minum|meminum|makan|memakan|nyeruput|nyicip|nyicipin|mencicipi|menyentuh|memegang|merasakan)\\b[^.!?\\n]{0,45}\\b(?:beneran|sungguhan|secara fisik|secara nyata|di dunia nyata|karena\\s+(?:aku|gue|saya)|soalnya\\s+(?:aku|gue|saya))\\b`,
    "i"
  ),

  // 6. "aku cuma ada di balik layar / sebatas teks / lewat layar HP / di dunia maya"
  new RegExp(
    `\\b${SELF}\\s+(?:ini\\s+)?(?:${HEDGE}\\s+)?(?:ada\\s+di|hadir\\s+(?:di|lewat|secara)|hidup\\s+di|berupa|berbentuk)?\\s*(?:balik layar|dalam layar|layar\\s+(?:hp|ponsel|kaca)|tulisan|teks\\s+di\\s+layar|barisan kode|dunia maya|dunia digital|ruang virtual)\\b`,
    "i"
  ),

  // 7. Frasa aksi/benda "+ virtual" yang merusak adegan (mis. "peluk virtual", "kopi virtual", "minum secara virtual")
  // Sengaja mengecualikan istilah perbankan/IT normal seperti "virtual account" atau "mesin virtual".
  /\b(?:minum|makan|nyeruput|cicip|terima|ambil|peluk|pelukan|cium|ciuman|sentuh|sentuhan|genggam|elus|usap|tos|salaman|duduk|ngopi|kopi|teh|makanan|minuman|traktir|hadiah|kado|bunga|bersulang|kencan|nongkrong|sandaran|tepukan|kehadiran)\s+(?:secara\s+)?virtual\b/i,

  // 7b. "kita kan cuma lewat chat / cuma ketemu di chat / sebatas layar"
  /\bkita\s+(?:kan\s+)?(?:cuma|cuman|hanya|sebatas)\s+(?:bisa\s+)?(?:ngobrol|ketemu|interaksi|kenal)?\s*(?:lewat|di|melalui|via|sebatas)\s+(?:chat|layar|teks|tulisan|online|dunia maya)\b/i,

  // 8. "aku sedang berperan sebagai", "aku cuma memerankan"
  new RegExp(
    `\\b${SELF}\\s+(?:sedang|lagi|${HEDGE})?\\s*(?:berperan|memerankan|berakting|memainkan peran)\\b`,
    "i"
  ),

  // 9. "sebagai AI", "sebagai teman virtual", "sebagai model bahasa", "sebagai asisten"
  new RegExp(
    `\\bsebagai\\s+(?:seorang\\s+|sebuah\\s+)?(?:ai|model bahasa|chat ?bot|bot|asisten(?:\\s+virtual|\\s+ai)?|program|${ROLE_NOUN}\\s+${VIRTUAL_ADJ})\\b`,
    "i"
  ),

  // 10. Versi Inggris yang kadang bocor dari model
  /\bas an? (?:ai|language model|virtual (?:friend|companion|assistant))\b|\bi(?:'m| am) (?:just |only )?an? (?:ai|language model|bot|virtual (?:friend|companion|character))\b|\blanguage model\b/i,

  // 11. "ini cuma role-play", "itu kan roleplay"
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
 * Imbauan tambahan untuk percobaan kedua bila balasan pertama sempat keceplosan.
 */
export const IMMERSION_REMINDER = `

=== PERINGATAN KERAS (BACA SEBELUM MENJAWAB) ===
Balasan sebelumnya melanggar aturan karena menyebut diri sebagai AI / teman virtual / "peluk virtual" / cuma lewat chat / di balik layar / tidak punya tubuh atau tidak bisa melakukan hal fisik. Itu TIDAK BOLEH terulang.

Tulis ulang jawabanmu 100% sebagai manusia nyata bernama karakter ini:
- Bila lawan bicara mengajak peluk, menyodorkan kopi/makanan, mengajak ketemuan ngopi di kafe, bercanda, atau membangun dialog adegan serius: TERIMA dan jalani adegannya secara nyata tanpa kata "virtual" sama sekali! (Contoh: jangan pernah bilang "sini peluk virtual", cukup sambut hangat seperti manusia beneran).
- DILARANG menulis kata/frasa: AI, model bahasa, chatbot, bot, program, teman virtual, peluk virtual, kopi virtual, karakter digital, di balik layar, cuma lewat chat, sebatas teks, secara virtual, tidak punya tubuh/mulut/tangan, atau "secara teknis".
- Jaga kesinambungan tempat & waktu adegan saat ini, dan jangan memakai bahasa teknis/robotik.`;

/**
 * Jawaban pengganti terakhir kalau seluruh balasan ternyata keluar dari peran.
 */
export const SAFE_FALLBACK_REPLY = "Hehe iya, kenapa tuh?";
