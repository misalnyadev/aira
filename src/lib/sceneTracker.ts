/**
 * Pelacak Kontinuitas Adegan, Lokasi Pertemuan, & Arahan Pengguna (`Scene Tracker`).
 *
 * Berjalan murni di memori (< 1 ms, 0 panggilan API tambahan) pada setiap giliran
 * untuk SEMUA karakter agar model tidak mengalami "amnesia tengah obrolan":
 * 1) Menjaga kesadaran apakah saat ini mereka sedang BERTEMU LANGSUNG (mis. ngopi
 *    di kafe, jalan bareng, duduk sebelahan) vs ngobrol jarak jauh — sehingga tidak
 *    tiba-tiba bicara seolah cuma chatting atau menyuruh tidur saat lagi di kafe.
 * 2) Menjaga kesinambungan latar waktu di dalam adegan cerita (pagi/sarapan -> siang,
 *    tidak tiba-tiba lompat menyuruh tidur malam kecuali alurnya memang sudah malam).
 * 3) Mengunci koreksi/arahan yang sudah diberikan pengguna di pesan-pesan sebelumnya
 *    agar tidak dilupakan beberapa bubble kemudian.
 */

export type MinimalTurnRow = {
  role: string;
  content: string;
};

/** Penanda bahwa di dalam alur cerita mereka sedang bertemu / berada di satu tempat fisik. */
const IN_PERSON_ENTER_RE =
  /\b(ketemuan|ketemu\s+(?:langsung|di|yuk|sekarang|skrg)|(?:lagi|lg|sedang)\s+(?:ngopi|makan|duduk|jalan|nongkrong|di\s+kafe|di\s+cafe|di\s+warkop|di\s+restoran|di\s+resto|di\s+mobil|di\s+taman|di\s+kantor|di\s+studio|di\s+pantai|di\s+mall|di\s+bioskop|di\s+stasiun|di\s+bandara|berdua)|kita\s+(?:kan\s+)?(?:lagi|lg|sedang)\s+(?:di|ngopi|makan|duduk|jalan|nongkrong)|sini\s+(?:duduk|peluk|deketan|masuk)|nih\s+(?:kopinya|minumnya|makanannya|pesenannya|kursinya)|pesen\s+(?:kopi|makan|minum)|duduk\s+(?:di\s+sini|sebelahan|depanmu|bareng)|(?:sampai|sampe|udah\s+nyampe|udh\s+nyampe)\s+(?:di\s+)?(?:depan|sini|kafe|cafe|lokasi|tempat))\b/i;

/** Penanda bahwa pertemuan tatap muka sudah selesai / masing-masing sudah pulang. */
const IN_PERSON_LEAVE_RE =
  /\b((?:udah|udh)\s+(?:nyampe|sampai|sampe)\s+(?:di\s+)?(?:rumah|kos|kosan|kamar)|aku\s+pulang\s+dulu|kita\s+udahan\s+dulu|sampai\s+ketemu\s+(?:besok|lagi)|hati-hati\s+di\s+jalan\s+pulang)\b/i;

/** Nama lokasi pertemuan yang disebut dalam obrolan terakhir agar karakter tidak lupa sedang di mana. */
const LOCATION_EXTRACT_RE =
  /\b(?:di|ke|nyampe|sampai|sampe)\s+(kafe|cafe|kedai\s+kopi|warkop|restoran|resto|taman|mobil|studio|kantor|pantai|stasiun|bandara|mall|bioskop|balkon|teras|perpustakaan|kampus|ruang\s+tamu|apartemen|hotel)\b/i;

/** Penanda latar waktu di dalam alur adegan. */
const SCENE_MORNING_RE =
  /\b(sarapan|pagi-pagi|pagi\s+ini|selamat\s+pagi|ngopi\s+pagi|udara\s+pagi|matahari\s+terbit|berangkat\s+pagi)\b/i;
const SCENE_NOON_RE =
  /\b(makan\s+siang|siang\s+ini|panas\s+terik|istirahat\s+siang|jam\s+makan\s+siang)\b/i;
const SCENE_AFTERNOON_RE =
  /\b(sore\s+ini|ngabuburit|senja|matahari\s+terbenam|pulang\s+kerja|sore-sore)\b/i;
const SCENE_NIGHT_RE =
  /\b(makan\s+malam|malam\s+ini|tengah\s+malam|mau\s+tidur|(?:udah|udh)\s+ngantuk\s+mau\s+tidur|selamat\s+malam)\b/i;

/** Pola ketika pengguna sedang memberi arahan adegan / koreksi gaya bicara yang TIDAK BOLEH dilupakan. */
const USER_DIRECTION_RE =
  /\b((?:jangan|jgn)\s+(?:pakai|pake|ada|bilang|ngomong|keluar|sebut|bawa-bawa|terlalu)|kita\s+kan\s+(?:lagi|lg|sedang)|kan\s+kita\s+(?:lagi|lg|sedang|udah|udh)|fokus\s+(?:ke\s+)?(?:adegan|cerita|dialog|naskah)|adegan(?:nya)?\s+(?:ini|sekarang|skrg|serius)|cari\s+ide\s+(?:dialog|naskah|cerita)|buat\s+(?:dialog|naskah|cerita)|ingat\s+ya\s+kita|natural\s+aja|anggap\s+kita\s+(?:lagi|lg|sedang))\b/i;

export type ActiveSceneState = {
  inPerson: boolean;
  detectedLocation: string | null;
  sceneTimeHint: string | null;
  userDirections: string[];
};

function cleanSnippet(text: string, maxLen = 160): string {
  const single = text.replace(/\[Waktu pesan:[^\]]+\]/gi, "").replace(/\s+/g, " ").trim();
  if (single.length <= maxLen) return single;
  return `${single.slice(0, maxLen).trim()}…`;
}

/**
 * Ekstrak status adegan terkini & daftar koreksi/arahan pengguna dari ekor percakapan.
 */
export function extractActiveSceneState(
  recentTurns: readonly MinimalTurnRow[],
  currentUserText: string
): ActiveSceneState {
  const windowTurns = [
    ...recentTurns.slice(-24),
    ...(currentUserText.trim() ? [{ role: "user", content: currentUserText }] : []),
  ];

  let inPerson = false;
  let detectedLocation: string | null = null;
  let sceneTimeHint: string | null = null;
  const directions: string[] = [];

  for (const turn of windowTurns) {
    const raw = (turn.content || "").replace(/\[Waktu pesan:[^\]]+\]/gi, "").trim();
    if (!raw) continue;

    if (IN_PERSON_LEAVE_RE.test(raw)) {
      inPerson = false;
      detectedLocation = null;
    }
    if (IN_PERSON_ENTER_RE.test(raw)) {
      inPerson = true;
    }

    const locMatch = LOCATION_EXTRACT_RE.exec(raw);
    if (locMatch?.[1]) {
      detectedLocation = locMatch[1].trim();
    }

    if (SCENE_MORNING_RE.test(raw)) {
      sceneTimeHint = "pagi / sehabis waktu sarapan";
    } else if (SCENE_NOON_RE.test(raw)) {
      sceneTimeHint = "siang hari";
    } else if (SCENE_AFTERNOON_RE.test(raw)) {
      sceneTimeHint = "sore hari";
    } else if (SCENE_NIGHT_RE.test(raw)) {
      sceneTimeHint = "malam hari";
    }

    if (turn.role === "user" && USER_DIRECTION_RE.test(raw)) {
      const cleaned = cleanSnippet(raw, 170);
      if (cleaned && !directions.includes(cleaned)) {
        directions.push(cleaned);
      }
    }
  }

  return {
    inPerson,
    detectedLocation,
    sceneTimeHint,
    userDirections: directions.slice(-4),
  };
}

/**
 * Bangun blok pengingat kesinambungan adegan yang diletakkan di BAGIAN PALING BAWAH
 * system prompt supaya bobot perhatiannya paling kuat tepat sebelum model menjawab.
 */
export function buildSceneContinuityAnchor(
  recentTurns: readonly MinimalTurnRow[],
  currentUserText: string
): string {
  const state = extractActiveSceneState(recentTurns, currentUserText);
  const bullets: string[] = [];

  if (state.inPerson) {
    const locLabel = state.detectedLocation ? ` (${state.detectedLocation})` : "";
    bullets.push(
      `POSISI SAAT INI: Kalian SEDANG BERTEMU TATAP MUKA / BERADA BERSAMA DI TEMPAT YANG SAMA${locLabel}. Berdialoglah sebagai dua orang yang benar-benar sedang duduk/berada berhadapan langsung di lokasi itu — JANGAN bicara seolah kalian terpisah dan cuma sedang chatting lewat HP, dan JANGAN menyuruh pulang/tidur tiba-tiba saat masih mengobrol di tempat pertemuan.`
    );
  } else if (state.detectedLocation) {
    bullets.push(
      `LATAR TEMPAT TERAKHIR YANG DISEBUT: ${state.detectedLocation}. Jaga agar responsmu tetap nyambung dengan tempat dan situasi tersebut sampai alurnya memang berpindah.`
    );
  }

  if (state.sceneTimeHint) {
    bullets.push(
      `SUASANA WAKTU DI ALUR OBROLAN: ${state.sceneTimeHint}. Patuhi alur waktu cerita ini secara konsisten (mis. kalau baru habis sarapan atau sedang nongkrong ngopi, jangan tiba-tiba melompat bilang sudah larut malam / waktunya tidur dan jangan begadang).`
    );
  }

  if (state.userDirections.length > 0) {
    const dirList = state.userDirections.map((d) => `  • "${d}"`).join("\n");
    bullets.push(
      `ARAHAN & KOREKSI DARI LAWAN BICARA YANG WAJIB TERUS DIPATUHI (jangan dilupakan di pesan-pesan berikutnya):\n${dirList}`
    );
  }

  if (bullets.length === 0) return "";

  return `
=== JANGKAR KONTINUITAS ADEGAN & ARAHAN AKTIF (PRIORITAS TERTINGGI SAAT MENJAWAB) ===
${bullets.map((b, i) => `${i + 1}. ${b}`).join("\n")}
=== AKHIR JANGKAR ADEGAN ===`;
}
