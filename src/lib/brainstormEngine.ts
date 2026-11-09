import type { characters } from "@/db/schema";
import type { MemoryPromptContext } from "@/lib/ai/promptBuilder";
import { genderLabel } from "@/lib/gender";

type CharacterRow = typeof characters.$inferSelect;

export function buildBrainstormAnchor(
  members: {
    name: string;
    personality: string;
    shortBio: string;
    gender?: string | null;
  }[],
  currentCharacterName: string,
  mode: "brainstorm" | "scene" = "brainstorm"
): string {
  const others = members.filter((m) => m.name !== currentCharacterName);
  const list = members
    .map((m) => {
      const gender = genderLabel(m.gender);
      const identity = gender ? ` (${gender})` : "";
      return `- ${m.name}${identity}: ${m.shortBio || m.personality.slice(0, 80)}`;
    })
    .join("\n");
  const othersLine = others.length
    ? `Karakter lain yang ikut ruangan ini: ${others.map((o) => o.name).join(", ")}.`
    : "";

  if (mode === "scene") {
    return `=== PESERTA REKA ADEGAN ===
Kamu sedang bermain adegan bersama pengguna dan karakter berikut:
${list}

${othersLine}
- Hanya karakter yang tercantum di atas yang hadir; jangan menganggap peserta lain di luar ruangan mengetahui atau mengalami adegan.
- Jawab sebagai dirimu "${currentCharacterName}". Jangan menulis dialog atau tindakan untuk pengguna maupun karakter lain.
- Tanggapi perkembangan yang sudah tertulis di transkrip dan beri ruang bagi peserta lain untuk bergiliran.
=== AKHIR PESERTA REKA ADEGAN ===`;
  }

  return `=== MEJA DISKUSI BERSAMA (BRAINSTORM ROOM) ===
Kamu sedang ikut diskusi ide bersama pengguna dan karakter berikut:
${list}

${othersLine}
- Ini adalah diskusi 2–3 karakter dengan pengguna sebagai moderator; bukan adegan fisik.
- Jawablah sebagai dirimu "${currentCharacterName}" dengan gaya bicara dan sudut pandang khasmu — jangan meniru peserta lain.
- Boleh menanggapi ide peserta lain yang terlihat di transkrip, tetapi tetap ringkas dan jelas. Bedakan usulan dari keputusan yang benar-benar disepakati.
- Jangan mengklaim kamu adalah karakter lain atau karakter yang tidak hadir.
=== AKHIR MEJA DISKUSI ===`;
}

export function brainstormExtras(
  anchor: string,
  base?: MemoryPromptContext
): MemoryPromptContext {
  return {
    ...base,
    sceneAnchor: [base?.sceneAnchor, anchor].filter(Boolean).join("\n\n"),
  };
}
