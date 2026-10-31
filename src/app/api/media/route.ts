import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteR2Object, isOwnedMediaKey, isR2Configured, presignR2Url } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Ambil URL streaming bertanda tangan (berlaku 6 jam) untuk media milik pengguna ini. */
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

  const url = presignR2Url({
    method: "GET",
    key,
    expiresInSeconds: 21600,
  });

  return NextResponse.json({ url });
}

/** Hapus berkas media lama dari Cloudflare R2 saat diganti atau dihapus pengguna. */
export async function DELETE(req: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key") ?? "";
  if (!isOwnedMediaKey(key, user.id)) {
    return NextResponse.json({ error: "Akses media ditolak." }, { status: 403 });
  }

  await deleteR2Object(key);
  return NextResponse.json({ ok: true });
}
