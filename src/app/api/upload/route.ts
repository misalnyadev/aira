import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  getSupportedDocumentMimeType,
  MAX_DOCUMENT_BYTES,
  sanitizeAttachmentFileName,
} from "@/lib/chatAttachmentTypes";
import { extractChatDocument } from "@/lib/extractChatDocument";
import { saveUploadedFile } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_IMAGE_SIZE = 6 * 1024 * 1024; // 6MB (gambar dikompresi di browser)

export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File tidak ditemukan." }, { status: 400 });
  }

  if (file.type.startsWith("image/")) {
    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: "Ukuran gambar terlalu besar (maksimal 6MB)." },
        { status: 400 }
      );
    }

    const forceProtectedPath = formData.get("protected") === "true";
    if (forceProtectedPath && file.type === "image/gif") {
      return NextResponse.json({ error: "GIF belum didukung untuk foto komentar." }, { status: 400 });
    }

    try {
      const url = await saveUploadedFile(file, user.id, { forceProtectedPath });
      return NextResponse.json({ url });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Gagal menyimpan gambar." },
        { status: 500 }
      );
    }
  }

  const documentMimeType = getSupportedDocumentMimeType(file.name);
  if (!documentMimeType) {
    return NextResponse.json(
      { error: "Format didukung: gambar, PDF, TXT, MD, CSV, dan JSON." },
      { status: 400 }
    );
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json(
      { error: "Ukuran dokumen maksimal 4MB." },
      { status: 400 }
    );
  }

  try {
    const fileName = sanitizeAttachmentFileName(file.name);
    const extracted = await extractChatDocument(
      fileName,
      Buffer.from(await file.arrayBuffer())
    );
    return NextResponse.json({
      documentText: extracted.text,
      fileName,
      mimeType: extracted.mimeType,
      truncated: extracted.truncated,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal membaca isi dokumen." },
      { status: 400 }
    );
  }
}
