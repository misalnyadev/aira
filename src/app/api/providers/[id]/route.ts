import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, providerTypeValues, type ProviderType } from "@/db/schema";
import { PROVIDER_META } from "@/lib/ai/providerDefaults";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  mergePatchedBackupKeys,
  normalizeOptionalString,
  parseBackupKeys,
  serializeProviderRow,
} from "@/lib/providerPool";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "Kamu belum masuk." };
const NOT_FOUND = { error: "Provider tidak ditemukan." };

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();

    const user = await requireUser();
    if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const { id } = await context.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
    }

    const {
      type,
      label,
      apiKey,
      backupKeys,
      keepBackupIndexes,
      newBackupKeys,
      baseUrl,
      model,
      isDefault,
    } = body as {
      type?: unknown;
      label?: unknown;
      apiKey?: unknown;
      backupKeys?: unknown;
      keepBackupIndexes?: unknown;
      newBackupKeys?: unknown;
      baseUrl?: unknown;
      model?: unknown;
      isDefault?: unknown;
    };

    const [existing] = await db
      .select()
      .from(apiProviders)
      .where(and(eq(apiProviders.id, id), eq(apiProviders.userId, user.id)))
      .limit(1);

    if (!existing) return NextResponse.json(NOT_FOUND, { status: 404 });

    const cleanType = normalizeOptionalString(type);
    const cleanLabel = normalizeOptionalString(label);
    const cleanApiKey = normalizeOptionalString(apiKey);
    const cleanBaseUrl = normalizeOptionalString(baseUrl);
    const cleanModel = normalizeOptionalString(model);

    const nextType: ProviderType =
      cleanType && providerTypeValues.includes(cleanType as ProviderType)
        ? (cleanType as ProviderType)
        : (existing.type as ProviderType);

    if (nextType === "custom") {
      const candidateBase =
        cleanBaseUrl !== undefined ? cleanBaseUrl : (existing.baseUrl?.trim() ?? "");
      if (!candidateBase) {
        return NextResponse.json(
          { error: "Base URL wajib diisi untuk provider custom." },
          { status: 400 }
        );
      }
    }

    if (isDefault === true) {
      await db
        .update(apiProviders)
        .set({ isDefault: false })
        .where(and(eq(apiProviders.isDefault, true), eq(apiProviders.userId, user.id)));
    }

    const finalPrimaryKey = cleanApiKey ? cleanApiKey : existing.apiKey;
    const existingBackups = parseBackupKeys(existing.backupKeys, existing.apiKey);
    const nextBackups = mergePatchedBackupKeys(
      existingBackups,
      { backupKeys, keepBackupIndexes, newBackupKeys },
      finalPrimaryKey
    );

    const updates: Partial<typeof apiProviders.$inferInsert> = {
      updatedAt: new Date(),
      type: nextType,
      apiKey: finalPrimaryKey,
      backupKeys: JSON.stringify(nextBackups),
    };

    if (cleanLabel) updates.label = cleanLabel;

    if (nextType === "custom") {
      if (cleanBaseUrl !== undefined) {
        updates.baseUrl = cleanBaseUrl || null;
      } else if (baseUrl === null) {
        updates.baseUrl = null;
      }
    } else {
      updates.baseUrl = cleanBaseUrl || PROVIDER_META[nextType]?.baseUrl || null;
    }

    if (cleanModel) {
      updates.model = cleanModel;
    } else if (nextType !== existing.type && PROVIDER_META[nextType]?.defaultModel) {
      updates.model = PROVIDER_META[nextType].defaultModel;
    }

    if (typeof isDefault === "boolean") {
      updates.isDefault = isDefault;
    }

    const [row] = await db
      .update(apiProviders)
      .set(updates)
      .where(and(eq(apiProviders.id, id), eq(apiProviders.userId, user.id)))
      .returning();

    if (!row) return NextResponse.json(NOT_FOUND, { status: 404 });

    return NextResponse.json({ provider: serializeProviderRow(row) });
  } catch (err) {
    console.error("[PATCH /api/providers/[id]]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error && err.message
            ? `Gagal memperbarui provider: ${err.message}`
            : "Gagal memperbarui provider.",
      },
      { status: 500 }
    );
  }
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
