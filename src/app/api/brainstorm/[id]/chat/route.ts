import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { brainstormMessages, brainstormRoomMembers, brainstormRooms, characters } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { extractCallReplyEmotion } from "@/lib/callEmotion";
import { buildBrainstormAnchor } from "@/lib/brainstormEngine";
import { buildMemoryExtrasForTurn, generateBubbles, loadUserChatSettings, pickProviderCandidates } from "@/lib/chatEngine";
import { toUserFacingError } from "@/lib/ai";
import { isUsingCallClipsInChat, parseCharacterMedia } from "@/lib/characterMedia";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  const { id: roomId } = await ctx.params;
  const [room] = await db.select().from(brainstormRooms).where(eq(brainstormRooms.id, roomId)).limit(1);
  if (!room || room.userId !== user.id) return NextResponse.json({ error: "Meja tidak ditemukan." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const { content, imageUrl } = (body ?? {}) as { content?: string; imageUrl?: string | null };
  const cleanText = content?.trim() || "";
  if (!cleanText && !imageUrl) return NextResponse.json({ error: "Pesan tidak boleh kosong." }, { status: 400 });

  const members = await db
    .select()
    .from(brainstormRoomMembers)
    .innerJoin(characters, eq(characters.id, brainstormRoomMembers.characterId))
    .where(eq(brainstormRoomMembers.roomId, roomId))
    .orderBy(asc(brainstormRoomMembers.createdAt));

  if (members.length < 2) return NextResponse.json({ error: "Meja butuh minimal 2 karakter." }, { status: 400 });

  const charRows = members.map((m) => m.characters);

  // Simpan pesan user
  const [userMsg] = await db
    .insert(brainstormMessages)
    .values({ roomId, role: "user", content: cleanText, imageUrl: imageUrl || null })
    .returning();

  // Ambil riwayat untuk konteks (termasuk pesan baru)
  const historyDb = await db
    .select()
    .from(brainstormMessages)
    .where(eq(brainstormMessages.roomId, roomId))
    .orderBy(asc(brainstormMessages.createdAt))
    .limit(120);

  // Buat chat history generic: user dan assistant bergantian, tapi labelkan nama di konten untuk kejelasan
  // Format: setiap assistant message diawali "[NamaKarakter]: ..."
  const baseHistory = historyDb
    .filter((m) => m.id !== userMsg.id)
    .map((m) => {
      if (m.role === "user") return { role: "user" as const, content: m.content };
      // Cari nama
      const nm = charRows.find((c) => c.id === m.characterId)?.name ?? "Karakter";
      return { role: "assistant" as const, content: `[${nm}]: ${m.content}` };
    });

  const { profile, autoFallback } = await loadUserChatSettings(user.id);

  // Untuk setiap karakter, generate balasan berurutan
  const assistantReplies: (typeof brainstormMessages.$inferSelect)[] = [];
  const memberInfos = charRows.map((c) => ({ name: c.name, personality: c.personality, shortBio: c.shortBio }));

  // History yang berkembang selama giliran meja ini
  const evolvingHistory = [...baseHistory, { role: "user" as const, content: cleanText }];

  for (let idx = 0; idx < charRows.length; idx++) {
    const character = charRows[idx];
    const candidates = await pickProviderCandidates(user.id, character.providerId, autoFallback);
    if (!candidates.length) {
      // Lewati karakter yang tidak punya provider, beri pesan placeholder
      continue;
    }
    try {
      const anchor = buildBrainstormAnchor(memberInfos, character.name);
      // Sedikit variasi: beri tahu urutan giliran
      const turnHint = `Giliranmu ke-${idx + 1} dari ${charRows.length} di meja ini.`;

      // Bangun memory extras ringan (opsional) — tidak perlu browsing di brainstorm untuk hemat waktu
      let memoryExtras = undefined;
      if (character.memoryEnabled) {
        try {
          // Gunakan helper tapi tanpa archive search berat; buat minimal
          memoryExtras = await buildMemoryExtrasForTurn({
            character,
            chronologicalHistory: [] as any,
            userText: cleanText,
            now: new Date(),
          });
        } catch {}
      }
      const brainstormExtras = {
        ...memoryExtras,
        sceneAnchor: [memoryExtras?.sceneAnchor, anchor, turnHint].filter(Boolean).join("\n\n"),
      };

      // Jika ada pesan assistant sebelumnya di giliran ini, masukkan ke history untuk koherensi
      // (sudah ada di evolvingHistory)

      const result = await generateBubbles({
        userId: user.id,
        character: character as any,
        candidates,
        userText: cleanText,
        image: null,
        history: evolvingHistory,
        userProfile: profile,
        memoryExtras: brainstormExtras,
      });

      // Ambil 1 bubble pertama atau gabung semua bubble jadi satu pesan per karakter (agar meja rapi)
      const rawCombined = result.bubbles.join(" [[NEXT]] ");
      // Ekstrak emosi jika ada mode ekspresi
      const shouldEmotion = isUsingCallClipsInChat(parseCharacterMedia(character.media));
      let cleanContent = rawCombined;
      let emotion: string | null = null;
      if (shouldEmotion || true) {
        const parsed = extractCallReplyEmotion(rawCombined);
        cleanContent = parsed.cleanText;
        emotion = parsed.emotion as string;
      }
      if (!cleanContent.trim()) cleanContent = rawCombined;

      const [saved] = await db
        .insert(brainstormMessages)
        .values({
          roomId,
          role: "assistant",
          characterId: character.id,
          content: cleanContent.trim(),
          emotion: emotion || null,
          createdAt: new Date(Date.now() + idx + 1),
        })
        .returning();

      assistantReplies.push(saved);

      // Tambahkan balasan ini ke evolvingHistory agar karakter berikutnya bisa menanggapi
      evolvingHistory.push({ role: "assistant", content: `[${character.name}]: ${cleanContent.trim()}` });
    } catch (err) {
      // Jika gagal untuk satu karakter, lanjut ke berikutnya; jangan gagalkan seluruh meja
      // Simpan pesan error ringan
      const msg = toUserFacingError(err);
      // Optionally log, but continue
      continue;
    }
  }

  await db.update(brainstormRooms).set({ updatedAt: new Date() }).where(eq(brainstormRooms.id, roomId));

  // Enrich untuk response
  const enriched = assistantReplies.map((m) => {
    const ch = charRows.find((c) => c.id === m.characterId);
    return {
      id: m.id,
      roomId: m.roomId,
      role: m.role,
      characterId: m.characterId,
      characterName: ch?.name ?? null,
      characterAvatarUrl: ch?.avatarUrl ?? null,
      content: m.content,
      imageUrl: m.imageUrl,
      isVoiceNote: m.isVoiceNote,
      emotion: m.emotion,
      createdAt: m.createdAt.toISOString(),
    };
  });

  const userOut = {
    id: userMsg.id,
    roomId: userMsg.roomId,
    role: userMsg.role,
    characterId: null,
    content: userMsg.content,
    imageUrl: userMsg.imageUrl,
    isVoiceNote: userMsg.isVoiceNote,
    createdAt: userMsg.createdAt.toISOString(),
  };

  return NextResponse.json({ userMessage: userOut, assistantMessages: enriched });
}
