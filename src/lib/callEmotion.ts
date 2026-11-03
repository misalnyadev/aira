/**
 * Pengarah Ekspresi & Intonasi Panggilan (`Call Emotion`).
 *
 * Saat mode Video Call maupun Telepon Suara aktif, model AI diminta mengawali
 * balasannya dengan satu penanda ekspresi singkat:
 * `[NORMAL]`, `[SMILE]`, `[LAUGH]`, `[SHY]`, `[POUT]`,
 * `[CONFUSED]`, `[ANGRY]`, `[SAD]`, atau `[SURPRISED]`.
 *
 * Modul ini:
 * 1) Mencabut seluruh tag `[...]` tersebut sehingga teks yang disimpan ke
 *    database ruang chat maupun yang dibacakan TTS 100% bersih.
 * 2) Menebak ekspresi cadangan secara alami dari kata-kata Bahasa Indonesia bila
 *    model lupa menyertakan tag.
 * 3) Menyediakan arahan gaya intonasi suara untuk Gemini HD TTS (`geminiEmotionStyleHint`)
 *    serta pemangkas vokalisasi awal (`stripLeadingReactionCue`) agar asset audio
 *    reaksi pendek dan kalimat jawaban utama terdengar menyambung utuh.
 */

export const CALL_EMOTIONS = [
  "normal",
  "smile",
  "laugh",
  "shy",
  "pout",
  "confused",
  "angry",
  "sad",
  "surprised",
] as const;

export type CallEmotion = (typeof CALL_EMOTIONS)[number];

export function isValidCallEmotion(value: unknown): value is CallEmotion {
  return typeof value === "string" && (CALL_EMOTIONS as readonly string[]).includes(value);
}

const TAG_MAP: Record<string, CallEmotion> = {
  // Biasa / netral
  NORMAL: "normal",
  TALK: "normal",
  CALM: "normal",
  BIASA: "normal",
  SANTAI: "normal",
  // Senyum hangat
  SMILE: "smile",
  WARM: "smile",
  HAPPY: "smile",
  GLAD: "smile",
  SENYUM: "smile",
  SENANG: "smile",
  // Tertawa / bercanda
  LAUGH: "laugh",
  LAUGHING: "laugh",
  GIGGLE: "laugh",
  EXCITED: "laugh",
  TAWA: "laugh",
  TERTAWA: "laugh",
  // Malu / tersipu
  SHY: "shy",
  BLUSH: "shy",
  SWEET: "shy",
  LOVE: "shy",
  AFFECTIONATE: "shy",
  MALU: "shy",
  SALTING: "shy",
  // Cemberut / ngambek manja
  POUT: "pout",
  SULK: "pout",
  TEASED: "pout",
  CEMBERUT: "pout",
  NGAMBEK: "pout",
  // Bingung / heran
  CONFUSED: "confused",
  PUZZLED: "confused",
  WONDER: "confused",
  BINGUNG: "confused",
  HERAN: "confused",
  // Marah / kesal
  ANGRY: "angry",
  MAD: "angry",
  ANNOYED: "angry",
  UPSET: "angry",
  MARAH: "angry",
  KESAL: "angry",
  // Sedih / empati
  SAD: "sad",
  SORRY: "sad",
  SYMPATHY: "sad",
  TOUCHED: "sad",
  SEDIH: "sad",
  TERHARU: "sad",
  // Kaget / tak menyangka
  SURPRISED: "surprised",
  SHOCKED: "surprised",
  AMAZED: "surprised",
  KAGET: "surprised",
  TERKEJUT: "surprised",
};

const TAG_NAMES_PATTERN = Object.keys(TAG_MAP).join("|");

const EMOTION_TAG_RE = new RegExp(
  `^\\s*\\[?\\s*(${TAG_NAMES_PATTERN})\\s*\\]\\s*[:\\-–—]?\\s*`,
  "i"
);

const INLINE_EMOTION_TAG_RE = new RegExp(
  `\\[\\s*(${TAG_NAMES_PATTERN})\\s*\\]`,
  "gi"
);

const LAUGH_WORDS_RE =
  /([😂🤣😆😹]|\b(hahaha+|wakaka+|wkwk+|ketawa|ngakak|lucu\s+banget|kocak|receh\s+banget|ampun\s+deh\s+haha)\b)/iu;

const SHY_WORDS_RE =
  /([😳🙈🫣💓💕💞🥰😘]|\b(jadi\s+malu|malu\s+ah|ih\s+malu|salting|bikin\s+baper|deg-degan|kangen\s+banget|aku\s+juga\s+kangen|sayang\s+kamu|sayang\s+banget|manis\s+banget\s+sih|gombal\s+terus|jangan\s+liatin\s+gitu)\b)/iu;

const SURPRISED_WORDS_RE =
  /([😲😱🤯😮😯]|\b(astaga|ya\s+ampun|hah\s+serius|seriusan\s*\?!|beneran\s*\?!|demi\s+apa|masa\s+iya\s*\?!|kaget\s+aku|nggak\s+nyangka)\b)/iu;

const ANGRY_WORDS_RE =
  /([😠😡🤬💢]|\b(kesel\s+banget|marah\s+nih|nyebelin\s+banget\s+sih|jangan\s+gitu\s+dong|kebangetan|parah\s+banget\s+kamu|capek\s+tau\s+nggak|males\s+ah\s+sama\s+kamu)\b)/iu;

const SAD_WORDS_RE =
  /([😢😭🥺💔😔😞😿]|\b(ikut\s+sedih|sedih\s+banget|kasihan\s+banget|sayang\s+banget\s+ya|maafin\s+aku\s+ya|turut\s+berduka|pasti\s+berat\s+banget|terharu\s+aku|rasanya\s+nyesek)\b)/iu;

const CONFUSED_WORDS_RE =
  /([🤔😕🤨🧐❓]|\b(maksudnya\s+gimana|gimana\s+maksudnya|aku\s+bingung|kok\s+bisa\s+gitu|tunggu\s+deh\s+kok|lah\s+terus\s+gimana|yang\s+mana\s+sih)\b)/iu;

const POUT_WORDS_RE =
  /([😤😒🙄😣😖]|\b(nyebelin|jahat\s+ih|ih\s+kok\s+gitu|kok\s+gitu\s+sih|ngambek|sebel\s+ah|awas\s+ya\s+kamu|ih\s+apaan\s+sih|bohong\s+ya|tega\s+banget)\b)/iu;

const SMILE_WORDS_RE =
  /([😊☺️🙂😄😁🤗✨]|\b(hehe+|seneng\s+banget|syukurlah|alhamdulillah|asik\s+banget|makasih\s+banyak\s+ya|wah\s+seru|ikut\s+seneng)\b)/iu;

export function inferEmotionFromIndonesianText(text: string): CallEmotion {
  const sample = text.trim();
  if (!sample) return "normal";
  if (LAUGH_WORDS_RE.test(sample)) return "laugh";
  if (SHY_WORDS_RE.test(sample)) return "shy";
  if (SURPRISED_WORDS_RE.test(sample)) return "surprised";
  if (ANGRY_WORDS_RE.test(sample)) return "angry";
  if (SAD_WORDS_RE.test(sample)) return "sad";
  if (CONFUSED_WORDS_RE.test(sample)) return "confused";
  if (POUT_WORDS_RE.test(sample)) return "pout";
  if (SMILE_WORDS_RE.test(sample)) return "smile";
  return "normal";
}

export function extractCallReplyEmotion(rawText: string): {
  cleanText: string;
  emotion: CallEmotion;
} {
  let detected: CallEmotion | null = null;
  let working = rawText.trim();

  const leading = EMOTION_TAG_RE.exec(working);
  if (leading) {
    detected = TAG_MAP[leading[1].toUpperCase()] ?? "normal";
    working = working.slice(leading[0].length).trim();
  }

  working = working
    .replace(INLINE_EMOTION_TAG_RE, (_, rawTag: string) => {
      if (!detected) {
        detected = TAG_MAP[rawTag.toUpperCase()] ?? null;
      }
      return " ";
    })
    .replace(/\s{2,}/g, " ")
    .trim();

  const cleanText = working || rawText.replace(INLINE_EMOTION_TAG_RE, "").trim();
  const emotion = detected ?? inferEmotionFromIndonesianText(cleanText);

  return { cleanText, emotion };
}

/**
 * Arahan intonasi tambahan untuk Gemini HD TTS (`speech_metadata.style`)
 * agar warna suara kalimat utama di Video Call maupun Telepon Suara ikut
 * mengekspresikan suasana hati jawaban secara alami.
 */
export function geminiEmotionStyleHint(emotion: CallEmotion | undefined): string {
  switch (emotion) {
    case "smile":
      return "bicara sambil tersenyum hangat, ramah, dan akrab";
    case "laugh":
      return "bicara ceria dengan sisa tawa ringan yang natural dan menyenangkan";
    case "shy":
      return "bicara lembut, pelan, dan agak tersipu malu-malu";
    case "pout":
      return "bicara dengan nada cemberut manja dan sedikit merajuk";
    case "confused":
      return "bicara dengan nada bingung, heran, dan bertanya-tanya secara alami";
    case "angry":
      return "bicara dengan nada kesal, protes tegas, tapi tetap manusiawi";
    case "sad":
      return "bicara pelan dengan nada sedih, lirih, lembut, dan penuh empati";
    case "surprised":
      return "bicara spontan dengan nada kaget, tak menyangka, dan ekspresif";
    default:
      return "";
  }
}

const LEADING_CUE_PATTERNS: Partial<Record<CallEmotion, RegExp>> = {
  smile:
    /^(?:(?:h+e+(?:h+e+)+|i+y+a+)(?=[,.!~…\-–—\s]|$)(?:\s*[,.!~…\-–—]*\s*)*)+/i,
  laugh:
    /^(?:(?:a*h+a+(?:h+a+)+|e*h+e+(?:h+e+)+|h+i+(?:h+i+)+|(?:wk){2,}w*k*|wakaka+k*)(?=[,.!~…\-–—\s]|$)(?:\s*[,.!~…\-–—]*\s*)*)+/i,
  shy:
    /^(?:(?:e+h+e+(?:h+e+)*|h+e+(?:h+e+)+|u+h+m+|e+m+m+|h+m+m+)(?=[,.!~…\-–—\s]|$)(?:\s*[,.!~…\-–—]*\s*)*)+/i,
  pout:
    /^(?:(?:h+m+p*h*|h+u+h+|i+s*h+)(?=[,.!~…\-–—\s]|$)(?:\s*[,.!~…\-–—]+\s*|\s+)+)+/i,
  confused:
    /^(?:(?:e+h+|h+a+h+|h+m+m+|l+o+h+)(?=[,.!?~…\-–—\s]|$)(?:\s*[,.!?~…\-–—]+\s*|\s+)+)+/i,
  angry:
    /^(?:(?:c+k+|t+c+k+|i+s*h+|d+i+h+|h+u+f+t*)(?=[,.!?~…\-–—\s]|$)(?:\s*[,.!?~…\-–—]+\s*|\s+)+)+/i,
  sad:
    /^(?:(?:y+a+h+|h+u+h+u+|a+d+u+h+|h+u+f+t*)(?=[,.!?~…\-–—\s]|$)(?:\s*[,.!?~…\-–—]+\s*|\s+)+)+/i,
  surprised:
    /^(?:(?:l+o+h+|e+h+|h+a+h+|w+a+h+|a+s+t+a+g+a+)(?=[,.!?~…\-–—\s]|$)(?:\s*[,.!?~…\-–—]+\s*|\s+)+)+/i,
};

/**
 * Pangkas kata reaksi vokal pembuka (mis. "Hahaha, ...", "Yah, ...", "Eh? ...")
 * saat klip audio reaksi asli sudah diputar lebih dulu di detik ke-0, agar karakter
 * tidak terdengar mengulang reaksi dua kali sementara teks di ruang chat tetap utuh.
 */
export function stripLeadingReactionCue(
  text: string,
  emotion: CallEmotion
): string {
  const sample = text.trim();
  if (!sample || emotion === "normal") return sample;

  const pattern = LEADING_CUE_PATTERNS[emotion];
  if (!pattern) return sample;

  const rest = sample.replace(pattern, "").trim();
  if (emotion === "laugh") {
    return rest;
  }
  return rest || sample;
}
