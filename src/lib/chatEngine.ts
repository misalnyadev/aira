import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, characters, messages, users, type ProviderType } from "@/db/schema";
import {
  AiProviderError,
  BUBBLE_DELIMITER,
  buildSystemPrompt,
  generateCharacterReply,
  isKeyRotatableError,
  isProviderFallbackError,
  splitIntoBubbles,
  toUserFacingError,
  type ChatTurn,
  type MemoryPromptContext,
} from "@/lib/ai";
import {
  IMMERSION_REMINDER,
  SAFE_FALLBACK_REPLY,
  findMetaBreak,
  stripMetaSentences,
} from "@/lib/ai/immersion";
import {
  buildMemorySummarizerPrompt,
  describeTimeAwareness,
  extractArchiveRecallPlan,
  pickRelevantArchivedSnippets,
  sanitizeMemorySummary,
} from "@/lib/characterMemory";
import { AUTO_MEMORY_BATCH_MIN } from "@/lib/limits";
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
 * 3) promosi key yang sehat menjadi key utama di database,
 * 4) auto-fallback ke provider cadangan bila semua key di provider utama gagal, dan
 * 5) kesadaran waktu WIB + Buku Ingatan Jangka Panjang + pencarian arsip ber-tanggal.
 */

export type Character = typeof characters.$inferSelect;
export type Provider = typeof apiProviders.$inferSelect;

export const NO_PROVIDER_ERROR =
  "Belum ada API key yang dikonfigurasi. Buka Pengaturan (⚙️) untuk menambahkan API key Gemini, Groq, OpenRouter, atau custom.";

/** Sisakan ruang dari batas 60 detik Vercel agar balasan sempat disimpan ke database. */
const TIME_BUDGET_MS = 48_000;

/** Sisakan ekor obrolan terbaru agar rangkuman otomatis hanya mengarsipkan pesan yang mulai bergeser lama. */
const ACTIVE_TAIL_KEEP = 40;

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

/**
 * Susun konteks Kesadaran Waktu WIB + Buku Ingatan + Arsip Terkait bila
 * fitur ingatan panjang dinyalakan pada karakter ini.
 */
export async function buildMemoryExtrasForTurn({
  character,
  chronologicalHistory,
  excludeMessageId,
  userText,
  now = new Date(),
}: {
  character: Character;
  chronologicalHistory: (typeof messages.$inferSelect)[];
  excludeMessageId?: string;
  userText: string;
  now?: Date;
}): Promise<MemoryPromptContext | undefined> {
  if (!character.memoryEnabled) return undefined;

  const priorRows = chronologicalHistory.filter((m) => m.id !== excludeMessageId);
  const lastPrior = priorRows[priorRows.length - 1] ?? null;
  const timeAwareness = describeTimeAwareness(now, lastPrior?.createdAt ?? null);

  let recalledArchive = "";
  const oldestInWindow = priorRows[0] ?? null;
  const plan = extractArchiveRecallPlan(userText, now);

  if (plan.shouldSearch && oldestInWindow) {
    const olderDesc = await db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          eq(messages.characterId, character.id),
          lt(messages.createdAt, oldestInWindow.createdAt)
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(360);

    if (olderDesc.length > 0) {
      recalledArchive = pickRelevantArchivedSnippets(
        olderDesc.reverse(),
        plan,
        character.name
      );
    }
  }

  return {
    timeAwareness,
    memorySummary: character.memorySummary || "",
    recalledArchive,
  };
}

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
  fallbackUsed: boolean;
  providerLabel: string;
  primaryLabel: string;
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
  memoryExtras,
}: {
  userId: string;
  character: Character;
  candidates: Provider[];
  userText: string;
  image: { base64: string; mimeType: string } | null;
  history: ChatTurn[];
  userProfile: UserProfile | null;
  memoryExtras?: MemoryPromptContext;
}): Promise<GenerateBubblesResult> {
  const systemPrompt = buildSystemPrompt(character, userProfile, memoryExtras);
  const primaryLabel = candidates[0]?.label ?? "";
  const startedAt = Date.now();
  let lastError: unknown = null;

  for (let pIdx = 0; pIdx < candidates.length; pIdx++) {
    const candidate = candidates[pIdx];
    const model = resolveCandidateModel(character, candidate, pIdx === 0, Boolean(image));
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

async function runTextWithCandidates({
  candidates,
  character,
  systemPrompt,
  userText,
  budgetMs = 15_000,
}: {
  candidates: Provider[];
  character: Character;
  systemPrompt: string;
  userText: string;
  budgetMs?: number;
}): Promise<string> {
  const startedAt = Date.now();
  let lastError: unknown = null;

  for (let pIdx = 0; pIdx < candidates.length; pIdx++) {
    const candidate = candidates[pIdx];
    const model = resolveCandidateModel(character, candidate, pIdx === 0);
    const backups = parseBackupKeys(candidate.backupKeys, candidate.apiKey);
    const attempts = buildKeyAttempts(candidate.type, candidate.apiKey, backups);
    if (!attempts.length) continue;

    let providerErr: unknown = null;
    for (let kIdx = 0; kIdx < attempts.length; kIdx++) {
      try {
        return await generateCharacterReply(candidate.type as ProviderType, {
          apiKey: attempts[kIdx],
          model,
          baseUrl: candidate.baseUrl,
          systemPrompt,
          history: [],
          userText,
          image: null,
        });
      } catch (err) {
        providerErr = err;
        lastError = err;
        if (Date.now() - startedAt > budgetMs || kIdx >= attempts.length - 1 || !isKeyRotatableError(err)) {
          break;
        }
      }
    }
    if (Date.now() - startedAt > budgetMs || !isProviderFallbackError(providerErr)) {
      break;
    }
  }

  throw new AiProviderError(toUserFacingError(lastError, "Gagal merangkum ingatan."));
}

/**
 * Perbarui Buku Ingatan Jangka Panjang karakter:
 * - `forceAll = false` (otomatis seusai chat): hanya jalan bila sudah ada >= 20
 *   gelembung lama di luar ekor 40 pesan aktif yang belum pernah dirangkum.
 * - `forceAll = true` (tombol manual di Profil Karakter): langsung merangkum
 *   percakapan hingga pesan paling akhir saat ini.
 */
export async function refreshCharacterMemory({
  userId,
  character,
  candidates,
  forceAll = false,
}: {
  userId: string;
  character: Character;
  candidates: Provider[];
  forceAll?: boolean;
}): Promise<{
  updated: boolean;
  memorySummary: string;
  memoryUpdatedAt: Date | null;
  summarizedCount: number;
}> {
  if (!forceAll && !character.memoryEnabled) {
    return {
      updated: false,
      memorySummary: character.memorySummary,
      memoryUpdatedAt: character.memoryUpdatedAt,
      summarizedCount: 0,
    };
  }

  const whereClause = character.memoryThroughAt
    ? and(
        eq(messages.characterId, character.id),
        gt(messages.createdAt, character.memoryThroughAt)
      )
    : eq(messages.characterId, character.id);

  let pendingRows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(whereClause)
    .orderBy(asc(messages.createdAt))
    .limit(160);

  if (!forceAll) {
    if (pendingRows.length <= ACTIVE_TAIL_KEEP) {
      return {
        updated: false,
        memorySummary: character.memorySummary,
        memoryUpdatedAt: character.memoryUpdatedAt,
        summarizedCount: 0,
      };
    }
    const archivable = pendingRows.slice(0, pendingRows.length - ACTIVE_TAIL_KEEP);
    if (archivable.length < AUTO_MEMORY_BATCH_MIN) {
      return {
        updated: false,
        memorySummary: character.memorySummary,
        memoryUpdatedAt: character.memoryUpdatedAt,
        summarizedCount: 0,
      };
    }
    pendingRows = archivable.slice(0, 80);
  } else {
    // Jika semua pesan sudah pernah dirangkum tapi pengguna meminta segarkan ulang manual,
    // baca kembali hingga 100 pesan terbaru agar rangkuman tetap bisa diperbarui.
    if (pendingRows.length === 0) {
      const latestDesc = await db
        .select({
          id: messages.id,
          role: messages.role,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.characterId, character.id))
        .orderBy(desc(messages.createdAt))
        .limit(100);
      pendingRows = latestDesc.reverse();
    } else {
      pendingRows = pendingRows.slice(-100);
    }

    if (pendingRows.length === 0) {
      return {
        updated: false,
        memorySummary: character.memorySummary,
        memoryUpdatedAt: character.memoryUpdatedAt,
        summarizedCount: 0,
      };
    }
  }

  const { systemPrompt, userText } = buildMemorySummarizerPrompt({
    characterName: character.name,
    existingSummary: character.memorySummary,
    messagesToDigest: pendingRows,
  });

  const rawSummary = await runTextWithCandidates({
    candidates,
    character,
    systemPrompt,
    userText,
    budgetMs: forceAll ? 35_000 : 12_000,
  });

  const nextSummary = sanitizeMemorySummary(rawSummary);
  if (!nextSummary) {
    return {
      updated: false,
      memorySummary: character.memorySummary,
      memoryUpdatedAt: character.memoryUpdatedAt,
      summarizedCount: 0,
    };
  }

  const lastDigestedAt = pendingRows[pendingRows.length - 1].createdAt;
  const now = new Date();

  await db
    .update(characters)
    .set({
      memoryEnabled: true,
      memorySummary: nextSummary,
      memoryThroughAt: lastDigestedAt,
      memoryUpdatedAt: now,
      updatedAt: now,
    })
    .where(and(eq(characters.id, character.id), eq(characters.userId, userId)));

  return {
    updated: true,
    memorySummary: nextSummary,
    memoryUpdatedAt: now,
    summarizedCount: pendingRows.length,
  };
}
