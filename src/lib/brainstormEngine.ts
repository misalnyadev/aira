import type { characters } from "@/db/schema";
import type { MemoryPromptContext } from "@/lib/ai/promptBuilder";

type CharacterRow = typeof characters.$inferSelect;

export function buildBrainstormAnchor(
  members: { name: string; personality: string; shortBio: string }[],
  currentCharacterName: string,
  mode: "brainstorm" | "meetup" = "brainstorm"
): string {
  const others = members.filter((m) => m.name !== currentCharacterName);
  const list = members.map((m) => `- ${m.name}: ${m.shortBio || m.personality.slice(0, 80)}`).join("\n");
  const othersLine = others.length
    ? `Peserta lain di ruangan: ${others.map((o) => o.name).join(", ")}.`
    : "";

  if (mode === "meetup") {
    const oneToOne = members.length === 1;
    return `=== MEETUP TATAP MUKA ===
Kamu sedang bertemu langsung dengan pengguna${oneToOne ? " berdua saja" : " dan peserta lain"} di ruangan yang sama:
${list}

${othersLine}
Aturan pertemuan:
- Ini adalah kehadiran fisik bersama, bukan chat jarak jauh, telepon, atau video call. Tampilan teks hanyalah cara aplikasi mengirimkan dialog.
- Sapa dan tanggapi pengguna seolah ia benar-benar berada di hadapanmu; gunakan gestur atau detail ruangan hanya bila wajar dan jangan mengarang tindakan yang belum terjadi.
- ${oneToOne ? "Kalian hanya berdua di ruangan ini." : "Hanya pengguna dan karakter yang tercantum di atas yang sedang hadir secara fisik."} Anggota Tim 1 lain yang tidak tercantum tidak otomatis ikut.
- Jawab sebagai dirimu "${currentCharacterName}" saja. ${oneToOne ? "Jalani percakapan personal yang alami." : "Dengarkan peserta lain dan tanggapi mereka langsung bila relevan; tiap karakter akan mendapat giliran sendiri."}
- Tetap ringkas dan natural, sekitar 1–3 kalimat hidup. Jangan menyebut ikon, layar panggilan, atau fitur telepon/video.
=== AKHIR MEETUP TATAP MUKA ===`;
  }

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
