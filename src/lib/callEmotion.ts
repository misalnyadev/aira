/**
 * Pengarah Ekspresi Emosi Video Call (`Call Emotion`).
 *
 * Saat mode Video Call aktif, model AI diminta mengawali balasannya dengan satu
 * penanda suasana singkat (`[NORMAL]`, `[LAUGH]`, `[SHY]`, atau `[POUT]`).
 * Modul ini:
 * 1) Mencabut seluruh tag `[...]` tersebut sehingga teks yang disimpan ke
 *    database ruang chat maupun yang dibacakan Gemini TTS / ElevenLabs 100% bersih.
 * 2) Menebak ekspresi cadangan secara alami dari kata-kata Bahasa Indonesia bila
 *    model lupa menyertakan tag.
 */

export type CallEmotion = "normal" | "laugh" | "shy" | "pout";

const TAG_MAP: Record<string, CallEmotion> = {
  NORMAL: "normal",
  TALK: "normal",
  WARM: "normal",
  SMILE: "normal",
  CALM: "normal",
  LAUGH: "laugh",
  LAUGHING: "laugh",
  GIGGLE: "laugh",
  HAPPY: "laugh",
  EXCITED: "laugh",
  SHY: "shy",
  BLUSH: "shy",
  SWEET: "shy",
  LOVE: "shy",
  AFFECTIONATE: "shy",
  POUT: "pout",
  SULK: "pout",
  TEASED: "pout",
  CONFUSED: "pout",
  SURPRISED: "pout",
  SHOCKED: "pout",
  SAD: "pout",
};

const EMOTION_TAG_RE =
  /^\s*\[?\s*(NORMAL|TALK|WARM|SMILE|CALM|LAUGH|LAUGHING|GIGGLE|HAPPY|EXCITED|SHY|BLUSH|SWEET|LOVE|AFFECTIONATE|POUT|SULK|TEASED|CONFUSED|SURPRISED|SHOCKED|SAD)\s*\]\s*[:\-–—]?\s*/i;

const INLINE_EMOTION_TAG_RE =
  /\[\s*(NORMAL|TALK|WARM|SMILE|CALM|LAUGH|LAUGHING|GIGGLE|HAPPY|EXCITED|SHY|BLUSH|SWEET|LOVE|AFFECTIONATE|POUT|SULK|TEASED|CONFUSED|SURPRISED|SHOCKED|SAD)\s*\]/gi;

const LAUGH_WORDS_RE =
  /\b(hahaha+|hehehe+|hihihi+|wkwk+|wakaka+|ketawa|ngakak|lucu\s+banget|bisa\s+aja\s+kamu|kocak|receh\s+banget|ampun\s+deh\s+haha)\b/i;

const SHY_WORDS_RE =
  /\b(jadi\s+malu|malu\s+ah|ih\s+malu|salting|bikin\s+baper|deg-degan|kangen\s+banget|aku\s+juga\s+kangen|sayang\s+kamu|sayang\s+banget|makasih\s+ya\s+sayang|manis\s+banget\s+sih|gombal\s+terus|jangan\s+liatin\s+gitu)\b/i;

const POUT_WORDS_RE =
  /\b(nyebelin|jahat\s+banget|jahat\s+ih|ih\s+kok\s+gitu|kok\s+gitu\s+sih|ngambek|sebel\s+ah|sebel\s+banget|awas\s+ya\s+kamu|ih\s+apaan\s+sih|hah\s+serius|masa\s+sih|eh\s+seriusan|bohong\s+ya|tega\s+banget)\b/i;

export function inferEmotionFromIndonesianText(text: string): CallEmotion {
  const sample = text.trim();
  if (!sample) return "normal";
  if (LAUGH_WORDS_RE.test(sample)) return "laugh";
  if (SHY_WORDS_RE.test(sample)) return "shy";
  if (POUT_WORDS_RE.test(sample)) return "pout";
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
