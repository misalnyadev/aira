import type { characters } from "@/db/schema";
import type { MemoryPromptContext } from "@/lib/ai/promptBuilder";

type CharacterRow = typeof characters.$inferSelect;

export function buildBrainstormAnchor(
  members: { name: string; personality: string; shortBio: string }[],
  currentCharacterName: string
): string {
  const others = members.filter((m) => m.name !== currentCharacterName);
  const list = members.map((m) => `- ${m.name}: ${m.shortBio || m.personality.slice(0, 80)}`).join("\n");
  const othersLine = others.length
    ? `Peserta lain di meja: ${others.map((o) => o.name).join(", ")}.`
    : "";
  return `=== MEJA DISKUSI BERSAMA (BRAINSTORM ROOM) ===
Kamu sedang duduk bareng di satu meja diskusi santai bersama:
${list}

${othersLine}
Aturan meja:
- Ini adalah obrolan kelompok 2–3 karakter + pengguna sebagai moderator. Semua melihat pesan yang sama.
- Jawablah sebagai dirimu "${currentCharacterName}" dengan gaya bicara, kepribadian, dan sudut pandang khasmu — jangan meniru peserta lain.
- Boleh menanggapi ide peserta lain bila relevan, tapi tetap ringkas 1–3 kalimat hidup (maks. 3 bubble dengan [[NEXT]]). Bila kamu setuju/tidak setuju, sampaikan dengan hangat dan jelas.
- Jangan mengklaim kamu adalah karakter lain. Kamu hanya "${currentCharacterName}".
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
