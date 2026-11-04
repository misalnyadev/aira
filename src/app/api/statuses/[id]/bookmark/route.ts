import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterStatuses, statusBookmarks } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });

  const { id } = await ctx.params;
  const [status] = await db
    .select({ id: characterStatuses.id })
    .from(characterStatuses)
    .where(eq(characterStatuses.id, id))
    .limit(1);
  if (!status) return NextResponse.json({ error: "Status tidak ditemukan." }, { status: 404 });

  const [bookmark] = await db
    .select({ id: statusBookmarks.id })
    .from(statusBookmarks)
    .where(and(eq(statusBookmarks.statusId, id), eq(statusBookmarks.userId, user.id)))
    .limit(1);

  const bookmarked = !bookmark;
  if (bookmark) {
    await db.delete(statusBookmarks).where(eq(statusBookmarks.id, bookmark.id));
  } else {
    await db.insert(statusBookmarks).values({ statusId: id, userId: user.id });
  }

  return NextResponse.json({ bookmarked });
}
