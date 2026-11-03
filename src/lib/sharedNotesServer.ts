import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { characterContacts, characterNotes } from "@/db/schema";
import { findOwnedCharacter } from "@/lib/owned";
import {
  buildSharedNotesPromptBlock,
  extractAutoNotesFromMessage,
  isDuplicateSharedNote,
  normalizeNoteKind,
  type SharedNoteItem,
} from "@/lib/sharedNotes";

const MAX_ACTIVE_NOTES_PER_SCOPE = 60;

function parseContactThreadId(id: string | null | undefined): string | null {
  if (!id || !id.startsWith("contact:")) return null;
  const raw = id.slice("contact:".length).trim();
  return raw || null;
}

export interface SharedNotesScope {
  characterId: string;
  /** Pemilik ruang papan catatan (owner pada chat pribadi, guest pada ruang kontak 2 arah). */
  scopeUserId: string;
}

export function serializeSharedNoteRow(
  row: typeof characterNotes.$inferSelect
): SharedNoteItem {
  return {
    id: row.id,
    characterId: row.characterId,
    kind: normalizeNoteKind(row.kind, "plan"),
    title: row.title,
    dueDate: row.dueDate ?? null,
    url: row.url ?? null,
    done: Boolean(row.done),
    source: row.source === "auto" ? "auto" : "manual",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Resolusi & otorisasi ruang Papan "Catatan & Janji Kita" baik untuk karakter
 * milik sendiri (`<characterUuid>`) maupun ruang Kontak 2 Arah (`contact:<contactUuid>`).
 */
export async function resolveSharedNotesScope(
  rawTargetId: string,
  viewerUserId: string
): Promise<SharedNotesScope | null> {
  const decoded = decodeURIComponent(rawTargetId || "").trim();
  if (!decoded) return null;

  const contactId = parseContactThreadId(decoded);
  if (contactId) {
    const [contact] = await db
      .select()
      .from(characterContacts)
      .where(eq(characterContacts.id, contactId))
      .limit(1);

    if (!contact) return null;
    const isParticipant =
      contact.guestUserId === viewerUserId ||
      contact.ownerUserId === viewerUserId;
    if (
      !isParticipant ||
      contact.ownerStatus !== "approved" ||
      contact.adminStatus !== "approved"
    ) {
      return null;
    }

    return {
      characterId: contact.characterId,
      scopeUserId: contact.guestUserId,
    };
  }

  const owned = await findOwnedCharacter(decoded, viewerUserId);
  if (!owned) return null;

  return {
    characterId: owned.id,
    scopeUserId: viewerUserId,
  };
}

export async function listSharedNotesForScope(
  scope: SharedNotesScope
): Promise<SharedNoteItem[]> {
  const rows = await db
    .select()
    .from(characterNotes)
    .where(
      and(
        eq(characterNotes.characterId, scope.characterId),
        eq(characterNotes.userId, scope.scopeUserId)
      )
    )
    .orderBy(desc(characterNotes.createdAt))
    .limit(120);

  return rows.map(serializeSharedNoteRow);
}

/**
 * Tangkap otomatis rencana/janji/ide/link dari pesan pengguna ke papan catatan,
 * lalu kembalikan blok konteks siap pakai untuk prompt karakter.
 */
export async function captureAndBuildSharedNotesContext({
  scope,
  userText,
  enableAutoCapture = true,
  now = new Date(),
}: {
  scope: SharedNotesScope;
  userText?: string;
  enableAutoCapture?: boolean;
  now?: Date;
}): Promise<{
  sharedNotesBlock: string;
  capturedNotes: SharedNoteItem[];
  activeCount: number;
}> {
  const existingRows = await db
    .select()
    .from(characterNotes)
    .where(
      and(
        eq(characterNotes.characterId, scope.characterId),
        eq(characterNotes.userId, scope.scopeUserId)
      )
    )
    .orderBy(desc(characterNotes.createdAt))
    .limit(100);

  const existingItems = existingRows.map(serializeSharedNoteRow);
  const activeExisting = existingItems.filter((n) => !n.done);
  const capturedNotes: SharedNoteItem[] = [];

  if (
    enableAutoCapture &&
    userText &&
    activeExisting.length < MAX_ACTIVE_NOTES_PER_SCOPE
  ) {
    const candidates = extractAutoNotesFromMessage(userText, now);
    for (const cand of candidates) {
      const combinedPool = [...existingItems, ...capturedNotes];
      if (isDuplicateSharedNote(cand, combinedPool)) continue;

      const [inserted] = await db
        .insert(characterNotes)
        .values({
          characterId: scope.characterId,
          userId: scope.scopeUserId,
          kind: cand.kind,
          title: cand.title,
          dueDate: cand.dueDate,
          url: cand.url,
          done: false,
          source: "auto",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (inserted) {
        capturedNotes.push(serializeSharedNoteRow(inserted));
      }
    }
  }

  const allCurrent = [...capturedNotes, ...existingItems];
  const activeCount = allCurrent.filter((n) => !n.done).length;
  const sharedNotesBlock = buildSharedNotesPromptBlock(allCurrent, now);

  return {
    sharedNotesBlock,
    capturedNotes,
    activeCount,
  };
}
