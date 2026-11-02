import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ttsClips, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  geminiEmotionStyleHint,
  isValidCallEmotion,
  type CallEmotion,
} from "@/lib/callEmotion";
import { ensureDb } from "@/lib/dbReady";
import {
  composeGeminiStyle,
  synthesizeGeminiAudioForUser,
} from "@/lib/geminiTtsServer";
import {
  cleanVoiceId,
  isRotatableTtsStatus,
  parseTtsConfig,
  speakableHdText,
  supportsLanguageCode,
  ttsClipHash,
  type HdTtsProvider,
  type TtsAccountConfig,
} from "@/lib/hdVoice";
import { buildKeyAttempts, promoteKeyAtIndex } from "@/lib/providerPool";
import { getR2Object, isR2Configured, putR2Object } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UNAUTHORIZED = { error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." };
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVEN_TIMEOUT_MS = 15_000;

type SynthResult =
  | { ok: true; bytes: Uint8Array; mimeType: string; ext: "wav" | "mp3" }
  | { ok: false; error: string; status: number };

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

async function synthesizeElevenLabsBytes(
  userId: string,
  config: TtsAccountConfig,
  cleanedText: string,
  voiceId: string
): Promise<SynthResult> {
  const attempts = buildKeyAttempts("elevenlabs", config.apiKey, config.backupKeys);
  if (attempts.length === 0) {
    return {
      ok: false,
      error: "API key ElevenLabs belum diisi di menu Suara.",
      status: 400,
    };
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
        const audio = new Uint8Array(await res.arrayBuffer());
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
        return { ok: true, bytes: audio, mimeType: "audio/mpeg", ext: "mp3" };
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

  return { ok: false, error: lastError, status: lastStatus };
}

export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Permintaan suara tidak valid." }, { status: 400 });
  }

  const { text, slot, provider, customVoiceId, emotion } = body as {
    text?: unknown;
    slot?: "female" | "male" | "custom";
    provider?: unknown;
    customVoiceId?: unknown;
    emotion?: unknown;
  };

  if (typeof text !== "string") {
    return NextResponse.json({ error: "Teks suara wajib diisi." }, { status: 400 });
  }

  const cleanedText = speakableHdText(text);
  if (!cleanedText) {
    return NextResponse.json({ error: "Tidak ada teks yang perlu dibacakan." }, { status: 400 });
  }

  const activeEmotion: CallEmotion | undefined = isValidCallEmotion(emotion)
    ? emotion
    : undefined;
  const emotionStyle = geminiEmotionStyleHint(activeEmotion);

  const [row] = await db
    .select({ ttsConfig: users.ttsConfig })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const config = parseTtsConfig(row?.ttsConfig);
  const effectiveProvider: HdTtsProvider =
    provider === "gemini" || provider === "elevenlabs" ? provider : config.provider;

  let voice = "";
  let styleForHash = "";
  if (effectiveProvider === "gemini") {
    styleForHash = composeGeminiStyle(config.geminiStyle, emotionStyle);
    if (slot === "male") {
      voice = config.geminiMaleVoice;
    } else if (slot === "custom") {
      voice = cleanVoiceId(customVoiceId, "");
    } else {
      voice = config.geminiFemaleVoice;
    }
  } else {
    if (slot === "male") {
      voice = config.maleVoiceId;
    } else if (slot === "custom") {
      voice = cleanVoiceId(customVoiceId, "");
    } else {
      voice = config.femaleVoiceId;
    }
  }

  if (!voice) {
    return NextResponse.json({ error: "Suara khusus tidak valid." }, { status: 400 });
  }

  const clipHash = ttsClipHash({
    provider: effectiveProvider,
    voice,
    style: styleForHash,
    text: cleanedText,
  });

  // 1. Cek Bank Rekaman di Cloudflare R2 lebih dulu (jalan walau tanpa API key!).
  if (isR2Configured()) {
    const [existing] = await db
      .select()
      .from(ttsClips)
      .where(and(eq(ttsClips.userId, user.id), eq(ttsClips.clipHash, clipHash)))
      .limit(1);

    if (existing) {
      const fromR2 = await getR2Object(existing.r2Key);
      if (fromR2) {
        return new Response(fromR2.body, {
          status: 200,
          headers: {
            "Content-Type": existing.mimeType || fromR2.contentType,
            "X-Tts-Source": "r2",
            "X-Tts-Hash": clipHash,
            "Cache-Control": "no-store",
          },
        });
      }
      await db
        .delete(ttsClips)
        .where(eq(ttsClips.id, existing.id))
        .catch(() => undefined);
    }
  }

  // 2. Belum ada di R2 -> buat lewat API Gemini / ElevenLabs.
  const result: SynthResult =
    effectiveProvider === "elevenlabs"
      ? await synthesizeElevenLabsBytes(user.id, config, cleanedText, voice)
      : await synthesizeGeminiAudioForUser({
          userId: user.id,
          config,
          cleanedText,
          voiceName: voice,
          extraStyleHint: emotionStyle,
        });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // 3. Simpan hasil ke Cloudflare R2 + indeks akun agar langsung bisa dipakai di PC & HP.
  if (isR2Configured()) {
    const r2Key = `tts/${user.id}/${clipHash}.${result.ext}`;
    const stored = await putR2Object(r2Key, result.bytes, result.mimeType);
    if (stored) {
      await db
        .insert(ttsClips)
        .values({
          userId: user.id,
          clipHash,
          r2Key,
          provider: effectiveProvider,
          voice,
          text: cleanedText,
          mimeType: result.mimeType,
          bytes: result.bytes.byteLength,
        })
        .onConflictDoUpdate({
          target: [ttsClips.userId, ttsClips.clipHash],
          set: {
            r2Key,
            mimeType: result.mimeType,
            bytes: result.bytes.byteLength,
            createdAt: new Date(),
          },
        })
        .catch(() => undefined);
    }
  }

  return new Response(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.mimeType,
      "X-Tts-Source": "api",
      "X-Tts-Hash": clipHash,
      "Cache-Control": "no-store",
    },
  });
}
