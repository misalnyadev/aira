import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, characters, users, type ProviderType } from "@/db/schema";
import {
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
import type { UserProfile } from "@/lib/userProfile";

/**
 * Mesin balasan bersama.
 *
 * Dipakai dua route: kirim pesan (`/api/chat`) dan ulangi balasan
 * (`/api/characters/[id]/regenerate`). Dulu logikanya hanya ada di route chat;
 * kalau disalin ke route kedua, penjaga peran bisa lupa ikut tersalin dan
 * salah satu jalur jadi lebih mudah keluar dari peran.
 */

export type Character = typeof characters.$inferSelect;
export type Provider = typeof apiProviders.$inferSelect;

export const NO_PROVIDER_ERROR =
  "Belum ada API key yang dikonfigurasi. Buka Pengaturan (⚙️) untuk menambahkan API key Gemini, Grok, OpenRouter, atau custom.";

/**
 * Pilih provider milik pengguna ini: karakter → default → yang paling lama.
 * API key akun lain tidak boleh pernah terpakai.
 */
export async function pickProvider(
  userId: string,
  characterProviderId: string | null
): Promise<Provider | null> {
  if (characterProviderId) {
    const [byCharacter] = await db
      .select()
      .from(apiProviders)
      .where(and(eq(apiProviders.id, characterProviderId), eq(apiProviders.userId, userId)))
      .limit(1);
    if (byCharacter) return byCharacter;
  }

  const [byDefault] = await db
    .select()
    .from(apiProviders)
    .where(and(eq(apiProviders.isDefault, true), eq(apiProviders.userId, userId)))
    .limit(1);
  if (byDefault) return byDefault;

  const [any] = await db
    .select()
    .from(apiProviders)
    .where(eq(apiProviders.userId, userId))
    .orderBy(apiProviders.createdAt)
    .limit(1);

  return any ?? null;
}

/** Profil lawan bicara, atau null kalau belum diisi. */
export async function loadUserProfile(userId: string): Promise<UserProfile | null> {
  const [row] = await db
    .select({
      displayName: users.displayName,
      nickname: users.nickname,
      age: users.age,
      occupation: users.occupation,
      about: users.about,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row ?? null;
}

export { toChatTurns } from "@/lib/messageRules";

/**
 * Hasilkan balasan karakter, lengkap dengan penjaga peran, lalu pecah jadi
 * bubble siap simpan.
 */
export async function generateBubbles({
  character,
  provider,
  userText,
  image,
  history,
  userProfile,
}: {
  character: Character;
  provider: Provider;
  userText: string;
  image: { base64: string; mimeType: string } | null;
  history: ChatTurn[];
  userProfile: UserProfile | null;
}): Promise<string[]> {
  const systemPrompt = buildSystemPrompt(character, userProfile);
  const model = character.model?.trim() || provider.model;

  const ask = (extraPrompt = "") =>
    generateCharacterReply(provider.type as ProviderType, {
      apiKey: provider.apiKey,
      model,
      baseUrl: provider.baseUrl,
      systemPrompt: systemPrompt + extraPrompt,
      history,
      userText,
      image,
    });

  /*
   * Penjaga peran.
   *
   * Prompt sudah melarang pengakuan sebagai AI, tapi model kadang
   * menyelipkannya. Kalau terdeteksi: minta ulang SEKALI dengan imbauan
   * keras. Masih lolos? Kalimatnya dibuang supaya adegan tidak rusak.
   */
  let rawReply = await ask();
  if (findMetaBreak(rawReply)) {
    rawReply = await ask(IMMERSION_REMINDER);
    if (findMetaBreak(rawReply)) {
      const cleaned = stripMetaSentences(rawReply, BUBBLE_DELIMITER);
      rawReply = cleaned || SAFE_FALLBACK_REPLY;
    }
  }

  const bubbles = splitIntoBubbles(rawReply);
  return bubbles.length ? bubbles : [rawReply.trim() || "..."];
}
