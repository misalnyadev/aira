export type CustomTheme = { base: "light" | "dark"; accent: string };

export const DEFAULT_CUSTOM_THEME: CustomTheme = { base: "light", accent: "#ad3ebf" };

export function parseCustomTheme(value: string | null): CustomTheme {
  try {
    const data: unknown = value ? JSON.parse(value) : null;
    if (data && typeof data === "object" && "base" in data && "accent" in data &&
      (data.base === "light" || data.base === "dark") &&
      typeof data.accent === "string" && /^#[0-9a-f]{6}$/i.test(data.accent)) {
      return { base: data.base, accent: data.accent.toLowerCase() };
    }
  } catch {
    // Invalid saved preferences use the safe default.
  }
  return { ...DEFAULT_CUSTOM_THEME };
}

/** Choose readable black or white ink and a hover shade that keeps that contrast. */
export function customAccentPalette(accent: string) {
  const color = /^#[0-9a-f]{6}$/i.test(accent) ? accent : DEFAULT_CUSTOM_THEME.accent;
  const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
  const linear = channels.map((channel) => {
    const v = channel / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const darkInk = (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05);
  const target = darkInk ? 255 : 0;
  const hover = `#${channels.map((channel) => Math.round(channel * 0.85 + target * 0.15).toString(16).padStart(2, "0")).join("")}`;
  return { brand: color, ink: darkInk ? "#000000" : "#ffffff", hover };
}

/** Derive accent text against both normal and softly tinted surfaces. */
export function customAccentText(accent: string, base: CustomTheme["base"]): string {
  const color = /^#[0-9a-f]{6}$/i.test(accent) ? accent : DEFAULT_CUSTOM_THEME.accent;
  const channels = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
  const surfaces = base === "light" ? [255, 250] : [0, 23];
  const luminance = (rgb: number[]) => {
    const v = rgb.map((n) => {
      const x = n / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const backgrounds = surfaces.flatMap((surface) => [
    [surface, surface, surface],
    channels.map((channel) => Math.round(channel * 0.2 + surface * 0.8)),
  ]);
  const target = base === "light" ? 0 : 255;
  for (let step = 0; step <= 100; step++) {
    const rgb = channels.map((channel) => Math.round(channel + (target - channel) * step / 100));
    const textL = luminance(rgb);
    if (backgrounds.every((background) => {
      const bgL = luminance(background);
      return (Math.max(textL, bgL) + 0.05) / (Math.min(textL, bgL) + 0.05) >= 4.5;
    })) return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }
  return base === "light" ? "#000000" : "#ffffff";
}
