import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, messages, users, type ProviderType } from "@/db/schema";
import {
  AiProviderError,
  BUBBLE_DELIMITER,
  buildSystemPrompt,
  generateCharacterReply,
  splitIntoBubbles,
} from "@/lib/ai";
import type { ChatTurn } from "@/lib/ai";
import {
  IMMERSION_REMINDER,
  SAFE_FALLBACK_REPLY,
  findMetaBreak,
  stripMetaSentences,
} from "@/lib/ai/immersion";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { findOwnedCharacter } from "@/lib/owned";
import { readImageAsBase64 } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Balasan model bisa memakan 10-40 detik. Di Vercel, batas default fungsi
 * Hobby adalah 10 detik — jadi kita naikkan ke maksimum yang diizinkan.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { characterId, content, imageUrl } = body as {
    characterId?: string;
    content?: string;
    imageUrl?: string | null;
  };

  if (!characterId) {
    return NextResponse.json({ error: "characterId wajib diisi." }, { status: 400 });
  }
  if (!content?.trim() && !imageUrl) {
    return NextResponse.json({ error: "Pesan tidak boleh kosong." }, { status: 400 });
  }

  const character = await findOwnedCharacter(characterId, user.id);
  if (!character) {
    return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  }

  // Provider juga harus milik pengguna ini — API key orang lain tidak boleh terpakai.
  let provider: typeof apiProviders.$inferSelect | undefined;
  if (character.providerId) {
    [provider] = await db
      .select()
      .from(apiProviders)
      .where(and(eq(apiProviders.id, character.providerId), eq(apiProviders.userId, user.id)))
      .limit(1);
  }
  if (!provider) {
    [provider] = await db
      .select()
      .from(apiProviders)
      .where(and(eq(apiProviders.isDefault, true), eq(apiProviders.userId, user.id)))
      .limit(1);
  }
  if (!provider) {
    [provider] = await db
      .select()
      .from(apiProviders)
      .where(eq(apiProviders.userId, user.id))
      .orderBy(apiProviders.createdAt)
      .limit(1);
  }

  if (!provider) {
    return NextResponse.json(
      {
        error:
          "Belum ada API key yang dikonfigurasi. Buka Pengaturan (⚙️) untuk menambahkan API key Gemini, Grok, OpenRouter, atau custom.",
      },
      { status: 412 }
    );
  }

  // Gambar diperiksa dulu sebelum pesan disimpan, supaya pesan yang gagal
  // tidak meninggalkan riwayat setengah jadi.
  const image = await readImageAsBase64(imageUrl, user.id);

  const [userMessage] = await db
    .insert(messages)
    .values({
      characterId,
      role: "user",
      content: content?.trim() || "",
      imageUrl: imageUrl || null,
    })
    .returning();

  const historyRows = await db
    .select()
    .from(messages)
    .where(eq(messages.characterId, characterId))
    .orderBy(desc(messages.createdAt))
    .limit(21);

  const history: ChatTurn[] = historyRows
    .filter((m) => m.id !== userMessage.id)
    .reverse()
    .map((m): ChatTurn => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content || (m.imageUrl ? "[mengirim foto]" : ""),
    }))
    .filter((t) => t.content);

  /*
   * Profil pengguna ikut dikirim supaya karakter tahu sedang mengobrol dengan
   * siapa. Dibaca sekali per balasan; kalau belum diisi, tidak dikirim sama
   * sekali (tidak memboroskan token).
   */
  const [profileRow] = await db
    .select({
      displayName: users.displayName,
      nickname: users.nickname,
      age: users.age,
      occupation: users.occupation,
      about: users.about,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const systemPrompt = buildSystemPrompt(character, profileRow ?? null);
  const model = character.model?.trim() || provider.model;

  try {
    const ask = (extraPrompt = "") =>
      generateCharacterReply(provider.type as ProviderType, {
        apiKey: provider.apiKey,
        model,
        baseUrl: provider.baseUrl,
        systemPrompt: systemPrompt + extraPrompt,
        history,
        userText: content?.trim() || (imageUrl ? "(mengirim foto tanpa teks)" : ""),
        image,
      });

    /*
     * Penjaga peran.
     *
     * Prompt sudah melarang pengakuan sebagai AI, tapi model kadang
     * menyelipkannya. Kalau terdeteksi: minta ulang SEKALI dengan imbauan
     * keras. Masih lolos? Kalimatnya dibuang supaya adegan tidak rusak.
     * Biaya tambahan hanya keluar saat kasus ini benar-benar terjadi.
     */
    let rawReply = await ask();
    const firstBreak = findMetaBreak(rawReply);
    if (firstBreak) {
      rawReply = await ask(IMMERSION_REMINDER);
      if (findMetaBreak(rawReply)) {
        const cleaned = stripMetaSentences(rawReply, BUBBLE_DELIMITER);
        rawReply = cleaned || SAFE_FALLBACK_REPLY;
      }
    }

    const bubbles = splitIntoBubbles(rawReply);
    const toInsert = bubbles.length ? bubbles : [rawReply.trim() || "..."];

    const assistantMessages = [];
    for (const bubble of toInsert) {
      const [row] = await db
        .insert(messages)
        .values({ characterId, role: "assistant", content: bubble })
        .returning();
      assistantMessages.push(row);
    }

    return NextResponse.json({ userMessage, assistantMessages });
  } catch (err) {
    const message = err instanceof AiProviderError ? err.message : "Gagal menghubungi penyedia AI.";
    return NextResponse.json({ userMessage, error: message }, { status: 502 });
  }
}
