import { MAX_BACKUP_KEYS, MAX_KEY_ATTEMPTS, MAX_PROVIDER_FALLBACKS } from "./limits";

/**
 * Aturan murni untuk rotasi multi API key & auto-fallback antar provider.
 *
 * Dipisah dari database supaya semua urutan percobaan, pembersihan duplikat,
 * promosi key yang sehat, serta penyamaran key bisa diuji langsung.
 */

export function maskKey(key: string): string {
  const clean = key?.trim() ?? "";
  if (!clean) return "";
  if (clean.length <= 6) return "••••";
  return `${clean.slice(0, 3)}••••${clean.slice(-3)}`;
}

/** Bersihkan daftar key cadangan: buang kosong, duplikat, dan yang kembar dengan key utama. */
export function cleanBackupKeys(input: unknown, primaryKey: string): string[] {
  if (!Array.isArray(input)) return [];
  const primary = primaryKey.trim();
  const seen = new Set<string>(primary ? [primary] : []);
  const out: string[] = [];

  for (const item of input) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= MAX_BACKUP_KEYS) break;
  }

  return out;
}

/** Baca JSON kolom `backup_keys` dari database dengan aman. */
export function parseBackupKeys(raw: string | null | undefined, primaryKey = ""): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return cleanBackupKeys(parsed, primaryKey);
  } catch {
    return [];
  }
}

/**
 * Gabungkan perubahan key cadangan saat PATCH provider tanpa perlu pernah
 * mengirim key asli yang sudah tersimpan kembali ke browser.
 */
export function mergePatchedBackupKeys(
  existingBackups: readonly string[],
  patch: {
    backupKeys?: unknown;
    keepBackupIndexes?: unknown;
    newBackupKeys?: unknown;
  },
  finalPrimaryKey: string
): string[] {
  if (Array.isArray(patch.backupKeys)) {
    return cleanBackupKeys(patch.backupKeys, finalPrimaryKey);
  }

  let kept: string[];
  if (Array.isArray(patch.keepBackupIndexes)) {
    const allowed = new Set(
      patch.keepBackupIndexes.filter((n): n is number => typeof n === "number" && Number.isInteger(n))
    );
    kept = existingBackups.filter((_, index) => allowed.has(index));
  } else {
    kept = [...existingBackups];
  }

  const added = Array.isArray(patch.newBackupKeys) ? patch.newBackupKeys : [];
  return cleanBackupKeys([...kept, ...added], finalPrimaryKey);
}

/**
 * Susun antrean API key yang akan dicoba untuk satu provider.
 * Provider `custom` (mis. Ollama) tetap mendapat satu giliran `[""]` walau tanpa key.
 */
export function buildKeyAttempts(
  providerType: string,
  apiKey: string,
  backupKeys: readonly string[],
  maxAttempts = MAX_KEY_ATTEMPTS
): string[] {
  const all = [apiKey, ...backupKeys]
    .map((k) => (k ?? "").trim())
    .filter(Boolean);
  const unique = [...new Set(all)].slice(0, Math.max(1, maxAttempts));
  if (unique.length > 0) return unique;
  return providerType === "custom" ? [""] : [];
}

/**
 * Bila balasan berhasil menggunakan key cadangan (`usedIndex > 0`), naikkan key
 * sehat itu jadi `apiKey` utama dan geser key utama lama ke posisi cadangan
 * supaya kuota key lama tetap bisa dipakai lagi saat sudah pulih besoknya.
 */
export function promoteKeyAtIndex(
  apiKey: string,
  backupKeys: readonly string[],
  usedIndex: number
): { apiKey: string; backupKeys: string[] } | null {
  if (usedIndex <= 0) return null;
  const all = [apiKey, ...backupKeys].map((k) => k.trim()).filter(Boolean);
  const unique = [...new Set(all)];
  const winner = unique[usedIndex];
  if (!winner) return null;

  const rest = unique.filter((k) => k !== winner).slice(0, MAX_BACKUP_KEYS);
  return { apiKey: winner, backupKeys: rest };
}

export type MinimalProvider = {
  id: string;
  isDefault: boolean;
  model: string;
};

/**
 * Urutkan kandidat provider milik pengguna:
 * 1) provider khusus karakter (kalau masih ada)
 * 2) provider default akun
 * 3) provider lain sesuai urutan simpan
 *
 * Saat `autoFallback` mati, hanya kandidat pertama yang dipakai.
 */
export function orderProviderCandidates<T extends MinimalProvider>(
  providers: readonly T[],
  characterProviderId: string | null,
  autoFallback: boolean,
  maxProviders = MAX_PROVIDER_FALLBACKS
): T[] {
  if (!providers.length) return [];

  const chosen = characterProviderId
    ? providers.find((p) => p.id === characterProviderId)
    : undefined;
  const def = providers.find((p) => p.isDefault && p.id !== chosen?.id);
  const rest = providers.filter((p) => p.id !== chosen?.id && p.id !== def?.id);

  const ordered = [
    ...(chosen ? [chosen] : []),
    ...(def ? [def] : []),
    ...rest,
  ];

  if (!autoFallback) return ordered.slice(0, 1);
  return ordered.slice(0, Math.max(1, maxProviders));
}

/**
 * Pilih nama model untuk kandidat provider saat ini.
 * Override model di karakter hanya dipakai pada provider utamanya — kalau sudah
 * jatuh ke provider cadangan lain, pakai model bawaan provider cadangan itu
 * supaya model Gemini tidak nyasar dikirim ke Grok/OpenRouter.
 */
export function resolveCandidateModel(
  character: { providerId: string | null; model: string | null },
  candidate: { id: string; model: string },
  isPrimary: boolean
): string {
  const customModel = character.model?.trim() ?? "";
  if (customModel && (isPrimary || character.providerId === candidate.id)) {
    return customModel;
  }
  return candidate.model;
}

export function serializeProviderRow(row: {
  id: string;
  type: string;
  label: string;
  apiKey: string;
  backupKeys?: string | null;
  baseUrl: string | null;
  model: string;
  isDefault: boolean;
  createdAt: Date | string;
}) {
  const backups = parseBackupKeys(row.backupKeys, row.apiKey);
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    baseUrl: row.baseUrl,
    model: row.model,
    isDefault: row.isDefault,
    hasKey: Boolean(row.apiKey?.trim()),
    maskedKey: maskKey(row.apiKey),
    backupCount: backups.length,
    maskedBackupKeys: backups.map(maskKey),
    createdAt: row.createdAt,
  };
}
