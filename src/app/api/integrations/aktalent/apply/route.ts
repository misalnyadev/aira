import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { findOwnedCharacter } from "@/lib/owned";
import type { AkCommPackage } from "@/lib/akTalentLink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Pemilik menerapkan paket AK Talent yang sudah diterima ke karakter (menimpa Bible, kepribadian, bio, dan peran bila terisi di paket). */
export async function POST(request: Request) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { characterId?: string } | null;
  const characterId = String(body?.characterId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(characterId) || !(await findOwnedCharacter(characterId, user.id)))
    return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  const r = await db.execute(sql`SELECT id, package, applied_version FROM character_links WHERE character_id = ${characterId} AND status = 'active' LIMIT 1`);
  const link = r.rows[0] as { id: string; package: string | null; applied_version: number } | undefined;
  if (!link || !link.package) return NextResponse.json({ error: "Belum ada paket dari AK Talent." }, { status: 404 });
  let pkg: AkCommPackage;
  try { pkg = JSON.parse(link.package) as AkCommPackage; } catch { return NextResponse.json({ error: "Paket rusak. Kirim ulang dari AK Talent." }, { status: 422 }); }
  const c = pkg.character;
  const patch: Partial<typeof characters.$inferInsert> = {};
  if (c.personality) patch.personality = c.personality;
  if (c.bible) patch.bible = c.bible;
  if (c.shortBio) patch.shortBio = c.shortBio;
  if (c.teamRole) patch.teamRole = c.teamRole;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Paket kosong." }, { status: 422 });
  await db.update(characters).set(patch).where(eq(characters.id, characterId));
  await db.execute(sql`UPDATE character_links SET package_applied_version = ${pkg.version} WHERE id = ${link.id}`);
  return NextResponse.json({ ok: true, version: pkg.version, applied: Object.keys(patch) });
}
