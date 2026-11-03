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
  listSharedNotesForScope,
  resolveSharedNotesScope,
  serializeSharedNoteRow,
} from "@/lib/sharedNotesServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/characters/[id]/notes
 * Ambil daftar Papan "Catatan & Janji Kita" pada ruang chat ini.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const { id } = await context.params;
  const scope = await resolveSharedNotesScope(id, user.id);
  if (!scope) {
    return NextResponse.json(
      { error: "Ruang obrolan tidak ditemukan." },
      { status: 404 }
    );
  }

  const notes = await listSharedNotesForScope(scope);
  return NextResponse.json({ notes });
}

/**
 * POST /api/characters/[id]/notes
 * Tambah item manual ke Papan "Catatan & Janji Kita".
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const { id } = await context.params;
  const scope = await resolveSharedNotesScope(id, user.id);
  if (!scope) {
    return NextResponse.json(
      { error: "Ruang obrolan tidak ditemukan." },
      { status: 404 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const title = sanitizeNoteTitle(body?.title);
  const url = sanitizeNoteUrl(body?.url);
  const dueDate = sanitizeDueDate(body?.dueDate);
  const kind = normalizeNoteKind(
    body?.kind,
    url ? "link" : dueDate ? "promise" : "plan"
  );

  if (!title) {
    return NextResponse.json(
      { error: "Tulis isi catatan atau janji terlebih dahulu." },
      { status: 400 }
    );
  }

  const existing = await db
    .select({ id: characterNotes.id })
    .from(characterNotes)
    .where(
      and(
        eq(characterNotes.characterId, scope.characterId),
        eq(characterNotes.userId, scope.scopeUserId),
        eq(characterNotes.done, false)
      )
    );

  if (existing.length >= 60) {
    return NextResponse.json(
      {
        error:
          "Catatan aktif sudah penuh (maks 60). Centang selesai atau hapus beberapa catatan lama dulu.",
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const [created] = await db
    .insert(characterNotes)
    .values({
      characterId: scope.characterId,
      userId: scope.scopeUserId,
      kind,
      title,
      dueDate,
      url,
      done: false,
      source: "manual",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return NextResponse.json(
    { note: serializeSharedNoteRow(created) },
    { status: 201 }
  );
}
