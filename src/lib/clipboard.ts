/**
 * Baca teks dari clipboard perangkat (untuk tombol "Tempel" 1-ketuk di iPhone/desktop).
 * Mengembalikan `null` bila izin ditolak atau API clipboard tidak tersedia.
 */
export async function readClipboardText(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    return null;
  }
  try {
    const text = await navigator.clipboard.readText();
    return text.trim();
  } catch {
    return null;
  }
}
