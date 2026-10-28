import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, characters, messages, type ProviderType } from "@/db/schema";
import {
  AiProviderError,
  buildSystemPrompt,
  generateCharacterReply,
  splitIntoBubbles,
} from "@/lib/ai";
import type { ChatTurn } from "@/lib/ai";
import { ensureDb } from "@/lib/dbReady";
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

  const [character] = await db.select().from(characters).where(eq(characters.id, characterId));
  if (!character) {
    return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  }

  let provider: typeof apiProviders.$inferSelect | undefined;
  if (character.providerId) {
    [provider] = await db.select().from(apiProviders).where(eq(apiProviders.id, character.providerId));
  }
  if (!provider) {
    [provider] = await db.select().from(apiProviders).where(eq(apiProviders.isDefault, true));
  }
  if (!provider) {
    [provider] = await db.select().from(apiProviders).orderBy(apiProviders.createdAt).limit(1);
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

  const image = await readImageAsBase64(imageUrl);
  const systemPrompt = buildSystemPrompt(character);
  const model = character.model?.trim() || provider.model;

  try {
    const rawReply = await generateCharacterReply(provider.type as ProviderType, {
      apiKey: provider.apiKey,
      model,
      baseUrl: provider.baseUrl,
      systemPrompt,
      history,
      userText: content?.trim() || (imageUrl ? "(mengirim foto tanpa teks)" : ""),
      image,
    });

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
