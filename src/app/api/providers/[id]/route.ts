import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";

const UNAUTHORIZED = { error: "Kamu belum masuk." };
const NOT_FOUND = { error: "Provider tidak ditemukan." };

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

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });

  const { label, apiKey, baseUrl, model, isDefault } = body as {
    label?: string;
    apiKey?: string;
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

  if (isDefault) {
    await db
      .update(apiProviders)
      .set({ isDefault: false })
      .where(and(eq(apiProviders.isDefault, true), eq(apiProviders.userId, user.id)));
  }

  const updates: Partial<typeof apiProviders.$inferInsert> = { updatedAt: new Date() };
  if (label !== undefined) updates.label = label.trim();
  if (apiKey !== undefined && apiKey.trim()) updates.apiKey = apiKey.trim();
  if (baseUrl !== undefined) updates.baseUrl = baseUrl.trim() || null;
  if (model !== undefined && model.trim()) updates.model = model.trim();
  if (isDefault !== undefined) updates.isDefault = isDefault;

  const [row] = await db
    .update(apiProviders)
    .set(updates)
    .where(and(eq(apiProviders.id, id), eq(apiProviders.userId, user.id)))
    .returning();

  if (!row) return NextResponse.json(NOT_FOUND, { status: 404 });

  return NextResponse.json({ provider: serialize(row) });
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
