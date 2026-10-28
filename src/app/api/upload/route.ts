import { NextResponse } from "next/server";
import { ensureDb } from "@/lib/dbReady";
import { saveUploadedFile } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 6 * 1024 * 1024; // 6MB (gambar sudah dikompresi di browser)

export async function POST(req: Request) {
  await ensureDb();

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File tidak ditemukan." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Hanya file gambar yang didukung." }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Ukuran gambar terlalu besar (maksimal 6MB)." },
      { status: 400 }
    );
  }

  try {
    const url = await saveUploadedFile(file);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal menyimpan gambar." },
      { status: 500 }
    );
  }
}
