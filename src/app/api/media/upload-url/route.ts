import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { findOwnedCharacter } from "@/lib/owned";
import { isR2Configured, presignR2Url } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const MAX_VIDEO_BYTES = 24 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

type MediaSlot = "chatVideo" | "callVideo" | "callAudio";

const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v"]);
const AUDIO_EXTS = new Set(["mp3", "m4a", "aac", "ogg", "wav"]);

function resolveExtension(slot: MediaSlot, filename: string, contentType: string): string | null {
  const fromName = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  if (slot === "callAudio") {
    if (AUDIO_EXTS.has(fromName)) return fromName;
    if (contentType.includes("wav")) return "wav";
    if (contentType.includes("ogg")) return "ogg";
    if (contentType.includes("mp4") || contentType.includes("m4a") || contentType.includes("aac")) {
      return "m4a";
    }
    if (contentType.startsWith("audio/")) return "mp3";
    return null;
  }

  if (VIDEO_EXTS.has(fromName)) return fromName;
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("quicktime")) return "mov";
  if (contentType.startsWith("video/")) return "mp4";
  return null;
}

/**
 * Buat tiket unggah langsung (Presigned PUT URL) ke Cloudflare R2.
 * File video/suara dikirim langsung dari iPhone ke R2 tanpa melewati batas 4,5 MB Vercel.
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
          "Penyimpanan media Cloudflare R2 belum aktif. Pastikan R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, dan R2_SECRET_ACCESS_KEY sudah diisi di Vercel lalu redeploy.",
      },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const { characterId, slot, contentType, bytes, filename } = body as {
    characterId?: unknown;
    slot?: unknown;
    contentType?: unknown;
    bytes?: unknown;
    filename?: unknown;
  };

  if (typeof characterId !== "string" || !characterId) {
    return NextResponse.json({ error: "Karakter tidak valid." }, { status: 400 });
  }

  if (slot !== "chatVideo" && slot !== "callVideo" && slot !== "callAudio") {
    return NextResponse.json({ error: "Jenis media tidak dikenal." }, { status: 400 });
  }

  const owned = await findOwnedCharacter(characterId, user.id);
  if (!owned) {
    return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  }

  const size = typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0;
  if (size <= 0) {
    return NextResponse.json({ error: "Berkas kosong." }, { status: 400 });
  }

  const limit = slot === "callAudio" ? MAX_AUDIO_BYTES : MAX_VIDEO_BYTES;
  if (size > limit) {
    const maxMb = Math.round(limit / (1024 * 1024));
    return NextResponse.json(
      { error: `Ukuran berkas melebihi batas maksimal ${maxMb} MB.` },
      { status: 413 }
    );
  }

  const mime = typeof contentType === "string" ? contentType.toLowerCase() : "";
  const name = typeof filename === "string" ? filename : "";
  const ext = resolveExtension(slot, name, mime);
  if (!ext) {
    return NextResponse.json(
      {
        error:
          slot === "callAudio"
            ? "Pilih berkas suara (MP3, M4A, AAC, OGG, atau WAV)."
            : "Pilih berkas video (MP4, MOV, atau WebM).",
      },
      { status: 400 }
    );
  }

  const key = `media/${user.id}/${characterId}/${slot}-${crypto.randomUUID()}.${ext}`;
  const uploadUrl = presignR2Url({
    method: "PUT",
    key,
    expiresInSeconds: 900,
  });
  const playUrl = presignR2Url({
    method: "GET",
    key,
    expiresInSeconds: 21600,
  });

  return NextResponse.json({ key, uploadUrl, playUrl });
}
