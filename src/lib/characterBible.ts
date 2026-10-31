import { MAX_BIBLE_CHARS } from "./limits";

/**
 * Pembaca bible peran.
 *
 * Formatnya sengaja bebas — user tidak perlu mengikuti struktur tertentu:
 *
 * - `.txt` / `.md`  → seluruh isi berkas dianggap bible.
 * - `.json`         → diambil dari kunci `bible` (atau padanan Indonesia),
 *                     dan boleh sekalian membawa `name`, `personality`,
 *                     `greeting`, `shortBio`.
 *
 * Tidak ada ketergantungan ke Node API, jadi bisa diuji langsung.
 */

export type BibleData = {
  bible: string;
  name?: string;
  personality?: string;
  greeting?: string;
  shortBio?: string;
};

export type BibleParseResult = { ok: true; data: BibleData } | { ok: false; error: string };

/** Kunci JSON yang diterima untuk isi bible. */
const BIBLE_KEYS = ["bible", "characterBible", "character_bible", "naskah", "content", "isi"] as const;

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseBibleFile(fileName: string, rawText: string): BibleParseResult {
  const text = stripBom(rawText ?? "").trim();
  const lowerName = (fileName ?? "").toLowerCase();

  if (!text) {
    return { ok: false, error: "Berkasnya kosong. Isi dulu naskah bible-nya." };
  }

  const looksJson = lowerName.endsWith(".json") || text.startsWith("{");

  if (!looksJson) {
    if (text.length > MAX_BIBLE_CHARS) {
      return {
        ok: false,
        error: `Bible terlalu panjang: ${text.length.toLocaleString("id-ID")} karakter. Maksimal ${MAX_BIBLE_CHARS.toLocaleString("id-ID")}.`,
      };
    }
    return { ok: true, data: { bible: text } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "Berkas JSON-nya rusak (tidak bisa dibaca). Coba simpan ulang atau pakai .txt.",
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: "JSON harus berupa objek, bukan daftar. Contoh: {\"bible\": \"...\"}",
    };
  }

  const obj = parsed as Record<string, unknown>;
  let bible = "";
  for (const key of BIBLE_KEYS) {
    const value = asString(obj[key]);
    if (value) {
      bible = value;
      break;
    }
  }

  if (!bible) {
    return {
      ok: false,
      error: `JSON-nya tidak punya isi bible. Tambahkan kunci "bible" (atau "naskah"/"content").`,
    };
  }

  if (bible.length > MAX_BIBLE_CHARS) {
    return {
      ok: false,
      error: `Bible terlalu panjang: ${bible.length.toLocaleString("id-ID")} karakter. Maksimal ${MAX_BIBLE_CHARS.toLocaleString("id-ID")}.`,
    };
  }

  return {
    ok: true,
    data: {
      bible,
      name: asString(obj.name),
      personality: asString(obj.personality),
      greeting: asString(obj.greeting),
      shortBio: asString(obj.shortBio),
    },
  };
}
