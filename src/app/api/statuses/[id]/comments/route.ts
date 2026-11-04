import { NextResponse } from "next/server";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characterStatuses, statusComments, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  const { id } = await ctx.params;
  const [exists] = await db.select({ id: characterStatuses.id }).from(characterStatuses).where(eq(characterStatuses.id, id)).limit(1);
  if (!exists) return NextResponse.json({ error: "Status tidak ditemukan." }, { status: 404 });

  const rows = await db
    .select({
      id: statusComments.id,
      content: statusComments.content,
      createdAt: statusComments.createdAt,
      userId: statusComments.userId,
      displayName: users.displayName,
      nickname: users.nickname,
      avatarUrl: users.avatarUrl,
    })
    .from(statusComments)
    .leftJoin(users, eq(users.id, statusComments.userId))
    .where(eq(statusComments.statusId, id))
    .orderBy(asc(statusComments.createdAt))
    .limit(100);

  return NextResponse.json({ comments: rows });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  const { id } = await ctx.params;
  const [exists] = await db.select({ id: characterStatuses.id }).from(characterStatuses).where(eq(characterStatuses.id, id)).limit(1);
  if (!exists) return NextResponse.json({ error: "Status tidak ditemukan." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const text = typeof (body as any)?.content === "string" ? (body as any).content.trim().slice(0, 500) : "";
  if (!text) return NextResponse.json({ error: "Komentar kosong." }, { status: 400 });

  const [row] = await db.insert(statusComments).values({ statusId: id, userId: user.id, content: text }).returning();
  return NextResponse.json({ comment: row });
}
