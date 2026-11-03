/**
 * Aktivitas & suasana harian dinamis mengikuti jam WIB.
 *
 * Menentukan sapaan status ringan di bawah nama karakter (mis. "☕ lagi ngopi
 * pagi di teras") serta semburat latar chat yang ikut bergeser dari pagi
 * cerah → sore hangat → malam tenang. Semua murni heuristik lokal tanpa
 * panggilan AI sehingga tidak menambah kuota Groq/Gemini.
 */

export type WibPeriod =
  | "dawn"
  | "morning"
  | "noon"
  | "afternoon"
  | "evening"
  | "night"
  | "latenight";

function getWibHour(date: Date): number {
  // Asia/Jakarta = UTC+7 tanpa DST, sama seperti getWibParts di characterMemory.
  const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
  return new Date(wibMs).getUTCHours();
}

export function getWibPeriod(date: Date): WibPeriod {
  const h = getWibHour(date);
  if (h >= 4 && h < 6) return "dawn";
  if (h >= 6 && h < 11) return "morning";
  if (h >= 11 && h < 15) return "noon";
  if (h >= 15 && h < 18) return "afternoon";
  if (h >= 18 && h < 22) return "evening";
  if (h >= 22 || h < 1) return "night";
  return "latenight"; // 01:00–03:59
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function dayKeyWib(date: Date): string {
  const wibMs = date.getTime() + 7 * 60 * 60 * 1000;
  const d = new Date(wibMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type PresenceInput = {
  id: string;
  name: string;
  shortBio?: string;
  personality?: string;
  bible?: string;
};

function extractTraits(input: PresenceInput): Set<string> {
  const blob = `${input.personality ?? ""} ${input.bible ?? ""} ${input.shortBio ?? ""}`.toLowerCase();
  const hits = new Set<string>();
  if (/(kopi|kafe|cafe|ngopi|coffee)/.test(blob)) hits.add("kopi");
  if (/(tulis|naskah|novel|cerita|draft|nulis|penulis|sastra)/.test(blob)) hits.add("tulis");
  if (/(musik|lagu|gitar|piano|nyanyi|musisi|band)/.test(blob)) hits.add("musik");
  if (/(baca|buku|literasi|perpustakaan)/.test(blob)) hits.add("baca");
  if (/(gambar|lukis|ilustrasi|desain|seni|rancang)/.test(blob)) hits.add("seni");
  if (/(olahraga|lari|gym|yoga|jogging|sepeda|basket)/.test(blob)) hits.add("olahraga");
  if (/(masak|dapur|kue|resep)/.test(blob)) hits.add("masak");
  if (/(hujan|gerimis|mendung)/.test(blob)) hits.add("hujan");
  if (/(kerja|kantor|meeting|proyek|deadline)/.test(blob)) hits.add("kerja");
  if (/(kampus|kuliah|dosen|mahasiswa|skripsi|kelas)/.test(blob)) hits.add("kampus");
  if (/(senja|sunset|senjakala)/.test(blob)) hits.add("senja");
  if (/(game|gaming|nge-game|mabar)/.test(blob)) hits.add("game");
  return hits;
}

function pick<T>(pool: T[], seed: string): T {
  if (pool.length === 0) throw new Error("pool kosong");
  return pool[hashString(seed) % pool.length];
}

// ---------------------------------------------------------------------------
// Pool status per periode (Bahasa Indonesia santai, pendek supaya muat 1 baris)
// ---------------------------------------------------------------------------

const POOLS: Record<WibPeriod, string[]> = {
  dawn: [
    "baru bangun, masih ngantuk pelan 🌿",
    "lagi dengerin embun pagi",
    "baru melek — nyeduh air hangat",
    "dini hari, masih syahdu",
  ],
  morning: [
    "☕ lagi ngopi pagi di teras",
    "lagi sarapan sambil cek naskah",
    "pagi cerah — siap beraktivitas",
    "lagi nulis ide pagi 📝",
    "lagi dengerin musik pagi santai",
    "lagi beres-beres pagi",
  ],
  noon: [
    "lagi makan siang santai",
    "lagi istirahat siang sejenak",
    "siang terik — lagi ngerjain naskah",
    "lagi ngulik ide di sela jam kerja",
    "lagi ngopi siang ☕",
  ],
  afternoon: [
    "lagi baca draft sore 📖",
    "lagi ngopi sore di kafe",
    "sore santai — lagi beresin catatan",
    "lagi jalan sore cari inspirasi",
    "lagi revisi naskah pelan-pelan",
  ],
  evening: [
    "lagi nikmatin senja 🌇",
    "malam mulai — lagi santai di rumah",
    "lagi dengerin musik malam",
    "lagi nulis catatan malam 📝",
    "lagi rebahan sambil mikirin ide",
  ],
  night: [
    "lagi rebahan dengerin hujan 🌧️",
    "masih terjaga — nulis ide larut",
    "malam tenang, lagi ngopi hangat",
    "lagi dengerin lagu pelan 🌙",
    "udah malam — masih melek bentar",
  ],
  latenight: [
    "udah larut, masih melek bentar 🌙",
    "larut malam — ngantuk tapi betah",
    "begadang halus sambil nulis",
    "dini hari yang hening",
  ],
};

const EXTRA_BY_TRAIT: Record<string, Partial<Record<WibPeriod, string[]>>> = {
  kopi: {
    morning: ["☕ lagi ngopi pagi — wangi banget", "lagi seduh kopi susu gula aren"],
    afternoon: ["lagi ngopi sore sambil ngobrol", "ngopi sore di teras ☕"],
    night: ["lagi ngopi hangat ditemani hujan 🌧️"],
  },
  tulis: {
    morning: ["lagi nulis draft pagi 📝", "pagi produktif — lagi garap naskah"],
    afternoon: ["lagi revisi naskah sore", "lagi ngerapihin ide naskah"],
    evening: ["lagi nulis catatan malam", "malam kreatif — lagi nulis adegan"],
    night: ["masih nulis ide larut 🌙"],
  },
  musik: {
    morning: ["lagi dengerin musik pagi 🎧"],
    afternoon: ["lagi latihan musik sore"],
    evening: ["lagi dengerin musik malam 🌙"],
    night: ["lagi dengerin lagu pelan larut"],
  },
  baca: {
    morning: ["lagi baca buku pagi 📖"],
    afternoon: ["lagi baca draft sore 📖"],
    evening: ["lagi baca santai malam"],
  },
  seni: {
    morning: ["pagi kreatif — lagi sketsa ide"],
    afternoon: ["lagi gambar santai sore"],
  },
  olahraga: {
    dawn: ["baru selesai jogging pagi 🏃"],
    morning: ["habis olahraga pagi — segar!", "lagi jogging santai pagi"],
    afternoon: ["lagi jalan sore cari angin"],
  },
  masak: {
    morning: ["lagi siapin sarapan di dapur"],
    noon: ["lagi masak makan siang 🍳"],
    evening: ["lagi siapin makan malam"],
  },
  hujan: {
    morning: ["pagi gerimis — enak ngopi ☕🌧️"],
    afternoon: ["sore mendung, hujan rintik 🌧️"],
    night: ["malam hujan — syahdu banget 🌧️"],
  },
  kerja: {
    morning: ["pagi sibuk — siap kerja"],
    noon: ["lagi sela kerja siang"],
    afternoon: ["lagi beresin kerjaan sore"],
  },
  kampus: {
    morning: ["pagi kampus — siap kelas"],
    noon: ["lagi sela kuliah siang"],
    afternoon: ["lagi di perpus sore 📚"],
  },
  senja: {
    afternoon: ["lagi nunggu senja di teras 🌇"],
    evening: ["lagi nikmatin senja 🌇", "senja jingga — syahdu banget"],
  },
  game: {
    afternoon: ["lagi mabar santai sore 🎮"],
    evening: ["lagi main game malam 🎮"],
    night: ["masih mabar larut 🎮"],
  },
};

export function getDailyStatus(character: PresenceInput, now = new Date()): string {
  const period = getWibPeriod(now);
  const base = [...(POOLS[period] ?? POOLS.morning)];

  // Tambahkan varian yang relevan dengan bible/personality (maks. 1–2 per trait).
  const traits = extractTraits(character);
  for (const trait of traits) {
    const extra = EXTRA_BY_TRAIT[trait]?.[period];
    if (extra) base.push(...extra);
  }

  const dayKey = dayKeyWib(now);
  const hour = getWibHour(now);
  const seed = `${character.id}|${period}|${dayKey}|${hour}`;
  return pick(base, seed);
}

// ---------------------------------------------------------------------------
// Semburat latar halus mengikuti jam WIB
// ---------------------------------------------------------------------------

export type WibAmbient = {
  label: string;
  overlay: string; // CSS background
  opacity: number;
};

export function getDailyPresenceForPrompt(
  character: { id: string; name: string; shortBio?: string; personality?: string; bible?: string },
  now = new Date()
): string {
  const period = getWibPeriod(now);
  const status = getDailyStatus(character, now);
  // Format jam WIB sederhana untuk prompt (mis. "Senin pagi, 5 Mei 2026 pukul 09.12 WIB · ☕ lagi ngopi pagi")
  const wibMs = now.getTime() + 7 * 60 * 60 * 1000;
  const d = new Date(wibMs);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const labelMap: Record<WibPeriod, string> = {
    dawn: "dini hari",
    morning: "pagi",
    noon: "siang",
    afternoon: "sore",
    evening: "malam",
    night: "malam",
    latenight: "larut malam",
  };
  return `Pukul ${hh}.${mm} WIB ${labelMap[period]} · ${status}`;
}

export function getWibAmbient(period: WibPeriod, isDark: boolean): WibAmbient {
  // Opacity sengaja sangat rendah — hanya semburat, bukan filter berat.
  if (isDark) {
    switch (period) {
      case "dawn":
        return {
          label: "dini hari",
          overlay:
            "linear-gradient(to bottom, rgba(99,102,241,0.10), transparent 62%), radial-gradient(ellipse 70% 50% at 50% 0%, rgba(99,102,241,0.07), transparent 70%)",
          opacity: 1,
        };
      case "morning":
        return {
          label: "pagi",
          overlay:
            "linear-gradient(to bottom, rgba(255,237,170,0.10), transparent 60%), radial-gradient(ellipse 80% 45% at 50% 0%, rgba(255,213,128,0.08), transparent 68%)",
          opacity: 1,
        };
      case "noon":
        return { label: "siang", overlay: "linear-gradient(to bottom, transparent, transparent)", opacity: 0 };
      case "afternoon":
        return {
          label: "sore",
          overlay:
            "linear-gradient(to bottom, rgba(251,146,60,0.09), transparent 58%), radial-gradient(ellipse 75% 50% at 50% 0%, rgba(251,113,133,0.07), transparent 72%)",
          opacity: 1,
        };
      case "evening":
        return {
          label: "senja",
          overlay:
            "linear-gradient(to bottom, rgba(99,102,241,0.11), transparent 62%), linear-gradient(to bottom, rgba(251,113,133,0.06), transparent 42%)",
          opacity: 1,
        };
      case "night":
        return {
          label: "malam",
          overlay:
            "linear-gradient(to bottom, rgba(30,58,138,0.14), transparent 65%), radial-gradient(ellipse 85% 55% at 50% 0%, rgba(30,41,99,0.09), transparent 70%)",
          opacity: 1,
        };
      case "latenight":
        return {
          label: "larut",
          overlay:
            "linear-gradient(to bottom, rgba(15,23,42,0.18), transparent 68%), radial-gradient(ellipse 90% 50% at 50% 0%, rgba(15,23,42,0.10), transparent 75%)",
          opacity: 1,
        };
    }
  }

  // Light mode — lebih lembut lagi
  switch (period) {
    case "dawn":
      return {
        label: "dini hari",
        overlay:
          "linear-gradient(to bottom, rgba(199,210,254,0.18), transparent 62%), radial-gradient(ellipse 70% 45% at 50% 0%, rgba(224,231,255,0.14), transparent 72%)",
        opacity: 1,
      };
    case "morning":
      return {
        label: "pagi",
        overlay:
          "linear-gradient(to bottom, rgba(255,237,170,0.14), transparent 60%), radial-gradient(ellipse 80% 45% at 50% 0%, rgba(255,251,235,0.18), transparent 68%)",
        opacity: 1,
      };
    case "noon":
      return { label: "siang", overlay: "linear-gradient(to bottom, transparent, transparent)", opacity: 0 };
    case "afternoon":
      return {
        label: "sore",
        overlay:
          "linear-gradient(to bottom, rgba(255,213,128,0.13), transparent 58%), radial-gradient(ellipse 75% 50% at 50% 0%, rgba(255,237,213,0.12), transparent 72%)",
        opacity: 1,
      };
    case "evening":
      return {
        label: "senja",
        overlay:
          "linear-gradient(to bottom, rgba(251,146,60,0.10), transparent 62%), linear-gradient(to bottom, rgba(253,186,116,0.06), transparent 44%)",
        opacity: 1,
      };
    case "night":
      return {
        label: "malam",
        overlay:
          "linear-gradient(to bottom, rgba(199,210,254,0.11), transparent 65%), radial-gradient(ellipse 85% 55% at 50% 0%, rgba(224,231,255,0.08), transparent 70%)",
        opacity: 1,
      };
    case "latenight":
      return {
        label: "larut",
        overlay:
          "linear-gradient(to bottom, rgba(199,210,254,0.13), transparent 68%), radial-gradient(ellipse 90% 50% at 50% 0%, rgba(30,41,59,0.06), transparent 75%)",
        opacity: 1,
      };
  }
}
