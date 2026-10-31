import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, providerTypeValues, users, type ProviderType } from "@/db/schema";
import { resolveValidProviderModel } from "@/lib/ai/models";
import { PROVIDER_META } from "@/lib/ai/providerDefaults";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { cleanBackupKeys, serializeProviderRow } from "@/lib/providerPool";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const [rows, [userRow]] = await Promise.all([
    db
      .select()
      .from(apiProviders)
      .where(eq(apiProviders.userId, user.id))
      .orderBy(apiProviders.createdAt),
    db
      .select({ autoFallback: users.autoFallback })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
  ]);

  return NextResponse.json({
    providers: rows.map(serializeProviderRow),
    autoFallback: userRow?.autoFallback ?? true,
  });
}

export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { type, label, apiKey, backupKeys, baseUrl, model, isDefault } = body as {
    type?: string;
    label?: string;
    apiKey?: string;
    backupKeys?: unknown;
    baseUrl?: string;
    model?: string;
    isDefault?: boolean;
  };

  if (!type || !providerTypeValues.includes(type as ProviderType)) {
    return NextResponse.json({ error: "Tipe provider tidak valid." }, { status: 400 });
  }
  const providerType = type as ProviderType;
  const meta = PROVIDER_META[providerType];

  if (providerType === "custom" && !baseUrl?.trim()) {
    return NextResponse.json(
      { error: "Base URL wajib diisi untuk provider custom." },
      { status: 400 }
    );
  }

  let primaryKey = apiKey?.trim() || "";
  let cleanedBackups = cleanBackupKeys(backupKeys, primaryKey);
  if (!primaryKey && cleanedBackups.length > 0) {
    primaryKey = cleanedBackups[0];
    cleanedBackups = cleanedBackups.slice(1);
  }

  if (providerType !== "custom" && !primaryKey) {
    return NextResponse.json({ error: "API key wajib diisi." }, { status: 400 });
  }

  const resolvedBase = baseUrl?.trim() || meta.baseUrl || null;
  const { model: finalModel, autoReplacedFrom } = await resolveValidProviderModel({
    type: providerType,
    keys: [primaryKey, ...cleanedBackups],
    baseUrl: resolvedBase,
    requestedModel: model,
  });

  if (!finalModel) {
    return NextResponse.json({ error: "Model wajib diisi." }, { status: 400 });
  }

  if (isDefault) {
    // Hanya default milik sendiri yang dilepas, punya orang lain tidak disentuh.
    await db
      .update(apiProviders)
      .set({ isDefault: false })
      .where(and(eq(apiProviders.isDefault, true), eq(apiProviders.userId, user.id)));
  }

  const [row] = await db
    .insert(apiProviders)
    .values({
      userId: user.id,
      type: providerType,
      label: label?.trim() || meta.name,
      apiKey: primaryKey,
      backupKeys: JSON.stringify(cleanedBackups),
      baseUrl: resolvedBase,
      model: finalModel,
      isDefault: Boolean(isDefault),
    })
    .returning();

  return NextResponse.json(
    { provider: serializeProviderRow(row), autoReplacedFrom },
    { status: 201 }
  );
}

/** Simpan preferensi auto-fallback antar provider milik akun ini. */
export async function PATCH(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.autoFallback !== "boolean") {
    return NextResponse.json({ error: "autoFallback harus berupa boolean." }, { status: 400 });
  }

  const [row] = await db
    .update(users)
    .set({ autoFallback: body.autoFallback })
    .where(eq(users.id, user.id))
    .returning({ autoFallback: users.autoFallback });

  return NextResponse.json({ autoFallback: row?.autoFallback ?? body.autoFallback });
}
