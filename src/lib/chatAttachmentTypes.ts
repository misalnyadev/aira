export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const MAX_DOCUMENT_TEXT_CHARS = 18_000;
export const MAX_DOCUMENT_PDF_PAGES = 24;

const SUPPORTED_DOCUMENTS = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
} as const;

export type SupportedDocumentMimeType =
  (typeof SUPPORTED_DOCUMENTS)[keyof typeof SUPPORTED_DOCUMENTS];

export function isSupportedDocumentFile(fileName: string): boolean {
  return getSupportedDocumentMimeType(fileName) !== null;
}

export function getSupportedDocumentMimeType(fileName: string): SupportedDocumentMimeType | null {
  const extension = fileName.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  if (!extension || !(extension in SUPPORTED_DOCUMENTS)) return null;
  return SUPPORTED_DOCUMENTS[extension as keyof typeof SUPPORTED_DOCUMENTS];
}

export function sanitizeAttachmentFileName(fileName: string): string {
  const name = fileName
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
  return name || "lampiran";
}
