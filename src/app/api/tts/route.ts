import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  cleanVoiceId,
  isRotatableTtsStatus,
  parseTtsConfig,
  speakableHdText,
  supportsLanguageCode,
} from "@/lib/hdVoice";
import { buildKeyAttempts, promoteKeyAtIndex } from "@/lib/providerPool";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." };
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const TTS_TIMEOUT_MS = 15_000;

function friendlyElevenLabsError(status: number, rawBody: string): string {
  const lower = rawBody.toLowerCase();
  if (lower.includes("quota_exceeded") || status === 429) {
    return "Kuota karakter ElevenLabs habis atau kena batas laju. Tambahkan API key cadangan atau pakai suara Perangkat.";
  }
  if (
    lower.includes("paid_plan") ||
    lower.includes("free_users_not_allowed") ||
    lower.includes("library_voices")
  ) {
    return "Voice ID komunitas ini khusus paket berbayar di ElevenLabs. Pilih suara bawaan gratis (Sarah/Jessica/Rachel/Brian/Liam/Daniel) atau suara kreasi sendiri.";
  }
  if (status === 404 || lower.includes("voice_not_found")) {
    return "Voice ID tidak ditemukan di ElevenLabs. Periksa kembali kodenya.";
  }
  if (status === 401 || status === 403) {
    return "API key ElevenLabs ditolak atau izin Text-to-Speech belum diaktifkan pada key tersebut.";
  }
  return `ElevenLabs mengembalikan kendala (HTTP ${status}).`;
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
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
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
              .where(eq(users.id, user.id))
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

      if (isRotatableTtsStatus(res.status) && idx < attempts.length - 1) {
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
