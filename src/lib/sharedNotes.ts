import { getWibParts } from "./characterMemory";

/**
 * Mesin Murni Papan "Catatan & Janji Kita" (Rencana, Ide Naskah, Link, & Target).
 *
 * Bebas ketergantungan database agar bisa dipakai di sisi server (auto-capture +
 * injeksi prompt karakter) maupun di sisi klien (format tanggal WIB & filter UI).
 */

export const SHARED_NOTE_KINDS = ["promise", "idea", "plan", "link"] as const;
export type SharedNoteKind = (typeof SHARED_NOTE_KINDS)[number];

export type SharedNoteSource = "auto" | "manual";

export interface SharedNoteItem {
  id: string;
  characterId: string;
  kind: SharedNoteKind;
  title: string;
  /** Tanggal target dalam kalender WIB (`YYYY-MM-DD`) atau `null`. */
  dueDate: string | null;
  /** Tautan referensi opsional (`https://...`). */
  url: string | null;
  done: boolean;
  source: SharedNoteSource;
  createdAt: string;
  updatedAt: string;
}

export interface AutoCapturedNoteCandidate {
  kind: SharedNoteKind;
  title: string;
  dueDate: string | null;
  url: string | null;
}

export type NoteDueStatus =
  | "none"
  | "done"
  | "overdue"
  | "today"
  | "tomorrow"
  | "upcoming";

const HARI_SHORT_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const BULAN_SHORT_ID = [
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

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 0,
  januari: 0,
  feb: 1,
  februari: 1,
  mar: 2,
  maret: 2,
  apr: 3,
  april: 3,
  mei: 4,
  jun: 5,
  juni: 5,
  jul: 6,
  juli: 6,
  agu: 7,
  ags: 7,
  agustus: 7,
  sep: 8,
  sept: 8,
  september: 8,
  okt: 9,
  oktober: 9,
  nov: 10,
  november: 10,
  des: 11,
  desember: 11,
};

const WEEKDAY_NAME_MAP: Record<string, number> = {
  minggu: 0,
  ahad: 0,
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  "jum'at": 5,
  sabtu: 6,
};

export function normalizeNoteKind(
  raw: unknown,
  fallback: SharedNoteKind = "plan"
): SharedNoteKind {
  if (
    raw === "promise" ||
    raw === "idea" ||
    raw === "plan" ||
    raw === "link"
  ) {
    return raw;
  }
  return fallback;
}

/** Validasi & rapikan string tanggal `YYYY-MM-DD`. */
export function sanitizeDueDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return trimmed;
}

export function sanitizeNoteUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString().slice(0, 600);
  } catch {
    return null;
  }
}

export function sanitizeNoteTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\s+/g, " ")
    .replace(/^[-•*:\s]+/, "")
    .trim()
    .slice(0, 260);
}

/** Kunci hari ini dalam kalender WIB (`YYYY-MM-DD`). */
export function todayWibKey(now = new Date()): string {
  return getWibParts(now).dayKey;
}

/** Geser kunci tanggal `YYYY-MM-DD` sebanyak `days` hari. */
export function addDaysToKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Selisih hari (`dueKey - todayKey`). Negatif berarti sudah lewat. */
export function diffDayKeys(dueKey: string, baseKey: string): number {
  const [y1, m1, d1] = dueKey.split("-").map(Number);
  const [y2, m2, d2] = baseKey.split("-").map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t1 - t2) / 86_400_000);
}

export function formatDayKeyShortId(dayKey: string, now = new Date()): string {
  const clean = sanitizeDueDate(dayKey);
  if (!clean) return "";
  const [y, m, d] = clean.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = HARI_SHORT_ID[dt.getUTCDay()];
  const mon = BULAN_SHORT_ID[m - 1];
  const curYear = getWibParts(now).year;
  return y === curYear ? `${dow}, ${d} ${mon}` : `${dow}, ${d} ${mon} ${y}`;
}

export function getNoteDueStatus(
  dueDate: string | null,
  done: boolean,
  now = new Date()
): NoteDueStatus {
  const clean = sanitizeDueDate(dueDate);
  if (!clean) return done ? "done" : "none";
  if (done) return "done";
  const today = todayWibKey(now);
  const diff = diffDayKeys(clean, today);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return "upcoming";
}

export function formatDueBadge(
  dueDate: string | null,
  done: boolean,
  now = new Date()
): { label: string; status: NoteDueStatus } | null {
  const clean = sanitizeDueDate(dueDate);
  if (!clean) return null;
  const status = getNoteDueStatus(clean, done, now);
  const shortDate = formatDayKeyShortId(clean, now);

  if (status === "today") {
    return { label: "Hari ini!", status };
  }
  if (status === "tomorrow") {
    return { label: `Besok · ${shortDate}`, status };
  }
  if (status === "overdue") {
    return { label: `Terlewat · ${shortDate}`, status };
  }
  return { label: shortDate, status };
}

/**
 * Ekstrak tanggal target WIB (`YYYY-MM-DD`) dari ekspresi Bahasa Indonesia alami.
 */
export function extractDueDateWib(
  text: string,
  now = new Date()
): string | null {
  const lower = text.toLowerCase();
  const wib = getWibParts(now);
  const today = wib.dayKey;

  // 1. Format eksplisit YYYY-MM-DD
  const isoMatch = lower.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    const candidate = sanitizeDueDate(isoMatch[0]);
    if (candidate) return candidate;
  }

  // 2. Tanggal dengan nama bulan ("15 november", "tgl 5 des 2026")
  const monthNamesPattern = Object.keys(MONTH_NAME_MAP).join("|");
  const dmyRegex = new RegExp(
    `\\b(?:tanggal|tgl)?\\s*([12]?\\d|3[01])\\s+(${monthNamesPattern})(?:\\s+(20\\d{2}))?\\b`,
    "i"
  );
  const dmyMatch = lower.match(dmyRegex);
  if (dmyMatch) {
    const dayNum = Number(dmyMatch[1]);
    const monthIdx = MONTH_NAME_MAP[dmyMatch[2].toLowerCase()];
    let yearNum = dmyMatch[3] ? Number(dmyMatch[3]) : wib.year;
    if (!dmyMatch[3]) {
      const candidateThisYear = `${yearNum}-${String(monthIdx + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      if (
        sanitizeDueDate(candidateThisYear) &&
        diffDayKeys(candidateThisYear, today) < -1
      ) {
        yearNum += 1;
      }
    }
    const candidate = sanitizeDueDate(
      `${yearNum}-${String(monthIdx + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`
    );
    if (candidate) return candidate;
  }

  // 3. "tanggal 18" / "tgl 20" (tanpa nama bulan -> bulan ini atau bulan depan bila sudah lewat)
  const dayOnlyMatch = lower.match(/\b(?:tanggal|tgl)\s+([12]?\d|3[01])\b/);
  if (dayOnlyMatch) {
    const dayNum = Number(dayOnlyMatch[1]);
    if (dayNum >= 1 && dayNum <= 31) {
      let y = wib.year;
      let m = wib.month + 1;
      let candidate = sanitizeDueDate(
        `${y}-${String(m).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`
      );
      if (!candidate || diffDayKeys(candidate, today) < 0) {
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
        candidate = sanitizeDueDate(
          `${y}-${String(m).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`
        );
      }
      if (candidate) return candidate;
    }
  }

  // 4. Relatif dekat: lusa, besok, hari ini / nanti malam, minggu depan
  if (/\blusa\b/.test(lower)) {
    return addDaysToKey(today, 2);
  }
  if (/\b(besok|bsk)\b/.test(lower)) {
    return addDaysToKey(today, 1);
  }
  if (/\b(hari ini|nanti pagi|nanti siang|nanti sore|nanti malam|malam ini|sore ini)\b/.test(lower)) {
    return today;
  }
  if (/\b(minggu depan|pekan depan)\b/.test(lower)) {
    return addDaysToKey(today, 7);
  }

  // 5. Nama hari ("hari jumat", "sabtu depan", "senin besok", "rabu ini")
  const dayRegex =
    /\b(?:hari\s+)?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)(?:\s+(ini|depan|besok))?\b/;
  const weekdayMatch = lower.match(dayRegex);
  if (weekdayMatch) {
    const word = weekdayMatch[1];
    const modifier = weekdayMatch[2] || "";
    // Hindari salah tangkap frasa "minggu lalu" / "minggu kemarin"
    if (word === "minggu" && /\bminggu\s+(lalu|kemarin)\b/.test(lower)) {
      return null;
    }
    const targetDow = WEEKDAY_NAME_MAP[word];
    if (typeof targetDow === "number") {
      let delta = (targetDow - wib.weekday + 7) % 7;
      if (delta === 0) {
        delta = modifier === "ini" ? 0 : 7;
      } else if (modifier === "depan" && delta <= 2) {
        delta += 7;
      }
      return addDaysToKey(today, delta);
    }
  }

  return null;
}

const IDEA_PREFIX_RE =
  /\b(?:ide\s+(?:naskah|cerita|adegan|scene|konten|judul|proyek|film|video|episode)|konsep\s+(?:naskah|cerita|adegan|scene)|catat\s+ide|simpan\s+ide|premis\s+cerita|logline)\b[:\s-]*/i;

const EXPLICIT_REMEMBER_RE =
  /\b(?:ingetin(?:\s+aku|\s+kita)?|ingatkan(?:\s+aku|\s+kita)?|jangan\s+lupa(?:\s+kita)?|tolong\s+catat|catat\s+(?:di\s+papan|ya|dulu)|janji\s+kita|target\s+(?:kita|aku|hari\s+ini|minggu\s+ini)|deadline(?:\s+kita)?|rencana\s+kita|jadwal\s+kita)\b[:\s,-]*/i;

const ACTION_COMMITMENT_RE =
  /\b(?:kita\s+(?:mau|bakal|harus|lanjut|bahas|garap|kerjain|bikin|revisi|ketemu|ngopi|meeting|syuting|shooting|cek|mulai)|aku\s+(?:mau|harus|bakal|janji)\s+(?:lanjut|kerjain|garap|bikin|revisi|nulis|kirim|selesaiin|beresin|upload|meeting|syuting)|lanjut\s+(?:nulis|revisi|garap|bahas|edit|bikin)|revisi\s+(?:naskah|babak|scene|draft)|bikin\s+(?:naskah|draft|outline|storyboard))\b/i;

function cleanCapturedClause(raw: string): string {
  const cleaned = raw
    .replace(/https?:\/\/\S+/gi, "")
    .replace(
      /^(?:eh|oh\s+iya|oya|btw|ngomong-ngomong|bro|kak|sayang|beb|cuy)[,\s]+/i,
      ""
    )
    .replace(
      /^(?:tolong\s+)?(?:ingetin(?:\s+aku|\s+kita)?|ingatkan(?:\s+aku|\s+kita)?|jangan\s+lupa|catat\s+(?:ya|dulu)?)\s+(?:kalau\s+|buat\s+|untuk\s+)?/i,
      ""
    )
    .replace(/^(?:ide\s+(?:naskah|cerita|adegan|scene|konten)|catat\s+ide|simpan\s+ide|premis|logline)\s*[:=-]\s*/i, "")
    .replace(/\s+(?:ya|yaa+|dong|deh|plis|please)[.!?\s]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";
  return (cleaned.charAt(0).toUpperCase() + cleaned.slice(1)).slice(0, 240);
}

/**
 * Deteksi otomatis catatan penting (Link, Ide Naskah, Janji ber-tanggal, & Rencana)
 * dari pesan pengguna tanpa memanggil API LLM tambahan.
 */
export function extractAutoNotesFromMessage(
  userText: string,
  now = new Date()
): AutoCapturedNoteCandidate[] {
  const trimmed = userText?.trim() ?? "";
  if (trimmed.length < 8 || trimmed === "(mengirim foto tanpa teks)") {
    return [];
  }

  const results: AutoCapturedNoteCandidate[] = [];

  // 1. Tautan / URL referensi
  const urlMatches = trimmed.match(/https?:\/\/[^\s<>")]+/gi);
  if (urlMatches && urlMatches.length > 0) {
    const cleanUrl = sanitizeNoteUrl(urlMatches[0].replace(/[.,;!?]+$/, ""));
    if (cleanUrl) {
      const strippedContext = cleanCapturedClause(trimmed);
      let linkTitle = strippedContext;
      if (linkTitle.length < 4) {
        try {
          const u = new URL(cleanUrl);
          linkTitle = `Referensi link ${u.hostname.replace(/^www\./, "")}`;
        } catch {
          linkTitle = "Referensi tautan";
        }
      }
      results.push({
        kind: "link",
        title: linkTitle,
        dueDate: extractDueDateWib(trimmed, now),
        url: cleanUrl,
      });
    }
  }

  // Pecah pesan panjang per baris / kalimat utama agar judul catatan tetap padat
  const segments = trimmed
    .split(/\n+|(?<=[.!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);

  for (const seg of segments) {
    if (results.length >= 2) break;

    // Abaikan kalimat tanya pendek biasa ("besok kamu sibuk ga?")
    const endsWithQuestion = /\?\s*$/.test(seg);
    if (endsWithQuestion && !EXPLICIT_REMEMBER_RE.test(seg)) {
      continue;
    }

    // 2. Ide naskah / adegan / konsep cerita
    if (IDEA_PREFIX_RE.test(seg)) {
      const title = cleanCapturedClause(seg);
      if (title.length >= 6) {
        results.push({
          kind: "idea",
          title,
          dueDate: extractDueDateWib(seg, now),
          url: null,
        });
        continue;
      }
    }

    // 3. Janji / target / rencana ber-tanggal
    const dueDate = extractDueDateWib(seg, now);
    const hasExplicitMarker = EXPLICIT_REMEMBER_RE.test(seg);
    const hasActionCommitment = ACTION_COMMITMENT_RE.test(seg);

    // Hindari cerita masa lampau ("kemarin kita udah revisi naskah")
    const isPastNarrative =
      /\b(kemarin|tadi\s+pagi|minggu\s+lalu|minggu\s+kemarin|bulan\s+lalu|udah\s+selesai)\b/i.test(
        seg
      ) && !dueDate;

    if (!isPastNarrative && (hasExplicitMarker || (dueDate && hasActionCommitment))) {
      const title = cleanCapturedClause(seg);
      // Jika sudah terekam sebagai item link dengan judul persis sama, lewati
      if (
        title.length >= 6 &&
        !results.some(
          (r) =>
            normalizeNoteFingerprint(r.title, null) ===
            normalizeNoteFingerprint(title, null)
        )
      ) {
        results.push({
          kind: dueDate || /\b(janji|ingetin|ingatkan|jangan lupa|deadline|target)\b/i.test(seg)
            ? "promise"
            : "plan",
          title,
          dueDate,
          url: null,
        });
      }
    }
  }

  return results.slice(0, 2);
}

export function normalizeNoteFingerprint(
  title: string,
  url?: string | null
): string {
  const cleanTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleanUrl = (url || "").trim().toLowerCase();
  return `${cleanTitle}|${cleanUrl}`;
}

export function isDuplicateSharedNote(
  candidate: { title: string; url?: string | null },
  existing: { title: string; url?: string | null; done?: boolean }[]
): boolean {
  const fp = normalizeNoteFingerprint(candidate.title, candidate.url);
  if (!fp || fp === "|") return true;
  return existing.some(
    (item) =>
      !item.done &&
      normalizeNoteFingerprint(item.title, item.url) === fp
  );
}

export function kindLabelId(kind: SharedNoteKind): string {
  switch (kind) {
    case "promise":
      return "Janji & Target";
    case "idea":
      return "Ide & Naskah";
    case "link":
      return "Link";
    default:
      return "Rencana";
  }
}

/**
 * Susun konteks Papan "Catatan & Janji Kita" untuk disuntikkan ke dalam prompt
 * sistem karakter agar karakter otomatis ingat rencana, ide naskah, & janji
 * yang jatuh tempo hari ini secara alami.
 */
export function buildSharedNotesPromptBlock(
  notes: Pick<
    SharedNoteItem,
    "kind" | "title" | "dueDate" | "url" | "done"
  >[],
  now = new Date()
): string {
  const active = notes.filter((n) => !n.done && n.title.trim().length > 0);
  if (active.length === 0) return "";

  const today = todayWibKey(now);

  // Urutkan: due hari ini / terlewat -> due mendatang terdekat -> sisanya
  const sorted = [...active].sort((a, b) => {
    const aDue = sanitizeDueDate(a.dueDate);
    const bDue = sanitizeDueDate(b.dueDate);
    if (aDue && bDue) return aDue.localeCompare(bDue);
    if (aDue) return -1;
    if (bDue) return 1;
    return 0;
  });

  const dueNowLines: string[] = [];
  const otherLines: string[] = [];

  for (const item of sorted.slice(0, 12)) {
    const cleanDue = sanitizeDueDate(item.dueDate);
    const tag = `[${kindLabelId(item.kind)}]`;
    const urlPart = item.url ? ` (${item.url})` : "";

    if (cleanDue) {
      const diff = diffDayKeys(cleanDue, today);
      const shortDate = formatDayKeyShortId(cleanDue, now);
      if (diff === 0) {
        dueNowLines.push(`- HARI INI (${shortDate}) ${tag}: ${item.title}${urlPart}`);
        continue;
      }
      if (diff < 0) {
        dueNowLines.push(
          `- SUDAH JATUH TEMPO (${shortDate}) ${tag}: ${item.title}${urlPart}`
        );
        continue;
      }
      otherLines.push(`- Target ${shortDate} ${tag}: ${item.title}${urlPart}`);
    } else {
      otherLines.push(`- ${tag}: ${item.title}${urlPart}`);
    }
  }

  const sections: string[] = [];
  if (dueNowLines.length > 0) {
    sections.push(
      `Janji / target yang waktunya TIBA HARI INI atau belum sempat tercentang:\n${dueNowLines.join("\n")}`
    );
  }
  if (otherLines.length > 0) {
    sections.push(
      `Catatan rencana, ide naskah, & referensi aktif kalian:\n${otherLines.join("\n")}`
    );
  }

  return `${sections.join("\n\n")}

Cara memakainya:
- Ini adalah papan "Catatan & Janji Kita" antara kamu dan dia.
- Kalau ada janji/target yang TIBA HARI INI dan belum dibahas di obrolan barusan, kamu boleh menanyakan kabarnya atau menyemangatinya secara santai & hangat seperti sahabat dekat (tetap patuhi kesinambungan adegan bila kalian sedang di tengah adegan tertentu).
- Gunakan daftar ide naskah, rencana, dan link di atas agar kamu selalu nyambung saat dia mengajak lanjut membahas proyek atau rencana kalian.`;
}
