import {
  getSupportedDocumentMimeType,
  MAX_DOCUMENT_PDF_PAGES,
  MAX_DOCUMENT_TEXT_CHARS,
} from "@/lib/chatAttachmentTypes";

export type ExtractedChatDocument = {
  text: string;
  mimeType: string;
  truncated: boolean;
};

function limitExtractedText(text: string, extraTruncated = false): Pick<ExtractedChatDocument, "text" | "truncated"> {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    throw new Error("Tidak ada teks yang bisa dibaca dari file ini.");
  }

  const truncated = extraTruncated || normalized.length > MAX_DOCUMENT_TEXT_CHARS;
  const excerpt = normalized.slice(0, MAX_DOCUMENT_TEXT_CHARS);
  return {
    text: truncated
      ? `${excerpt}\n\n[Isi file dipotong agar muat dibaca Kawan.]`
      : excerpt,
    truncated,
  };
}

export async function extractChatDocument(
  fileName: string,
  buffer: Buffer
): Promise<ExtractedChatDocument> {
  const mimeType = getSupportedDocumentMimeType(fileName);
  if (!mimeType) {
    throw new Error("Format file belum didukung. Gunakan PDF, TXT, MD, CSV, atau JSON.");
  }

  if (mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      let result: { text: string; total: number };
      try {
        result = await parser.getText({ first: MAX_DOCUMENT_PDF_PAGES });
      } catch {
        throw new Error("PDF tidak dapat dibaca. Pastikan file tidak rusak atau terkunci.");
      }
      if (!result.text.trim()) {
        throw new Error("PDF tidak memiliki teks yang bisa diekstrak; PDF hasil scan membutuhkan OCR.");
      }
      const extracted = limitExtractedText(result.text, result.total > MAX_DOCUMENT_PDF_PAGES);
      return { ...extracted, mimeType };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("File teks harus menggunakan encoding UTF-8.");
  }
  if (text.includes("\u0000")) {
    throw new Error("Isi file tidak terbaca sebagai teks biasa.");
  }

  return { ...limitExtractedText(text), mimeType };
}
