import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, type ProviderType } from "@/db/schema";
import { generateCharacterReply, isKeyRotatableError, toUserFacingError } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  buildKeyAttempts,
  parseBackupKeys,
  promoteKeyAtIndex,
  serializeProviderRow,
} from "@/lib/providerPool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Uji koneksi provider yang tersimpan di server.
 *
 * Key diuji langsung di sisi server (tidak pernah dikirim balik ke browser).
 * Bila key utama kena limit tetapi salah satu key cadangan berhasil, key yang
 * sehat langsung dinaikkan menjadi key utama.
 */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Kamu belum masuk." }, { status: 401 });
  }

  const { id } = await context.params;
  const [provider] = await db
    .select()
    .from(apiProviders)
    .where(and(eq(apiProviders.id, id), eq(apiProviders.userId, user.id)))
    .limit(1);

  if (!provider) {
    return NextResponse.json({ ok: false, error: "Provider tidak ditemukan." }, { status: 404 });
  }

  const backups = parseBackupKeys(provider.backupKeys, provider.apiKey);
  const attempts = buildKeyAttempts(provider.type, provider.apiKey, backups);
  if (!attempts.length) {
    return NextResponse.json({
      ok: false,
      error: "API key belum diisi pada provider ini.",
    });
  }

  const failures: string[] = [];
  for (let i = 0; i < attempts.length; i++) {
    try {
      await generateCharacterReply(provider.type as ProviderType, {
        apiKey: attempts[i],
        model: provider.model.trim(),
        baseUrl: provider.baseUrl,
        systemPrompt: "Kamu adalah alat uji koneksi. Balas singkat sesuai instruksi.",
        history: [],
        userText: 'Tes koneksi. Balas hanya dengan satu kata: "siap".',
        image: null,
      });

      let currentRow = provider;
      const promoted = promoteKeyAtIndex(provider.apiKey, backups, i);
      if (promoted) {
        const [updated] = await db
          .update(apiProviders)
          .set({
            apiKey: promoted.apiKey,
            backupKeys: JSON.stringify(promoted.backupKeys),
            updatedAt: new Date(),
          })
          .where(and(eq(apiProviders.id, provider.id), eq(apiProviders.userId, user.id)))
          .returning();
        if (updated) currentRow = updated;
      }

      return NextResponse.json({
        ok: true,
        usedKeyNumber: i + 1,
        totalKeys: attempts.length,
        promoted: Boolean(promoted),
        provider: serializeProviderRow(currentRow),
      });
    } catch (err) {
      failures.push(toUserFacingError(err, "Gagal terhubung ke provider."));
      if (!isKeyRotatableError(err)) break;
    }
  }

  return NextResponse.json({
    ok: false,
    error: failures[failures.length - 1] || "Gagal terhubung ke provider.",
    keysTried: failures.length,
  });
}
