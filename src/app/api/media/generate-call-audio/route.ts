import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  DEFAULT_CALL_AUDIO_PACK,
  isValidCallAudioSlot,
} from "@/lib/characterMedia";
import { ensureDb } from "@/lib/dbReady";
import {
  resolveCharacterGeminiVoice,
  synthesizeGeminiAudioForUser,
} from "@/lib/geminiTtsServer";
import {
  parseCharacterVoice,
  parseTtsConfig,
  speakableHdText,
} from "@/lib/hdVoice";
import { findOwnedCharacter } from "@/lib/owned";
import { isR2Configured, putR2Object } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Buat atau buat ulang (regenerate) satu asset audio ekspresi panggilan
 * langsung memakai pengaturan Suara HD Gemini milik pengguna, lalu simpan ke R2.
 */
export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      {
        error:
          "Penyimpanan media Cloudflare R2 belum aktif di server ini.",
      },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const { characterId, audioSlot, text, fallbackSlot } = body as {
    characterId?: unknown;
    audioSlot?: unknown;
    text?: unknown;
    fallbackSlot?: unknown;
  };

  if (typeof characterId !== "string" || !characterId) {
    return NextResponse.json({ error: "Karakter tidak valid." }, { status: 400 });
  }

  if (!isValidCallAudioSlot(audioSlot)) {
    return NextResponse.json({ error: "Slot ekspresi audio tidak dikenal." }, { status: 400 });
  }

  const owned = await findOwnedCharacter(characterId, user.id);
  if (!owned) {
    return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  }

  const preset = DEFAULT_CALL_AUDIO_PACK[audioSlot];
  const rawScript =
    typeof text === "string" && text.trim()
      ? text.trim().slice(0, 140)
      : preset.defaultText;
  const cleanedScript = speakableHdText(rawScript);
  if (!cleanedScript) {
    return NextResponse.json(
      { error: "Isi kata ekspresi tidak boleh kosong." },
      { status: 400 }
    );
  }

  const [userRow] = await db
    .select({ ttsConfig: users.ttsConfig })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const ttsConfig = parseTtsConfig(userRow?.ttsConfig);
  const charVoice = parseCharacterVoice(owned.voiceConfig);
  const voiceName = resolveCharacterGeminiVoice({
    config: ttsConfig,
    voiceConfig: charVoice,
    fallbackSlot: fallbackSlot === "male" ? "male" : "female",
  });

  const synth = await synthesizeGeminiAudioForUser({
    userId: user.id,
    config: ttsConfig,
    cleanedText: cleanedScript,
    voiceName,
    extraStyleHint: preset.styleHint,
  });

  if (!synth.ok) {
    return NextResponse.json({ error: synth.error }, { status: synth.status });
  }

  const key = `media/${user.id}/${owned.id}/callAudio-${randomUUID()}.${synth.ext}`;
  const stored = await putR2Object(key, synth.bytes, synth.mimeType);
  if (!stored) {
    return NextResponse.json(
      { error: "Gagal menyimpan audio hasil Gemini ke Cloudflare R2." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    key,
    name: `${audioSlot}-${voiceName.toLowerCase()}.wav`,
    text: rawScript,
    voice: voiceName,
  });
}
