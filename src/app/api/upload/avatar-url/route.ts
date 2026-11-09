import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { buildR2ImageKey, isR2Configured, presignR2Url } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AVATAR_BYTES = 6 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const { contentType, bytes } = body as {
    contentType?: unknown;
    bytes?: unknown;
  };
  const mime = typeof contentType === "string" ? contentType.toLowerCase() : "";
  const size = typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0;
  const extension = IMAGE_EXTENSIONS[mime];

  if (!extension) {
    return NextResponse.json({ error: "Format foto tidak didukung." }, { status: 400 });
  }
  if (size <= 0) {
    return NextResponse.json({ error: "Berkas foto kosong." }, { status: 400 });
  }
  if (size > MAX_AVATAR_BYTES) {
    return NextResponse.json(
      { error: "Ukuran gambar terlalu besar (maksimal 6MB)." },
      { status: 413 }
    );
  }

  if (!isR2Configured()) {
    return NextResponse.json({ r2Configured: false });
  }

  const filePart = `${crypto.randomUUID()}${extension}`;
  const key = buildR2ImageKey(user.id, filePart);
  if (!key) {
    return NextResponse.json({ error: "Gagal menyiapkan penyimpanan foto." }, { status: 500 });
  }

  const uploadUrl = presignR2Url({ method: "PUT", key, expiresInSeconds: 900 });
  return NextResponse.json({
    r2Configured: true,
    uploadUrl,
    url: `/api/attachments/r2-${filePart}`,
  });
}
