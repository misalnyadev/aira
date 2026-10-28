import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiProviders } from "@/db/schema";
import { ensureDb } from "@/lib/dbReady";

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

  const [existing] = await db.select().from(apiProviders).where(eq(apiProviders.id, id));
  if (!existing) {
    return NextResponse.json({ error: "Provider tidak ditemukan." }, { status: 404 });
  }

  if (isDefault) {
    await db.update(apiProviders).set({ isDefault: false }).where(eq(apiProviders.isDefault, true));
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
    .where(eq(apiProviders.id, id))
    .returning();

  return NextResponse.json({ provider: serialize(row) });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const { id } = await context.params;
  await db.delete(apiProviders).where(eq(apiProviders.id, id));
  return NextResponse.json({ ok: true });
}
