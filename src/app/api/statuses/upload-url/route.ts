import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { isR2Configured, presignR2Url } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const MAX_STATUS_VIDEO_BYTES = 40 * 1024 * 1024;

const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v"]);

function resolveExt(filename: string, contentType: string): string | null {
  const fromName = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  if (VIDEO_EXTS.has(fromName)) return fromName;
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("quicktime")) return "mov";
  if (contentType.startsWith("video/")) return "mp4";
  return null;
}

export async function POST(req: Request) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  if (!isR2Configured()) {
    return NextResponse.json({ error: "R2 belum dikonfigurasi di server." }, { status: 503 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });

  const { contentType, bytes, filename, kind } = body as {
    contentType?: unknown;
    bytes?: unknown;
    filename?: unknown;
    kind?: unknown;
  };

  const size = typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0;
  if (size <= 0) return NextResponse.json({ error: "Berkas kosong." }, { status: 400 });
  if (size > MAX_STATUS_VIDEO_BYTES) return NextResponse.json({ error: "Video maksimal 40 MB." }, { status: 413 });

  const mime = typeof contentType === "string" ? contentType.toLowerCase() : "";
  const name = typeof filename === "string" ? filename : "";
  const ext = resolveExt(name, mime);
  if (!ext) return NextResponse.json({ error: "Pilih video MP4/MOV/WebM." }, { status: 400 });

  const isReel = kind === "reel";
  const prefix = isReel ? "statusReel" : "statusVideo";
  const key = `media/${user.id}/${prefix}-${crypto.randomUUID()}.${ext}`;
  const uploadUrl = presignR2Url({ method: "PUT", key, expiresInSeconds: 900 });
  const playUrl = presignR2Url({ method: "GET", key, expiresInSeconds: 21600 });

  return NextResponse.json({ key, uploadUrl, playUrl });
}
