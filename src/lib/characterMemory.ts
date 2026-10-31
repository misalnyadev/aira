import { MAX_MEMORY_SUMMARY_CHARS } from "./limits";
import type { MinimalMessage } from "./messageRules";

/**
 * Mesin Ingatan Jangka Panjang, Kesadaran Waktu (WIB), dan Pencarian Arsip
 * untuk karakter teman harian / perencanaan.
 *
 * Seluruh fungsi di berkas ini murni (tanpa koneksi DB langsung) agar mudah
 * diuji dan aman dipakai ulang di berbagai endpoint.
 */

const SESSION_GAP_MS = 3 * 60 * 60 * 1000; // 3 jam
const DAY_MS = 24 * 60 * 60 * 1000;

const HARI_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HARI_SHORT = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
const BULAN_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

type WibParts = {
  year: number;
  month: number; // 0-11
  day: number;
  weekday: number; // 0-6 (Minggu=0)
  hour: number;
  minute: number;
  dayKey: string; // YYYY-MM-DD
};

/** Konversi Date ke komponen kalender WIB (`Asia/Jakarta`, UTC+7). */
export function getWibParts(date: Date): WibParts {
  // Asia/Jakarta tetap UTC+7 sepanjang tahun (tanpa DST).
  const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
  const shifted = new Date(wibMs);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const weekday = shifted.getUTCDay();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return {
    year,
    month,
    day,
    weekday,
    hour,
    minute,
    dayKey: `${year}-${mm}-${dd}`,
  };
}

function periodOfDay(hour: number): string {
  if (hour < 4) return "dini hari";
  if (hour < 11) return "pagi";
  if (hour < 15) return "siang";
  if (hour < 18) return "sore";
  return "malam";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatWibFull(date: Date): string {
  const p = getWibParts(date);
  return `${HARI_ID[p.weekday]} ${periodOfDay(p.hour)}, ${p.day} ${BULAN_ID[p.month]} ${p.year} pukul ${pad2(p.hour)}.${pad2(p.minute)} WIB`;
}

export function formatWibShort(date: Date): string {
  const p = getWibParts(date);
  return `${HARI_SHORT[p.weekday]}, ${p.day} ${BULAN_SHORT[p.month]} ${p.year} ${pad2(p.hour)}.${pad2(p.minute)}`;
}

export function formatWibDateOnly(date: Date): string {
  const p = getWibParts(date);
  return `${p.day} ${BULAN_SHORT[p.month]} ${p.year}`;
}

/** Selisih hari kalender WIB antara dua waktu (`now` dikurangi `past`). */
export function diffWibCalendarDays(now: Date, past: Date): number {
  const a = getWibParts(now);
  const b = getWibParts(past);
  const utcA = Date.UTC(a.year, a.month, a.day);
  const utcB = Date.UTC(b.year, b.month, b.day);
  return Math.round((utcA - utcB) / DAY_MS);
}

/**
 * Susun deskripsi kesadaran waktu terkini + jarak sejak pesan terakhir
 * agar karakter tahu apakah obrolan masih bersambung menit ini atau sudah
 * berganti hari/minggu.
 */
export function describeTimeAwareness(now: Date, lastMessageAt?: Date | null): string {
  const lines = [`Waktu saat ini: ${formatWibFull(now)}.`];

  if (!lastMessageAt || Number.isNaN(lastMessageAt.getTime())) {
    lines.push("Status obrolan: Ini adalah awal obrolan baru.");
    return lines.join("\n");
  }

  const diffMs = Math.max(0, now.getTime() - lastMessageAt.getTime());
  const diffMin = Math.round(diffMs / 60_000);
  const calDays = diffWibCalendarDays(now, lastMessageAt);

  if (diffMin < 10) {
    lines.push(
      "Jarak dari pesan sebelumnya: baru saja (masih dalam sesi ngobrol yang sedang berlangsung)."
    );
  } else if (diffMin < 60) {
    lines.push(`Jarak dari pesan sebelumnya: sekitar ${diffMin} menit lalu.`);
  } else if (calDays === 0) {
    const hours = Math.max(1, Math.round(diffMin / 60));
    lines.push(
      `Jarak dari pesan sebelumnya: sekitar ${hours} jam lalu di hari yang sama (${formatWibShort(lastMessageAt)}).`
    );
  } else if (calDays === 1) {
    lines.push(
      `Jarak dari pesan sebelumnya: kemarin (${formatWibShort(lastMessageAt)}) — sekarang sudah berganti hari.`
    );
  } else {
    lines.push(
      `Jarak dari pesan sebelumnya: ${calDays} hari yang lalu (${formatWibShort(lastMessageAt)}).`
    );
  }

  return lines.join("\n");
}

function parseDateSafe(val: MinimalMessage["createdAt"]): Date | null {
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === "string" && val) {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Ubah daftar pesan menjadi giliran `user` ↔ `assistant` kronologis dengan
 * penanda pergantian sesi/hari pada pesan pengguna bila jeda >= 3 jam atau
 * pindah tanggal kalender WIB. Penanda hanya ditaruh pada sisi `user` agar
 * model tidak pernah ikut-ikutan menulis tag waktu di balasannya.
 */
export function toTimeAwareChatTurns(rows: MinimalMessage[], excludeId?: string) {
  const indexed = rows
    .filter((m) => m.id !== excludeId)
    .map((m, idx) => ({ m, idx, date: parseDateSafe(m.createdAt) }));

  if (indexed.some((item) => item.date !== null)) {
    indexed.sort((a, b) => {
      if (a.date && b.date && a.date.getTime() !== b.date.getTime()) {
        return a.date.getTime() - b.date.getTime();
      }
      return a.idx - b.idx;
    });
  }

  const turns: { role: "user" | "assistant"; content: string }[] = [];
  let lastDate: Date | null = null;
  let hasAnchoredFirstUserTurn = false;

  for (const { m, date } of indexed) {
    const role: "user" | "assistant" = m.role === "assistant" ? "assistant" : "user";
    const rawContent = (m.content || (m.imageUrl ? "[mengirim foto]" : "")).trim();
    if (!rawContent) continue;

    let sessionHeader = "";
    if (role === "user" && date) {
      if (!hasAnchoredFirstUserTurn) {
        sessionHeader = `[Waktu pesan: ${formatWibShort(date)} WIB]\n`;
        hasAnchoredFirstUserTurn = true;
      } else if (lastDate) {
        const gap = date.getTime() - lastDate.getTime();
        const dayChanged = diffWibCalendarDays(date, lastDate) >= 1;
        if (gap >= SESSION_GAP_MS || dayChanged) {
          sessionHeader = `[Waktu pesan: ${formatWibShort(date)} WIB]\n`;
        }
      }
    }
    if (date) lastDate = date;

    const content = sessionHeader ? `${sessionHeader}${rawContent}` : rawContent;
    const prev = turns[turns.length - 1];
    if (prev && prev.role === role) {
      prev.content = `${prev.content}\n\n${content}`;
    } else {
      turns.push({ role, content });
    }
  }

  return turns;
}

/* ------------------------------------------------------------------ */
/* Pencarian Arsip Obrolan Lama (Smart Archive Recall)                 */
/* ------------------------------------------------------------------ */

const STOPWORDS_ID = new Set([
  "aku",
  "kamu",
  "kau",
  "dia",
  "kita",
  "kami",
  "mereka",
  "yang",
  "dan",
  "atau",
  "tapi",
  "tetapi",
  "kalau",
  "kalo",
  "jika",
  "bila",
  "untuk",
  "buat",
  "dari",
  "ke",
  "di",
  "pada",
  "sama",
  "dengan",
  "dalam",
  "itu",
  "ini",
  "situ",
  "sini",
  "sana",
  "ada",
  "tidak",
  "nggak",
  "gak",
  "enggak",
  "bukan",
  "belum",
  "sudah",
  "udah",
  "lagi",
  "masih",
  "akan",
  "mau",
  "bisa",
  "boleh",
  "harus",
  "jadi",
  "aja",
  "saja",
  "kok",
  "sih",
  "dong",
  "deh",
  "kan",
  "nih",
  "tuh",
  "yah",
  "yaa",
  "apa",
  "siapa",
  "kapan",
  "dimana",
  "mana",
  "gimana",
  "bagaimana",
  "kenapa",
  "mengapa",
  "berapa",
  "tentang",
  "soal",
  "hal",
  "waktu",
  "saat",
  "hari",
  "minggu",
  "pekan",
  "bulan",
  "kemarin",
  "kemaren",
  "lalu",
  "tadi",
  "dulu",
  "pernah",
  "ingat",
  "inget",
  "lupa",
  "coba",
  "tolong",
  "dong",
  "banget",
  "sekali",
  "juga",
  "terus",
  "lalu",
  "bahas",
  "bicarakan",
  "omongin",
  "ngobrol",
  "ngomong",
  "cerita",
  "bilang",
]);

const RECALL_CUE_RE =
  /\b(ingat|inget|lupa|kemarin|kemaren|lalu|waktu itu|dulu|pernah|rencana|jadwal|janji|target|bahas|bicarakan|omongin|catatan|catat|proyek|acara|agenda|lanjutin|kelanjutan|progress|progres|terakhir kali|kapan ya|tanggal berapa)\b/i;

export type ArchiveRecallPlan = {
  shouldSearch: boolean;
  keywords: string[];
  windowStart: Date | null;
  windowEnd: Date | null;
};

/**
 * Analisis pesan pengguna untuk mendeteksi apakah ia menanyakan / menyinggung
 * obrolan atau rencana masa lalu (mis. "minggu kemarin kita bicarakan apa tentang rencana...").
 */
export function extractArchiveRecallPlan(
  userText: string,
  now = new Date()
): ArchiveRecallPlan {
  const clean = userText.toLowerCase().trim();
  if (!clean) {
    return { shouldSearch: false, keywords: [], windowStart: null, windowEnd: null };
  }

  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;

  const setDaysAgoRange = (maxDaysAgo: number, minDaysAgo: number) => {
    windowStart = new Date(now.getTime() - maxDaysAgo * DAY_MS);
    windowEnd = new Date(now.getTime() - minDaysAgo * DAY_MS);
  };

  if (/\b(dua|2)\s+(minggu|pekan)\s+(lalu|kemarin|kemaren)\b/i.test(clean)) {
    setDaysAgoRange(20, 10);
  } else if (/\b(minggu|pekan)\s+(kemarin|kemaren|lalu)\b/i.test(clean)) {
    setDaysAgoRange(15, 4);
  } else if (/\b(bulan)\s+(kemarin|kemaren|lalu)\b/i.test(clean)) {
    setDaysAgoRange(48, 18);
  } else if (/\b(lusa\s+kemarin|(dua|2)\s+hari\s+(lalu|kemarin))\b/i.test(clean)) {
    setDaysAgoRange(4, 1.5);
  } else if (/\b(beberapa|(tiga|3|empat|4|lima|5))\s+hari\s+(lalu|kemarin)\b/i.test(clean)) {
    setDaysAgoRange(7, 2);
  } else if (/\b(kemarin|kemaren)\b/i.test(clean)) {
    setDaysAgoRange(2.5, 0.3);
  }

  const words = clean
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS_ID.has(w));

  const uniqueKeywords = [...new Set(words)].slice(0, 6);
  const hasCue = RECALL_CUE_RE.test(clean) || windowStart !== null;
  const isTopicQuestion = clean.includes("?") && uniqueKeywords.length >= 2;

  return {
    shouldSearch: hasCue || isTopicQuestion,
    keywords: uniqueKeywords,
    windowStart,
    windowEnd,
  };
}

export type ArchivedMessageRow = {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
};

/**
 * Pilih hingga `maxSnippets` cuplikan paling relevan dari pesan arsip lama
 * (di luar jendela 80 pesan terbaru), lengkap dengan pasangan tanya-jawab
 * langsungnya dan tanggal WIB agar karakter bisa menjawab detail dengan akurat.
 */
export function pickRelevantArchivedSnippets(
  archivedChronological: ArchivedMessageRow[],
  plan: ArchiveRecallPlan,
  characterName: string,
  maxSnippets = 10
): string {
  if (!plan.shouldSearch || archivedChronological.length === 0) return "";

  const scored: { idx: number; score: number }[] = [];

  for (let i = 0; i < archivedChronological.length; i++) {
    const row = archivedChronological[i];
    const text = row.content?.trim();
    if (!text) continue;
    const lower = text.toLowerCase();

    let score = 0;
    for (const kw of plan.keywords) {
      if (lower.includes(kw)) score += 3;
    }

    if (
      plan.windowStart &&
      plan.windowEnd &&
      row.createdAt >= plan.windowStart &&
      row.createdAt <= plan.windowEnd
    ) {
      score += 2;
    }

    if (score > 0) {
      scored.push({ idx: i, score });
    }
  }

  if (scored.length === 0) return "";

  scored.sort((a, b) => b.score - a.score || b.idx - a.idx);

  const chosenIndexes = new Set<number>();
  for (const hit of scored) {
    if (chosenIndexes.size >= maxSnippets) break;
    chosenIndexes.add(hit.idx);
    // Sertakan 1 pesan sesudahnya (mis. jawaban/kesepakatan) agar konteksnya utuh.
    if (
      chosenIndexes.size < maxSnippets &&
      hit.idx + 1 < archivedChronological.length
    ) {
      chosenIndexes.add(hit.idx + 1);
    }
  }

  const ordered = [...chosenIndexes].sort((a, b) => a - b);
  const lines = ordered.map((idx) => {
    const m = archivedChronological[idx];
    const speaker = m.role === "assistant" ? characterName : "Dia";
    const snippet =
      m.content.length > 260 ? `${m.content.slice(0, 257).trim()}...` : m.content.trim();
    return `[${formatWibShort(m.createdAt)}] ${speaker}: ${snippet}`;
  });

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Perangkum Buku Ingatan Jangka Panjang                               */
/* ------------------------------------------------------------------ */

export function sanitizeMemorySummary(raw: string): string {
  return raw
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()
    .slice(0, MAX_MEMORY_SUMMARY_CHARS);
}

/**
 * Susun instruksi untuk AI perangkum yang memperbarui Buku Ingatan karakter
 * berdasarkan ingatan sebelumnya + potongan percakapan baru.
 */
export function buildMemorySummarizerPrompt({
  characterName,
  existingSummary,
  messagesToDigest,
}: {
  characterName: string;
  existingSummary: string;
  messagesToDigest: ArchivedMessageRow[];
}): { systemPrompt: string; userText: string } {
  const transcript = messagesToDigest
    .filter((m) => m.content.trim())
    .map((m) => {
      const speaker = m.role === "assistant" ? characterName : "Lawan Bicara";
      return `[${formatWibDateOnly(m.createdAt)}] ${speaker}: ${m.content.trim()}`;
    })
    .join("\n");

  const systemPrompt = `Kamu adalah penyusun Buku Ingatan Jangka Panjang internal milik "${characterName}".
Tugasmu merangkum dan memperbarui catatan ingatan "${characterName}" tentang lawan bicaranya supaya "${characterName}" selalu ingat rencana, janji, kebiasaan, dan cerita lama seperti sahabat dekat yang perhatian.

ATURAN FORMAT KELUARAN:
- Tulis LANGSUNG isi catatan dalam Bahasa Indonesia yang padat, jelas, dan rapi (maksimal 2.800 karakter), tanpa kata pengantar atau penutup.
- Gunakan tepat 3 bagian judul berikut:
  1. RENCANA, PENGINGAT & JANJI
  2. TENTANG DIA (FAKTA & KEBIASAAN)
  3. RIWAYAT CERITA & KESEPAKATAN PENTING
- Sertakan tanggal singkat dalam kurung siku seperti [25 Okt 2026] pada setiap rencana, janji, atau kejadian penting agar mudah dijawab saat nanti ditanya "minggu kemarin kita bahas apa".
- Pertahankan informasi penting dari Ingatan Sebelumnya! Perbarui status rencana bila di percakapan terbaru rencana itu sudah terlaksana, berubah jadwal, atau dibatalkan.
- Buang basa-basi sepele ("halo", "lagi apa") — simpan hanya fakta, preferensi, target/rencana, tenggat waktu, curhatan penting, dan candaan khas.`;

  const userText = `=== INGATAN SEBELUMNYA ===
${existingSummary.trim() || "(Belum ada catatan ingatan sebelumnya)"}

=== POTONGAN PERCAKAPAN BARU UNTUK DICATAT ===
${transcript}

Perbarui Buku Ingatan di atas secara utuh dan padat sesuai 3 bagian yang diminta.`;

  return { systemPrompt, userText };
}
