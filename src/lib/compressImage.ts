/**
 * Kompresi gambar di browser sebelum diunggah.
 * Manfaat: upload jauh lebih cepat (penting untuk HP & koneksi lambat),
 * ukuran payload aman untuk batas serverless Vercel, dan hemat penyimpanan.
 */
export async function compressImageFile(
  file: File,
  options: { maxSize?: number; quality?: number } = {}
): Promise<File> {
  const maxSize = options.maxSize ?? 1280;
  const quality = options.quality ?? 0.82;

  // Hanya proses gambar; file kecil & GIF dilewati agar tetap utuh.
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (file.size < 180 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // Browser tidak mendukung (atau gagal decode) -> kirim file asli.
    return file;
  }
}
