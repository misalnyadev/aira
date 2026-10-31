import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { AiProviderError } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import {
  NO_PROVIDER_ERROR,
  generateBubbles,
  loadUserProfile,
  pickProvider,
  toChatTurns,
} from "@/lib/chatEngine";
import { ensureDb } from "@/lib/dbReady";
import { staleAssistantIds } from "@/lib/messageRules";
import { findOwnedCharacter } from "@/lib/owned";
import { readImageAsBase64 } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Ulangi balasan terakhir.
 *
 * Yang dihapus hanya balasan asisten SETELAH pesan pengguna terakhir — pesan
 * pengguna sendiri tidak disentuh. Jadi hasilnya persis seperti kalau dia
 * mengirim ulang pesan yang sama, tanpa pesan dobel di riwayat.
 */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });

  const { id } = await context.params;

  const character = await findOwnedCharacter(id, user.id);
  if (!character) {
    return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  }

  const all = await db
    .select()
    .from(messages)
    .where(eq(messages.characterId, id))
    .orderBy(desc(messages.createdAt))
    .limit(40);

  const lastUser = all.find((m) => m.role === "user");
  if (!lastUser) {
    return NextResponse.json(
      { error: "Belum ada pesan yang bisa diulang. Kirim pesan dulu." },
      { status: 400 }
    );
  }

  const provider = await pickProvider(user.id, character.providerId);
  if (!provider) {
    return NextResponse.json({ error: NO_PROVIDER_ERROR }, { status: 412 });
  }

  // Balasan asisten yang muncul setelah pesan pengguna terakhir.
  const staleIds = new Set(staleAssistantIds(all, lastUser.createdAt));
  const stale = all.filter((m) => staleIds.has(m.id));
  for (const row of stale) {
    await db.delete(messages).where(eq(messages.id, row.id));
  }

  const image = await readImageAsBase64(lastUser.imageUrl, user.id);

  try {
    const bubbles = await generateBubbles({
      character,
      provider,
      userText: lastUser.content || (lastUser.imageUrl ? "(mengirim foto tanpa teks)" : ""),
      image,
      history: toChatTurns(
        all.filter((m) => m.createdAt.getTime() < lastUser.createdAt.getTime()),
        lastUser.id
      ),
      userProfile: await loadUserProfile(user.id),
    });

    const assistantMessages = [];
    for (const bubble of bubbles) {
      const [row] = await db
        .insert(messages)
        .values({ characterId: id, role: "assistant", content: bubble })
        .returning();
      assistantMessages.push(row);
    }

    return NextResponse.json({
      removedIds: stale.map((m) => m.id),
      lastUserId: lastUser.id,
      assistantMessages,
    });
  } catch (err) {
    const message = err instanceof AiProviderError ? err.message : "Gagal menghubungi penyedia AI.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
