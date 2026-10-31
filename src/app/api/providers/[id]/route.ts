import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  mergePatchedBackupKeys,
  parseBackupKeys,
  serializeProviderRow,
} from "@/lib/providerPool";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "Kamu belum masuk." };
const NOT_FOUND = { error: "Provider tidak ditemukan." };

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { label, apiKey, backupKeys, keepBackupIndexes, newBackupKeys, baseUrl, model, isDefault } =
    body as {
      label?: string;
      apiKey?: string;
      backupKeys?: unknown;
      keepBackupIndexes?: unknown;
      newBackupKeys?: unknown;
      baseUrl?: string;
      model?: string;
      isDefault?: boolean;
    };

  const [existing] = await db
    .select()
    .from(apiProviders)
    .where(and(eq(apiProviders.id, id), eq(apiProviders.userId, user.id)))
    .limit(1);

  if (!existing) return NextResponse.json(NOT_FOUND, { status: 404 });

  if (existing.type === "custom" && baseUrl !== undefined && !baseUrl.trim()) {
    return NextResponse.json(
      { error: "Base URL wajib diisi untuk provider custom." },
      { status: 400 }
    );
  }

  if (isDefault) {
    await db
      .update(apiProviders)
      .set({ isDefault: false })
      .where(and(eq(apiProviders.isDefault, true), eq(apiProviders.userId, user.id)));
  }

  const finalPrimaryKey =
    apiKey !== undefined && apiKey.trim() ? apiKey.trim() : existing.apiKey;
  const existingBackups = parseBackupKeys(existing.backupKeys, existing.apiKey);
  const nextBackups = mergePatchedBackupKeys(
    existingBackups,
    { backupKeys, keepBackupIndexes, newBackupKeys },
    finalPrimaryKey
  );

  const updates: Partial<typeof apiProviders.$inferInsert> = {
    updatedAt: new Date(),
    apiKey: finalPrimaryKey,
    backupKeys: JSON.stringify(nextBackups),
  };
  if (label !== undefined && label.trim()) updates.label = label.trim();
  if (baseUrl !== undefined) updates.baseUrl = baseUrl.trim() || null;
  if (model !== undefined && model.trim()) updates.model = model.trim();
  if (isDefault !== undefined) updates.isDefault = isDefault;

  const [row] = await db
    .update(apiProviders)
    .set(updates)
    .where(and(eq(apiProviders.id, id), eq(apiProviders.userId, user.id)))
    .returning();

  if (!row) return NextResponse.json(NOT_FOUND, { status: 404 });

  return NextResponse.json({ provider: serializeProviderRow(row) });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await context.params;

  const [row] = await db
    .delete(apiProviders)
    .where(and(eq(apiProviders.id, id), eq(apiProviders.userId, user.id)))
    .returning({ id: apiProviders.id });

  if (!row) return NextResponse.json(NOT_FOUND, { status: 404 });

  return NextResponse.json({ ok: true });
}
