"use client";

type UploadResponse = {
  error?: unknown;
  r2Configured?: unknown;
  uploadUrl?: unknown;
  url?: unknown;
};

async function readResponse(res: Response): Promise<UploadResponse | null> {
  return (await res.json().catch(() => null)) as UploadResponse | null;
}

function uploadError(
  data: UploadResponse | null,
  res: Response,
  fallback: string
): Error {
  const detail = typeof data?.error === "string" ? data.error : "";
  const status = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
  return new Error(detail || `${fallback} (${status}).`);
}

async function uploadThroughApp(file: File): Promise<string> {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": file.type || "image/jpeg" },
    body: file,
  });
  const data = await readResponse(res);

  if (!res.ok) throw uploadError(data, res, "Gagal mengunggah foto");
  if (typeof data?.url !== "string" || !data.url) {
    throw new Error("Server tidak mengembalikan alamat foto.");
  }
  return data.url;
}

/** Unggah avatar langsung ke R2 bila tersedia; gunakan endpoint aplikasi sebagai fallback. */
export async function uploadAvatarImage(file: File): Promise<string> {
  const ticketRes = await fetch("/api/upload/avatar-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contentType: file.type || "image/jpeg",
      bytes: file.size,
    }),
  });
  const ticket = await readResponse(ticketRes);

  if (!ticketRes.ok) {
    throw uploadError(ticket, ticketRes, "Gagal menyiapkan unggahan foto");
  }
  if (ticket?.r2Configured === false) {
    return uploadThroughApp(file);
  }
  if (
    typeof ticket?.uploadUrl !== "string" ||
    typeof ticket.url !== "string" ||
    !ticket.url
  ) {
    throw new Error("Server tidak mengembalikan tiket unggahan foto yang valid.");
  }

  let uploadRes: Response;
  try {
    uploadRes = await fetch(ticket.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
    });
  } catch {
    throw new Error("Tidak dapat terhubung ke penyimpanan foto. Periksa koneksi lalu coba lagi.");
  }

  if (!uploadRes.ok) {
    throw new Error(`Penyimpanan menolak foto (HTTP ${uploadRes.status}).`);
  }
  return ticket.url;
}
