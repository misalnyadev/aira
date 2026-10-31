import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  cleanVoiceId,
  isModernGeminiTtsModel,
  isRotatableTtsStatus,
  parseTtsConfig,
  pcmToWav,
  sampleRateFromMime,
  speakableHdText,
  supportsLanguageCode,
  type TtsAccountConfig,
} from "@/lib/hdVoice";
import { buildKeyAttempts, parseBackupKeys, promoteKeyAtIndex } from "@/lib/providerPool";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UNAUTHORIZED = { error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." };
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ELEVEN_TIMEOUT_MS = 15_000;
const GEMINI_TIMEOUT_MS = 25_000;

function friendlyElevenLabsError(status: number, rawBody: string): string {
  const lower = rawBody.toLowerCase();
  if (lower.includes("quota_exceeded") || status === 429) {
    return "Kuota karakter ElevenLabs habis atau kena batas laju. Tambahkan API key cadangan atau pakai Gemini TTS.";
  }
  if (
    lower.includes("paid_plan") ||
    lower.includes("free_users_not_allowed") ||
    lower.includes("library_voices")
  ) {
    return "Voice ID komunitas ini khusus paket berbayar di ElevenLabs. Pilih suara bawaan gratis atau beralih ke Gemini TTS.";
  }
  if (status === 404 || lower.includes("voice_not_found")) {
    return "Voice ID tidak ditemukan di ElevenLabs. Periksa kembali kodenya.";
  }
  if (status === 401 || status === 403) {
    return "API key ElevenLabs ditolak atau izin Text-to-Speech belum diaktifkan pada key tersebut.";
  }
  return `ElevenLabs mengembalikan kendala (HTTP ${status}).`;
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

async function synthesizeGemini(
  userId: string,
  config: TtsAccountConfig,
  cleanedText: string,
  slot: "female" | "male" | "custom" | undefined,
  customVoiceId: unknown
): Promise<Response> {
  // 1. Susun antrean API key: key khusus suara lebih dulu, lalu key provider Gemini di Setelan.
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
    return NextResponse.json(
      {
        error:
          "API key Gemini belum ada. Tambahkan provider Gemini di menu Setelan, atau isi key Gemini di menu Suara.",
      },
      { status: 400 }
    );
  }

  let voiceName = config.geminiFemaleVoice;
  if (slot === "male") {
    voiceName = config.geminiMaleVoice;
  } else if (slot === "custom") {
    const custom = cleanVoiceId(customVoiceId, "");
    if (!custom) {
      return NextResponse.json({ error: "Nama suara khusus tidak valid." }, { status: 400 });
    }
    voiceName = custom;
  }

  const styleText = config.geminiStyle.trim();
  const modelsToTry =
    config.geminiModelId === "gemini-2.5-flash-preview-tts"
      ? [config.geminiModelId]
      : [config.geminiModelId, "gemini-2.5-flash-preview-tts"];

  let lastError = "Gagal menghubungi Gemini TTS.";
  let lastStatus = 502;

  for (let keyIdx = 0; keyIdx < allKeys.length; keyIdx++) {
    const key = allKeys[keyIdx];
    let shouldTryNextKey = false;

    for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
      const modelId = modelsToTry[mIdx];
      const modern = isModernGeminiTtsModel(modelId);
      const speechPart = modern
        ? {
            text: cleanedText,
            ...(styleText ? { speech_metadata: { style: styleText } } : {}),
          }
        : { text: styleText ? `${styleText}: ${cleanedText}` : cleanedText };

      const url = `${GEMINI_BASE}/${encodeURIComponent(modelId)}:generateContent`;

      try {
        const res = await fetch(url, {
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

        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          lastStatus = res.status === 429 ? 429 : res.status;
          lastError = friendlyGeminiTtsError(res.status, errBody);

          // Bila model terbaru belum terbuka di key ini (404), coba model 2.5 pada key yang sama.
          if (res.status === 404 && mIdx < modelsToTry.length - 1) {
            continue;
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

        // Promosikan key cadangan khusus suara bila menang.
        if (keyIdx > 0 && keyIdx < dedicatedKeys.length) {
          const promoted = promoteKeyAtIndex(
            config.geminiApiKey,
            config.geminiBackupKeys,
            keyIdx
          );
          if (promoted) {
            const updated = {
              ...config,
              geminiApiKey: promoted.apiKey,
              geminiBackupKeys: promoted.backupKeys,
            };
            await db
              .update(users)
              .set({ ttsConfig: JSON.stringify(updated) })
              .where(eq(users.id, userId))
              .catch(() => undefined);
          }
        }

        return new Response(Buffer.from(wav), {
          status: 200,
          headers: {
            "Content-Type": "audio/wav",
            "Cache-Control": "no-store",
          },
        });
      } catch {
        lastStatus = 504;
        lastError = "Koneksi ke Gemini TTS melewati batas waktu.";
        if (keyIdx < allKeys.length - 1) shouldTryNextKey = true;
        break;
      }
    }

    if (!shouldTryNextKey) break;
  }

  return NextResponse.json({ error: lastError }, { status: lastStatus });
}

async function synthesizeElevenLabs(
  userId: string,
  config: TtsAccountConfig,
  cleanedText: string,
  slot: "female" | "male" | "custom" | undefined,
  customVoiceId: unknown
): Promise<Response> {
  const attempts = buildKeyAttempts("elevenlabs", config.apiKey, config.backupKeys);
  if (attempts.length === 0) {
    return NextResponse.json(
      { error: "API key ElevenLabs belum diisi di menu Suara." },
      { status: 400 }
    );
  }

  let voiceId = config.femaleVoiceId;
  if (slot === "male") {
    voiceId = config.maleVoiceId;
  } else if (slot === "custom") {
    const custom = cleanVoiceId(customVoiceId, "");
    if (!custom) {
      return NextResponse.json({ error: "Voice ID khusus tidak valid." }, { status: 400 });
    }
    voiceId = custom;
  }

  const payload: Record<string, unknown> = {
    text: cleanedText,
    model_id: config.modelId,
    voice_settings: {
      stability: config.stability,
      similarity_boost: config.similarityBoost,
    },
  };
  if (supportsLanguageCode(config.modelId)) {
    payload.language_code = "id";
  }

  const url = `${ELEVENLABS_BASE}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
  let lastError = "Gagal menghubungi ElevenLabs.";
  let lastStatus = 502;

  for (let idx = 0; idx < attempts.length; idx++) {
    const key = attempts[idx];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(ELEVEN_TIMEOUT_MS),
      });

      if (res.ok) {
        const audio = await res.arrayBuffer();
        if (idx > 0) {
          const promoted = promoteKeyAtIndex(config.apiKey, config.backupKeys, idx);
          if (promoted) {
            const updated = {
              ...config,
              apiKey: promoted.apiKey,
              backupKeys: promoted.backupKeys,
            };
            await db
              .update(users)
              .set({ ttsConfig: JSON.stringify(updated) })
              .where(eq(users.id, userId))
              .catch(() => undefined);
          }
        }
        return new Response(audio, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      }

      const errBody = await res.text().catch(() => "");
      lastStatus = res.status;
      lastError = friendlyElevenLabsError(res.status, errBody);

      if (isRotatableTtsStatus(res.status, errBody) && idx < attempts.length - 1) {
        continue;
      }
      break;
    } catch {
      lastStatus = 504;
      lastError = "Koneksi ke ElevenLabs melewati batas waktu.";
      if (idx < attempts.length - 1) continue;
    }
  }

  return NextResponse.json({ error: lastError }, { status: lastStatus });
}

export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Permintaan suara tidak valid." }, { status: 400 });
  }

  const { text, slot, customVoiceId } = body as {
    text?: unknown;
    slot?: "female" | "male" | "custom";
    customVoiceId?: unknown;
  };

  if (typeof text !== "string") {
    return NextResponse.json({ error: "Teks suara wajib diisi." }, { status: 400 });
  }

  const cleanedText = speakableHdText(text);
  if (!cleanedText) {
    return NextResponse.json({ error: "Tidak ada teks yang perlu dibacakan." }, { status: 400 });
  }

  const [row] = await db
    .select({ ttsConfig: users.ttsConfig })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const config = parseTtsConfig(row?.ttsConfig);
  if (config.provider === "elevenlabs") {
    return synthesizeElevenLabs(user.id, config, cleanedText, slot, customVoiceId);
  }
  return synthesizeGemini(user.id, config, cleanedText, slot, customVoiceId);
}
