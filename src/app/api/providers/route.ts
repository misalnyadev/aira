import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders, providerTypeValues, type ProviderType } from "@/db/schema";
import { PROVIDER_META } from "@/lib/ai/providerDefaults";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 6) return "••••";
  return `${key.slice(0, 3)}••••${key.slice(-3)}`;
}

function serialize(row: typeof apiProviders.$inferSelect) {
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    baseUrl: row.baseUrl,
    model: row.model,
    isDefault: row.isDefault,
    hasKey: Boolean(row.apiKey),
    maskedKey: maskKey(row.apiKey),
    createdAt: row.createdAt,
  };
}

export async function GET() {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(apiProviders)
    .where(eq(apiProviders.userId, user.id))
    .orderBy(apiProviders.createdAt);

  return NextResponse.json({ providers: rows.map(serialize) });
}

export async function POST(req: Request) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { type, label, apiKey, baseUrl, model, isDefault } = body as {
    type?: string;
    label?: string;
    apiKey?: string;
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

  const finalModel = model?.trim() || meta.defaultModel;
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
      apiKey: apiKey?.trim() || "",
      baseUrl: baseUrl?.trim() || meta.baseUrl || null,
      model: finalModel,
      isDefault: Boolean(isDefault),
    })
    .returning();

  return NextResponse.json({ provider: serialize(row) }, { status: 201 });
}
