import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, characters, users, type ProviderType } from "@/db/schema";
import {
  AiProviderError,
  BUBBLE_DELIMITER,
  buildSystemPrompt,
  generateCharacterReply,
  isKeyRotatableError,
  isProviderFallbackError,
  splitIntoBubbles,
  toUserFacingError,
} from "@/lib/ai";
import type { ChatTurn } from "@/lib/ai";
import {
  IMMERSION_REMINDER,
  SAFE_FALLBACK_REPLY,
  findMetaBreak,
  stripMetaSentences,
} from "@/lib/ai/immersion";
import {
  buildKeyAttempts,
  orderProviderCandidates,
  parseBackupKeys,
  promoteKeyAtIndex,
  resolveCandidateModel,
} from "@/lib/providerPool";
import type { UserProfile } from "@/lib/userProfile";

/**
 * Mesin balasan bersama.
 *
 * Dipakai dua route: kirim pesan (`/api/chat`) dan ulangi balasan
 * (`/api/characters/[id]/regenerate`). Keduanya otomatis mendapat:
 * 1) penjaga peran (immersion),
 * 2) rotasi key cadangan saat key utama kena limit (429/401/5xx),
 * 3) promosi key yang sehat menjadi key utama di database, dan
 * 4) auto-fallback ke provider cadangan bila semua key di provider utama gagal.
 */

export type Character = typeof characters.$inferSelect;
export type Provider = typeof apiProviders.$inferSelect;

export const NO_PROVIDER_ERROR =
  "Belum ada API key yang dikonfigurasi. Buka Pengaturan (⚙️) untuk menambahkan API key Gemini, Groq, OpenRouter, atau custom.";

/** Sisakan ruang dari batas 60 detik Vercel agar balasan sempat disimpan ke database. */
const TIME_BUDGET_MS = 48_000;

/**
 * Ambil daftar kandidat provider milik pengguna ini (karakter → default → urutan dibuat).
 * API key milik akun lain tidak pernah ikut terbaca.
 */
export async function pickProviderCandidates(
  userId: string,
  characterProviderId: string | null,
  autoFallback: boolean
): Promise<Provider[]> {
  const rows = await db
    .select()
    .from(apiProviders)
    .where(eq(apiProviders.userId, userId))
    .orderBy(apiProviders.createdAt);

  return orderProviderCandidates(rows, characterProviderId, autoFallback);
}

/** Profil lawan bicara sekaligus setelan auto-fallback akun. */
export async function loadUserChatSettings(userId: string): Promise<{
  profile: UserProfile | null;
  autoFallback: boolean;
}> {
  const [row] = await db
    .select({
      displayName: users.displayName,
      nickname: users.nickname,
      age: users.age,
      occupation: users.occupation,
      about: users.about,
      autoFallback: users.autoFallback,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return { profile: null, autoFallback: true };

  return {
    profile: {
      displayName: row.displayName,
      nickname: row.nickname,
      age: row.age,
      occupation: row.occupation,
      about: row.about,
    },
    autoFallback: row.autoFallback,
  };
}

export { toChatTurns } from "@/lib/messageRules";

async function askWithImmersionGuard({
  providerType,
  apiKey,
  model,
  baseUrl,
  systemPrompt,
  history,
  userText,
  image,
}: {
  providerType: ProviderType;
  apiKey: string;
  model: string;
  baseUrl: string | null;
  systemPrompt: string;
  history: ChatTurn[];
  userText: string;
  image: { base64: string; mimeType: string } | null;
}): Promise<string[]> {
  const ask = (extraPrompt = "") =>
    generateCharacterReply(providerType, {
      apiKey,
      model,
      baseUrl,
      systemPrompt: systemPrompt + extraPrompt,
      history,
      userText,
      image,
    });

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

export type GenerateBubblesResult = {
  bubbles: string[];
  /** true bila balasan berasal dari provider cadangan karena provider pertama gagal. */
  fallbackUsed: boolean;
  /** Nama provider yang berhasil dipakai (berguna untuk memberi tahu saat fallback). */
  providerLabel: string;
  /** Nama provider pertama yang gagal sebelum beralih. */
  primaryLabel: string;
  /** true bila key cadangan di dalam provider berhasil menggantikan key utama. */
  keyRotated: boolean;
};

/**
 * Hasilkan balasan karakter dengan rotasi key cadangan + auto-fallback antar provider.
 */
export async function generateBubbles({
  userId,
  character,
  candidates,
  userText,
  image,
  history,
  userProfile,
}: {
  userId: string;
  character: Character;
  candidates: Provider[];
  userText: string;
  image: { base64: string; mimeType: string } | null;
  history: ChatTurn[];
  userProfile: UserProfile | null;
}): Promise<GenerateBubblesResult> {
  const systemPrompt = buildSystemPrompt(character, userProfile);
  const primaryLabel = candidates[0]?.label ?? "";
  const startedAt = Date.now();
  let lastError: unknown = null;

  for (let pIdx = 0; pIdx < candidates.length; pIdx++) {
    const candidate = candidates[pIdx];
    const model = resolveCandidateModel(character, candidate, pIdx === 0);
    const backups = parseBackupKeys(candidate.backupKeys, candidate.apiKey);
    const attempts = buildKeyAttempts(candidate.type, candidate.apiKey, backups);

    if (!attempts.length) {
      lastError = new AiProviderError(
        `API key untuk ${candidate.label} belum diisi. Buka Pengaturan untuk menambahkannya.`,
        { status: 401, retryable: true }
      );
      continue;
    }

    let providerLastErr: unknown = null;

    for (let kIdx = 0; kIdx < attempts.length; kIdx++) {
      try {
        const bubbles = await askWithImmersionGuard({
          providerType: candidate.type as ProviderType,
          apiKey: attempts[kIdx],
          model,
          baseUrl: candidate.baseUrl,
          systemPrompt,
          history,
          userText,
          image,
        });

        // Naikkan key sehat jadi utama tanpa menggagalkan balasan bila update DB meleset.
        const promoted = promoteKeyAtIndex(candidate.apiKey, backups, kIdx);
        if (promoted) {
          await db
            .update(apiProviders)
            .set({
              apiKey: promoted.apiKey,
              backupKeys: JSON.stringify(promoted.backupKeys),
              updatedAt: new Date(),
            })
            .where(and(eq(apiProviders.id, candidate.id), eq(apiProviders.userId, userId)))
            .catch(() => undefined);
        }

        return {
          bubbles,
          fallbackUsed: pIdx > 0,
          providerLabel: candidate.label,
          primaryLabel,
          keyRotated: kIdx > 0,
        };
      } catch (err) {
        providerLastErr = err;
        lastError = err;

        const outOfTime = Date.now() - startedAt > TIME_BUDGET_MS;
        const hasNextKey = kIdx < attempts.length - 1;
        if (outOfTime || !hasNextKey || !isKeyRotatableError(err)) break;
      }
    }

    const outOfTime = Date.now() - startedAt > TIME_BUDGET_MS;
    if (outOfTime || !isProviderFallbackError(providerLastErr)) break;
  }

  throw new AiProviderError(toUserFacingError(lastError));
}
