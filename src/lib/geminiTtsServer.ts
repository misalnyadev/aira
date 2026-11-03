import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, users } from "@/db/schema";
import {
  isModernGeminiTtsModel,
  isRotatableTtsStatus,
  pcmToWav,
  pickBestAvailableTtsModel,
  sampleRateFromMime,
  type CharacterVoiceConfig,
  type TtsAccountConfig,
} from "./hdVoice";
import { buildKeyAttempts, parseBackupKeys, promoteKeyAtIndex } from "./providerPool";
import { listGeminiTtsModelsForKey } from "./ttsModelsServer";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_TIMEOUT_MS = 25_000;

export type GeminiSynthResult =
  | { ok: true; bytes: Uint8Array; mimeType: "audio/wav"; ext: "wav" }
  | { ok: false; error: string; status: number };

export function composeGeminiStyle(
  baseStyle: string,
  extraStyleHint?: string
): string {
  const base = baseStyle.trim();
  const extra = (extraStyleHint ?? "").trim();
  if (base && extra) return `${base}; ${extra}`.slice(0, 260);
  return (base || extra).slice(0, 260);
}

/**
 * Tentukan nama suara Gemini yang cocok untuk karakter ini berdasarkan pengaturan
 * halaman Suara (`TtsAccountConfig`) dan profil suara karakter (`CharacterVoiceConfig`).
 */
export function resolveCharacterGeminiVoice(params: {
  config: TtsAccountConfig;
  voiceConfig: CharacterVoiceConfig | null | undefined;
  fallbackSlot?: "female" | "male";
}): string {
  const { config, voiceConfig, fallbackSlot = "female" } = params;
  if (
    voiceConfig?.mode === "hd_custom" &&
    voiceConfig.customVoiceId &&
    voiceConfig.customProvider !== "elevenlabs" &&
    !/^[A-Za-z0-9]{18,}$/.test(voiceConfig.customVoiceId)
  ) {
    return voiceConfig.customVoiceId;
  }
  if (voiceConfig?.mode === "hd_male") {
    return config.geminiMaleVoice;
  }
  if (voiceConfig?.mode === "hd_female") {
    return config.geminiFemaleVoice;
  }
  return fallbackSlot === "male" ? config.geminiMaleVoice : config.geminiFemaleVoice;
}

function friendlyGeminiTtsError(status: number, rawBody: string): string {
  if (status === 429 || /resource_exhausted|quota/i.test(rawBody)) {
    return "Kuota Gemini TTS di key ini sedang habis (429). Tambahkan API key Gemini cadangan atau tunggu kuota pulih.";
  }
  if (status === 400 && /api key not valid|api_key_invalid/i.test(rawBody)) {
    return "API key Gemini tidak valid. Periksa kembali key dari aistudio.google.com.";
  }
  if (status === 401 || status === 403) {
    return "API key Gemini ditolak atau belum memiliki akses ke model suara ini.";
  }
  if (status === 404) {
    return "Model suara Gemini ini belum tersedia di API key kamu. Coba pilih model 2.5 Flash.";
  }
  if (status === 400 && /voice/i.test(rawBody)) {
    return "Nama suara Gemini tidak dikenali. Pilih salah satu suara seperti Kore, Aoede, Leda, atau Puck.";
  }
  return `Gemini TTS mengembalikan kendala (HTTP ${status}).`;
}

/**
 * Hasilkan audio WAV jernih dari Gemini HD TTS memakai pool API key pengguna
 * (menggabungkan key khusus di halaman Suara + provider Gemini di Setelan).
 */
export async function synthesizeGeminiAudioForUser(params: {
  userId: string;
  config: TtsAccountConfig;
  cleanedText: string;
  voiceName: string;
  extraStyleHint?: string;
}): Promise<GeminiSynthResult> {
  const { userId, config, cleanedText, voiceName, extraStyleHint } = params;

  const dedicatedKeys = buildKeyAttempts(
    "gemini",
    config.geminiApiKey,
    config.geminiBackupKeys
  );
  const providerRows = await db
    .select({
      apiKey: apiProviders.apiKey,
      backupKeys: apiProviders.backupKeys,
      isDefault: apiProviders.isDefault,
    })
    .from(apiProviders)
    .where(and(eq(apiProviders.userId, userId), eq(apiProviders.type, "gemini")))
    .orderBy(desc(apiProviders.isDefault));

  const sharedKeys: string[] = [];
  for (const row of providerRows) {
    if (row.apiKey?.trim()) sharedKeys.push(row.apiKey.trim());
    for (const bk of parseBackupKeys(row.backupKeys, row.apiKey)) {
      sharedKeys.push(bk);
    }
  }

  const allKeys = [...new Set([...dedicatedKeys, ...sharedKeys])].slice(0, 8);
  if (allKeys.length === 0) {
    return {
      ok: false,
      error:
        "API key Gemini belum ada. Tambahkan provider Gemini di menu Setelan, atau isi key Gemini di menu Suara.",
      status: 400,
    };
  }

  const styleText = composeGeminiStyle(config.geminiStyle, extraStyleHint);
  const modelsToTry = [
    ...new Set([
      config.geminiModelId,
      "gemini-3.8-flash-tts",
      "gemini-3.8-flash-lite-tts",
    ]),
  ];

  let triedDynamicHeal = false;
  let healedModel: string | null = null;
  let lastError = "Gagal menghubungi Gemini TTS.";
  let lastStatus = 502;

  for (let keyIdx = 0; keyIdx < allKeys.length; keyIdx++) {
    const key = allKeys[keyIdx];
    let shouldTryNextKey = false;

    for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
      const modelId = modelsToTry[mIdx];
      const url = `${GEMINI_BASE}/${encodeURIComponent(modelId)}:generateContent`;

      const callWithFormat = async (modern: boolean) => {
        const speechPart = modern
          ? {
              text: cleanedText,
              ...(styleText ? { speech_metadata: { style: styleText } } : {}),
            }
          : { text: styleText ? `${styleText}: ${cleanedText}` : cleanedText };

        return fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [speechPart] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: modern
                  ? { voice: voiceName }
                  : { prebuiltVoiceConfig: { voiceName } },
              },
            },
          }),
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        });
      };

      try {
        const preferModern = isModernGeminiTtsModel(modelId);
        let res = await callWithFormat(preferModern);
        let errBody = "";

        if (!res.ok) {
          errBody = await res.text().catch(() => "");
          if (
            res.status === 400 &&
            /voice_config|voiceConfig|prebuiltVoiceConfig|speech_metadata|unknown name/i.test(
              errBody
            )
          ) {
            const altRes = await callWithFormat(!preferModern);
            if (altRes.ok) {
              res = altRes;
              errBody = "";
            } else {
              res = altRes;
              errBody = await altRes.text().catch(() => "");
            }
          }
        }

        if (!res.ok) {
          lastStatus = res.status === 429 ? 429 : res.status;
          lastError = friendlyGeminiTtsError(res.status, errBody);

          if (res.status === 404) {
            if (mIdx < modelsToTry.length - 1) {
              continue;
            }
            if (!triedDynamicHeal) {
              triedDynamicHeal = true;
              try {
                const liveModels = await listGeminiTtsModelsForKey(key, 6_000);
                const liveBest = pickBestAvailableTtsModel(liveModels, "gemini", null);
                if (liveBest && !modelsToTry.includes(liveBest)) {
                  modelsToTry.push(liveBest);
                  healedModel = liveBest;
                  continue;
                }
              } catch {
                // Biarkan lanjut ke pelaporan error di bawah.
              }
            }
          }
          if (isRotatableTtsStatus(res.status, errBody) && keyIdx < allKeys.length - 1) {
            shouldTryNextKey = true;
          }
          break;
        }

        const data = (await res.json().catch(() => null)) as {
          candidates?: {
            content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
          }[];
        } | null;

        const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
        const base64 = part?.inlineData?.data;
        if (!base64) {
          lastStatus = 502;
          lastError = "Gemini tidak mengembalikan data audio.";
          if (keyIdx < allKeys.length - 1) shouldTryNextKey = true;
          break;
        }

        const raw = new Uint8Array(Buffer.from(base64, "base64"));
        const mime = part?.inlineData?.mimeType ?? "";
        const alreadyWav =
          /wav/i.test(mime) ||
          (raw[0] === 0x52 && raw[1] === 0x49 && raw[2] === 0x46 && raw[3] === 0x46);
        const wav = alreadyWav ? raw : pcmToWav(raw, sampleRateFromMime(mime));

        const promoted =
          keyIdx > 0 && keyIdx < dedicatedKeys.length
            ? promoteKeyAtIndex(config.geminiApiKey, config.geminiBackupKeys, keyIdx)
            : null;
        const persistModel =
          healedModel && modelId === healedModel && config.geminiModelId !== healedModel
            ? healedModel
            : null;

        if (promoted || persistModel) {
          const updated = {
            ...config,
            ...(promoted
              ? {
                  geminiApiKey: promoted.apiKey,
                  geminiBackupKeys: promoted.backupKeys,
                }
              : {}),
            ...(persistModel ? { geminiModelId: persistModel } : {}),
          };
          await db
            .update(users)
            .set({ ttsConfig: JSON.stringify(updated) })
            .where(eq(users.id, userId))
            .catch(() => undefined);
        }

        return { ok: true, bytes: wav, mimeType: "audio/wav", ext: "wav" };
      } catch {
        lastStatus = 504;
        lastError = "Koneksi ke Gemini TTS melewati batas waktu.";
        if (keyIdx < allKeys.length - 1) shouldTryNextKey = true;
        break;
      }
    }

    if (!shouldTryNextKey) break;
  }

  return { ok: false, error: lastError, status: lastStatus };
}
