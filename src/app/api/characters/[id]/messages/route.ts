import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const { id } = await context.params;
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.characterId, id))
    .orderBy(asc(messages.createdAt));

  return NextResponse.json({ messages: rows });
}
