import { NextResponse } from "next/server";
import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterStatuses, characters, users } from "@/db/schema";
import { ensureDb } from "@/lib/dbReady";
import {
  getCharacterStoryIntervalMs,
  isCharacterStoryDue,
  normalizeCharacterStoryFrequency,
} from "@/lib/characterStoryAuto";
import {
  generateProfileStoryPost,
  pickProviderCandidates,
  type ProfileStoryCharacter,
} from "@/lib/chatEngine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ACTIVE_CHARACTERS = 500;
const MAX_PARALLEL_STORIES = 8;
const MAX_RUN_BUDGET_MS = 54_000;
const MAX_GENERATION_BUDGET_MS = 25_000;
const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000;

type RunResult = "published" | "no_provider" | "skipped" | "failed";
type ScheduledCharacter = ProfileStoryCharacter &
  Pick<
    typeof characters.$inferSelect,
    "storyAutoEnabled" | "storyAutoFrequency" | "storyAutoLastAttemptAt" | "createdAt"
  >;

async function postCharacterStory(character: ScheduledCharacter): Promise<RunResult> {
  const userId = character.userId;
  if (!userId || !character.storyAutoEnabled) return "skipped";

  const attemptAt = new Date();
  const frequency = normalizeCharacterStoryFrequency(character.storyAutoFrequency);
  if (
    !isCharacterStoryDue({
      enabled: character.storyAutoEnabled,
      frequency,
      lastAttemptAt: character.storyAutoLastAttemptAt,
      now: attemptAt,
    })
  ) {
    return "skipped";
  }

  const [account] = await db
    .select({ autoFallback: users.autoFallback })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account) return "skipped";

  const candidates = await pickProviderCandidates(
    userId,
    character.providerId,
    account.autoFallback
  );
  if (!candidates.length) return "no_provider";

  const cutoff = new Date(
    attemptAt.getTime() - getCharacterStoryIntervalMs(frequency)
  );
  const [claimed] = await db
    .update(characters)
    .set({ storyAutoLastAttemptAt: attemptAt })
    .where(
      and(
        eq(characters.id, character.id),
        eq(characters.userId, userId),
        eq(characters.storyAutoEnabled, true),
        eq(characters.storyAutoFrequency, character.storyAutoFrequency),
        or(
          isNull(characters.storyAutoLastAttemptAt),
          lte(characters.storyAutoLastAttemptAt, cutoff)
        )
      )
    )
    .returning({ id: characters.id });
  if (!claimed) return "skipped";

  try {
    const content = await generateProfileStoryPost({
      userId,
      character,
      candidates,
    });
    const [stillEnabled] = await db
      .select({ id: characters.id })
      .from(characters)
      .where(
        and(
          eq(characters.id, character.id),
          eq(characters.userId, userId),
          eq(characters.storyAutoEnabled, true)
        )
      )
      .limit(1);
    if (!stillEnabled) return "skipped";

    const postedAt = new Date();
    await db.insert(characterStatuses).values({
      userId,
      characterId: character.id,
      kind: "status",
      mediaType: "text",
      caption: "",
      content,
      expiresAt: new Date(postedAt.getTime() + STATUS_LIFETIME_MS),
      createdAt: postedAt,
      updatedAt: postedAt,
    });
    return "published";
  } catch {
    // Jangan mengulang panggilan berbayar berkali-kali pada jadwal yang sama.
    return "failed";
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET belum dikonfigurasi." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  await ensureDb();
  const now = new Date();
  const charactersWithAutoStory = await db
    .select({
      id: characters.id,
      userId: characters.userId,
      name: characters.name,
      gender: characters.gender,
      shortBio: characters.shortBio,
      personality: characters.personality,
      bible: characters.bible,
      skillPortfolio: characters.skillPortfolio,
      providerId: characters.providerId,
      model: characters.model,
      storyAutoEnabled: characters.storyAutoEnabled,
      storyAutoFrequency: characters.storyAutoFrequency,
      storyAutoLastAttemptAt: characters.storyAutoLastAttemptAt,
      createdAt: characters.createdAt,
    })
    .from(characters)
    .where(
      and(
        eq(characters.storyAutoEnabled, true),
        isNotNull(characters.userId)
      )
    )
    .orderBy(
      asc(sql`coalesce(${characters.storyAutoLastAttemptAt}, ${characters.createdAt})`),
      asc(characters.id)
    )
    .limit(MAX_ACTIVE_CHARACTERS);

  const dueCharacters = charactersWithAutoStory.filter((character) =>
    isCharacterStoryDue({
      enabled: character.storyAutoEnabled,
      frequency: character.storyAutoFrequency,
      lastAttemptAt: character.storyAutoLastAttemptAt,
      now,
    })
  );
  const runDeadline = Date.now() + MAX_RUN_BUDGET_MS;
  let nextIndex = 0;
  let checked = 0;
  let published = 0;
  let skippedNoProvider = 0;
  let failed = 0;

  const workerCount = Math.min(MAX_PARALLEL_STORIES, dueCharacters.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < dueCharacters.length) {
        if (Date.now() + MAX_GENERATION_BUDGET_MS + 1_000 > runDeadline) return;
        const character = dueCharacters[nextIndex++];
        let result: RunResult;
        try {
          result = await postCharacterStory(character);
        } catch {
          result = "failed";
        }
        checked++;
        if (result === "published") published++;
        else if (result === "no_provider") skippedNoProvider++;
        else if (result === "failed") failed++;
      }
    })
  );

  const hasMore = nextIndex < dueCharacters.length || charactersWithAutoStory.length === MAX_ACTIVE_CHARACTERS;
  return NextResponse.json({
    ok: failed === 0,
    due: dueCharacters.length,
    checked,
    published,
    skippedNoProvider,
    failed,
    hasMore,
    ranAt: new Date().toISOString(),
  }, { status: failed === 0 ? 200 : 500 });
}
