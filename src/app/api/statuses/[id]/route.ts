import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterStatuses, statusComments, statusLikes, statusViews } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { deleteR2Object } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  const { id } = await ctx.params;
  const [row] = await db.select().from(characterStatuses).where(eq(characterStatuses.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Status tidak ditemukan." }, { status: 404 });
  if (row.userId !== user.id && !user.isAdmin) return NextResponse.json({ error: "Bukan milikmu." }, { status: 403 });

  // bersihkan likes/comments/views cascade via FK, tapi hapus R2 objek video jika ada
  if (row.videoKey && row.videoKey.startsWith("media/")) {
    await deleteR2Object(row.videoKey).catch(() => undefined);
  }
  await db.delete(characterStatuses).where(eq(characterStatuses.id, id));
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  const { id } = await ctx.params;
  const [row] = await db.select().from(characterStatuses).where(eq(characterStatuses.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Status tidak ditemukan." }, { status: 404 });
  if (row.userId !== user.id && !user.isAdmin) return NextResponse.json({ error: "Bukan milikmu." }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Data tidak valid." }, { status: 400 });
  }
  const input = body as { caption?: unknown; content?: unknown };
  const caption = typeof input.caption === "string" ? input.caption.trim().slice(0, 500) : row.caption;
  const content = typeof input.content === "string" ? input.content.trim().slice(0, 700) : row.content;
  if (row.mediaType === "text" && !caption && !content) {
    return NextResponse.json({ error: "Isi status tidak boleh kosong." }, { status: 400 });
  }

  const [updated] = await db
    .update(characterStatuses)
    .set({ caption, content })
    .where(eq(characterStatuses.id, id))
    .returning();
  return NextResponse.json({ status: updated });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // tandai sudah dilihat (dipanggil saat viewer buka)
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  const { id } = await ctx.params;
  const [exists] = await db.select({ id: characterStatuses.id }).from(characterStatuses).where(eq(characterStatuses.id, id)).limit(1);
  if (!exists) return NextResponse.json({ error: "Status tidak ditemukan." }, { status: 404 });
  await db.insert(statusViews).values({ statusId: id, userId: user.id }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
