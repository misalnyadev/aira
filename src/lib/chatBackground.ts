import type { CSSProperties } from "react";

/**
 * Latar area chat.
 *
 * Bentuknya sengaja kecil dan datar supaya aman disimpan sebagai JSON di
 * kolom `users.chat_background` dan mudah dibaca ulang walau versi aplikasi
 * berubah. Pilihan yang tidak dikenal dianggap "default", jadi data lama
 * tidak pernah membuat halaman gagal tampil.
 */
export type ChatBackground =
  | { kind: "default" }
  | { kind: "preset"; id: string }
  | { kind: "animated"; id: string }
  | { kind: "image"; imageUrl: string; dim: number };

export const DEFAULT_CHAT_BACKGROUND: ChatBackground = { kind: "default" };

/* ------------------------------------------------------------------ */
/* Warna latar                                                         */
/* ------------------------------------------------------------------ */

export type ChatColorPreset = {
  id: string;
  label: string;
  light: string;
  dark: string;
};

/** Tiap warna punya versi terang & gelap supaya tetap enak dibaca di dua tema. */
export const CHAT_COLOR_PRESETS: ChatColorPreset[] = [
  { id: "paper", label: "Kertas", light: "#f7f8fa", dark: "#0b0b0d" },
  { id: "sand", label: "Pasir", light: "#f0ece4", dark: "#161513" },
  { id: "mist", label: "Kabut", light: "#e9eef3", dark: "#11161a" },
  { id: "rose", label: "Sendu", light: "#f3ecee", dark: "#181315" },
  { id: "ash", label: "Abu", light: "#e6e8eb", dark: "#131417" },
  { id: "night", label: "Malam", light: "#dadfe4", dark: "#0d0f12" },
];

export function getPreset(id: string | undefined): ChatColorPreset {
  return CHAT_COLOR_PRESETS.find((preset) => preset.id === id) ?? CHAT_COLOR_PRESETS[0];
}

/** Pratinjau dua warna sekaligus (terang di kiri-atas, gelap di kanan-bawah). */
export function presetSwatch(preset: ChatColorPreset): string {
  return `linear-gradient(135deg, ${preset.light} 0%, ${preset.light} 50%, ${preset.dark} 50%, ${preset.dark} 100%)`;
}

/* ------------------------------------------------------------------ */
/* Latar animasi — nuansa "virtual background" video call, monokrom     */
/* ------------------------------------------------------------------ */

export type ChatAnimatedPreset = {
  id: string;
  label: string;
  hint: string;
};

export const CHAT_ANIMATED_PRESETS: ChatAnimatedPreset[] = [
  { id: "bokeh", label: "Bokeh", hint: "Bulatan lembut melayang" },
  { id: "aurora", label: "Aurora", hint: "Gradasi bergerak pelan" },
  { id: "waves", label: "Gelombang", hint: "Garis halus mengalir" },
  { id: "stars", label: "Bintang", hint: "Titik berkelip samar" },
  { id: "mist", label: "Kabut", hint: "Kabut mengambang" },
];

export function getAnimatedPreset(id: string | undefined): ChatAnimatedPreset {
  return CHAT_ANIMATED_PRESETS.find((preset) => preset.id === id) ?? CHAT_ANIMATED_PRESETS[0];
}

/** Pratinjau statis untuk tombol pilihan; animasinya hanya di area chat. */
export function animatedSwatch(preset: ChatAnimatedPreset, isDark: boolean): string {
  const base = isDark ? "#0b0b0d" : "#f2f3f5";
  const tint = isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.16)";
  const tintSoft = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.07)";

  switch (preset.id) {
    case "bokeh":
      return `radial-gradient(circle at 30% 28%, ${tint} 0 22%, transparent 24%), radial-gradient(circle at 72% 68%, ${tintSoft} 0 26%, transparent 28%), radial-gradient(circle at 20% 80%, ${tintSoft} 0 16%, transparent 18%), ${base}`;
    case "aurora":
      return `linear-gradient(115deg, ${base} 0%, ${tint} 38%, ${tintSoft} 62%, ${base} 100%)`;
    case "waves":
      return `repeating-linear-gradient(155deg, ${tint} 0 1.5px, transparent 1.5px 9px), ${base}`;
    case "stars":
      return `radial-gradient(circle at 25% 25%, ${tint} 0 1px, transparent 1.6px), radial-gradient(circle at 70% 55%, ${tintSoft} 0 1px, transparent 1.6px), radial-gradient(circle at 45% 80%, ${tint} 0 1px, transparent 1.6px), ${base}`;
    default:
      return `radial-gradient(ellipse at 35% 30%, ${tint} 0%, transparent 62%), ${base}`;
  }
}

/* ------------------------------------------------------------------ */
/* Terapkan ke area chat                                               */
/* ------------------------------------------------------------------ */

/**
 * Kelas + style untuk area pesan.
 * `default` dibiarkan kosong supaya memakai pola titik bawaan `.chat-wallpaper`.
 */
export function chatBackgroundProps(
  background: ChatBackground | undefined,
  isDark: boolean
): { className: string; style: CSSProperties } {
  if (!background || background.kind === "default") return { className: "", style: {} };

  if (background.kind === "preset") {
    const preset = getPreset(background.id);
    return {
      className: "",
      style: {
        backgroundColor: isDark ? preset.dark : preset.light,
        backgroundImage: "none",
      },
    };
  }

  if (background.kind === "animated") {
    const preset = getAnimatedPreset(background.id);
    return {
      className: `chat-anim chat-anim-${preset.id}`,
      style: {
        backgroundColor: isDark ? "#0b0b0d" : "#f2f3f5",
        backgroundImage: "none",
      },
    };
  }

  const dim = Math.min(0.7, Math.max(0, background.dim ?? 0.25));
  return {
    className: "",
    style: {
      backgroundColor: isDark ? "#0b0b0d" : "#f7f8fa",
      backgroundImage: `linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), url("${background.imageUrl}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    },
  };
}

/* ------------------------------------------------------------------ */
/* Pemeriksaan data dari klien                                         */
/* ------------------------------------------------------------------ */

const MAX_URL_CHARS = 600;

/**
 * Rapikan latar kiriman klien.
 *
 * Yang tidak dikenali dikembalikan sebagai `default`, bukan error: lebih baik
 * latar kembali ke bawaan daripada seluruh halaman Setelan menolak menyimpan.
 */
export function normalizeChatBackground(input: unknown): ChatBackground {
  if (!input || typeof input !== "object") return DEFAULT_CHAT_BACKGROUND;

  const raw = input as Record<string, unknown>;
  const kind = typeof raw.kind === "string" ? raw.kind : "";

  if (kind === "preset") {
    const id = typeof raw.id === "string" ? raw.id : "";
    return CHAT_COLOR_PRESETS.some((preset) => preset.id === id)
      ? { kind: "preset", id }
      : DEFAULT_CHAT_BACKGROUND;
  }

  if (kind === "animated") {
    const id = typeof raw.id === "string" ? raw.id : "";
    return CHAT_ANIMATED_PRESETS.some((preset) => preset.id === id)
      ? { kind: "animated", id }
      : DEFAULT_CHAT_BACKGROUND;
  }

  if (kind === "image") {
    const imageUrl = typeof raw.imageUrl === "string" ? raw.imageUrl.trim() : "";
    // Hanya terima alamat internal aplikasi atau data URL kecil; alamat luar
    // yang panjangnya tak wajar ditolak supaya tidak jadi tempat menyisipkan CSS.
    const safe =
      imageUrl.startsWith("/uploads/") ||
      imageUrl.startsWith("/api/attachments/") ||
      imageUrl.startsWith("https://") ||
      imageUrl.startsWith("data:image/");
    if (!safe || imageUrl.length > MAX_URL_CHARS * 8) return DEFAULT_CHAT_BACKGROUND;
    if (/["'\\)]/.test(imageUrl)) return DEFAULT_CHAT_BACKGROUND;

    const dimRaw = typeof raw.dim === "number" ? raw.dim : 0.25;
    const dim = Math.min(0.7, Math.max(0, dimRaw));
    return { kind: "image", imageUrl, dim };
  }

  return DEFAULT_CHAT_BACKGROUND;
}

/** Baca JSON dari database; isi rusak dianggap latar bawaan. */
export function parseChatBackground(json: string | null | undefined): ChatBackground {
  if (!json) return DEFAULT_CHAT_BACKGROUND;
  try {
    return normalizeChatBackground(JSON.parse(json));
  } catch {
    return DEFAULT_CHAT_BACKGROUND;
  }
}
