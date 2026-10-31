import { NextResponse } from "next/server";
import { toUserFacingError } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import {
  NO_PROVIDER_ERROR,
  loadUserChatSettings,
  pickProviderCandidates,
  refreshCharacterMemory,
} from "@/lib/chatEngine";
import { ensureDb } from "@/lib/dbReady";
import { findOwnedCharacter } from "@/lib/owned";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Rangkum percakapan karakter menjadi Buku Ingatan Jangka Panjang sekarang juga
 * (dipicu dari tombol "Rangkum dari chat" di Profil Karakter).
 */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDb();

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Kamu belum masuk." }, { status: 401 });
  }

  const { id } = await context.params;
  const character = await findOwnedCharacter(id, user.id);
  if (!character) {
    return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  }

  const { autoFallback } = await loadUserChatSettings(user.id);
  const candidates = await pickProviderCandidates(user.id, character.providerId, autoFallback);
  if (!candidates.length) {
    return NextResponse.json({ error: NO_PROVIDER_ERROR }, { status: 412 });
  }

  try {
    const res = await refreshCharacterMemory({
      userId: user.id,
      character,
      candidates,
      forceAll: true,
    });

    if (!res.updated && res.summarizedCount === 0) {
      return NextResponse.json(
        { error: "Belum ada obrolan di ruang chat untuk dirangkum." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      memoryEnabled: true,
      memorySummary: res.memorySummary,
      memoryUpdatedAt: res.memoryUpdatedAt ? res.memoryUpdatedAt.toISOString() : null,
      summarizedCount: res.summarizedCount,
    });
  } catch (err) {
    return NextResponse.json({ error: toUserFacingError(err) }, { status: 502 });
  }
}
