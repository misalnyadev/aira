import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterNotes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import {
  normalizeNoteKind,
  sanitizeDueDate,
  sanitizeNoteTitle,
  sanitizeNoteUrl,
} from "@/lib/sharedNotes";
import {
  resolveSharedNotesScope,
  serializeSharedNoteRow,
} from "@/lib/sharedNotesServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH /api/characters/[id]/notes/[noteId]
 * Centang selesai / aktifkan kembali atau ubah detail catatan.
 */
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; noteId: string }> }
) {
  await ensureDb();
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const { id, noteId } = await context.params;
  const scope = await resolveSharedNotesScope(id, user.id);
  if (!scope) {
    return NextResponse.json(
      { error: "Ruang obrolan tidak ditemukan." },
      { status: 404 }
    );
  }

  const [existing] = await db
    .select()
    .from(characterNotes)
    .where(
      and(
        eq(characterNotes.id, noteId),
        eq(characterNotes.characterId, scope.characterId),
        eq(characterNotes.userId, scope.scopeUserId)
      )
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      { error: "Catatan tidak ditemukan." },
      { status: 404 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const nextDone =
    typeof body?.done === "boolean" ? body.done : existing.done;
  const nextTitle =
    body?.title !== undefined
      ? sanitizeNoteTitle(body.title) || existing.title
      : existing.title;
  const nextKind =
    body?.kind !== undefined
      ? normalizeNoteKind(body.kind, normalizeNoteKind(existing.kind))
      : existing.kind;
  const nextDueDate =
    body?.dueDate !== undefined ? sanitizeDueDate(body.dueDate) : existing.dueDate;
  const nextUrl =
    body?.url !== undefined ? sanitizeNoteUrl(body.url) : existing.url;

  const [updated] = await db
    .update(characterNotes)
    .set({
      done: nextDone,
      title: nextTitle,
      kind: nextKind,
      dueDate: nextDueDate,
      url: nextUrl,
      updatedAt: new Date(),
    })
    .where(eq(characterNotes.id, existing.id))
    .returning();

  return NextResponse.json({ note: serializeSharedNoteRow(updated) });
}

/**
 * DELETE /api/characters/[id]/notes/[noteId]
 * Hapus satu catatan dari Papan "Catatan & Janji Kita".
 */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; noteId: string }> }
) {
  await ensureDb();
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const { id, noteId } = await context.params;
  const scope = await resolveSharedNotesScope(id, user.id);
  if (!scope) {
    return NextResponse.json(
      { error: "Ruang obrolan tidak ditemukan." },
      { status: 404 }
    );
  }

  const deleted = await db
    .delete(characterNotes)
    .where(
      and(
        eq(characterNotes.id, noteId),
        eq(characterNotes.characterId, scope.characterId),
        eq(characterNotes.userId, scope.scopeUserId)
      )
    )
    .returning({ id: characterNotes.id });

  if (!deleted.length) {
    return NextResponse.json(
      { error: "Catatan tidak ditemukan." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
