import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isOwnedMediaKey, isR2Configured, presignR2Url } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAFE_RANGE_RE = /^bytes=\d*-\d*(?:,\s*\d*-\d*)*$/i;

/**
 * Jalur streaming cadangan satu-domain (same-origin) untuk media karakter di R2.
 *
 * Dipakai otomatis oleh pemutar `<video>` apabila di perangkat tertentu
 * (mis. browser laptop dengan pemblokir domain pihak ketiga / kendala DNS / CORS)
 * streaming langsung ke `*.r2.cloudflarestorage.com` gagal dimuat.
 * Mendukung HTTP `Range` (`206 Partial Content`) agar putar ulang & lompat detik mulus.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Penyimpanan media Cloudflare R2 belum dikonfigurasi." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key") ?? "";
  if (!isOwnedMediaKey(key, user.id)) {
    return NextResponse.json({ error: "Akses media ditolak." }, { status: 403 });
  }

  const signedUrl = presignR2Url({
    method: "GET",
    key,
    expiresInSeconds: 600,
  });

  const requestHeaders = new Headers();
  const range = req.headers.get("range")?.trim();
  if (range && SAFE_RANGE_RE.test(range)) {
    requestHeaders.set("Range", range);
  }

  let upstream: Response;
  try {
    upstream = await fetch(signedUrl, {
      method: "GET",
      headers: requestHeaders,
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Gagal mengambil aliran media dari penyimpanan." },
      { status: 502 }
    );
  }

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: "Berkas media tidak ditemukan." },
      { status: upstream.status === 404 ? 404 : 502 }
    );
  }

  const responseHeaders = new Headers();
  const fallbackMime = /\.mp4$/i.test(key)
    ? "video/mp4"
    : /\.webm$/i.test(key)
      ? "video/webm"
      : /\.mov$/i.test(key)
        ? "video/quicktime"
        : /\.mp3$/i.test(key)
          ? "audio/mpeg"
          : /\.wav$/i.test(key)
            ? "audio/wav"
            : "application/octet-stream";

  const upstreamType = upstream.headers.get("content-type");
  responseHeaders.set(
    "Content-Type",
    upstreamType && upstreamType !== "application/octet-stream"
      ? upstreamType
      : fallbackMime
  );
  responseHeaders.set(
    "Accept-Ranges",
    upstream.headers.get("accept-ranges") || "bytes"
  );
  responseHeaders.set("Cache-Control", "private, max-age=3600");

  for (const name of ["content-length", "content-range", "etag"] as const) {
    const val = upstream.headers.get(name);
    if (val) responseHeaders.set(name, val);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
