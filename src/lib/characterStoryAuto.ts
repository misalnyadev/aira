export const CHARACTER_STORY_FREQUENCIES = ["every_other_day", "daily"] as const;
export type CharacterStoryFrequency = (typeof CHARACTER_STORY_FREQUENCIES)[number];

export const DEFAULT_CHARACTER_STORY_FREQUENCY: CharacterStoryFrequency = "every_other_day";

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseCharacterStoryFrequency(value: unknown): CharacterStoryFrequency | null {
  return value === "daily" || value === "every_other_day" ? value : null;
}

export function normalizeCharacterStoryFrequency(value: unknown): CharacterStoryFrequency {
  return parseCharacterStoryFrequency(value) ?? DEFAULT_CHARACTER_STORY_FREQUENCY;
}

export function getCharacterStoryIntervalMs(frequency: unknown): number {
  return normalizeCharacterStoryFrequency(frequency) === "daily" ? DAY_MS : 2 * DAY_MS;
}

export function isCharacterStoryDue(params: {
  enabled: boolean;
  frequency: unknown;
  lastAttemptAt: Date | null;
  now?: Date;
}): boolean {
  if (!params.enabled) return false;

  const now = params.now ?? new Date();
  const lastAttemptAt = params.lastAttemptAt;
  if (!lastAttemptAt || Number.isNaN(lastAttemptAt.getTime())) return true;

  const intervalMs = getCharacterStoryIntervalMs(params.frequency);
  return now.getTime() - lastAttemptAt.getTime() >= intervalMs;
}
