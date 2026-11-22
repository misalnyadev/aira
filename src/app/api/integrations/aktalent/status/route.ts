import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { findOwnedCharacter } from "@/lib/owned";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Status tautan AK Talent milik sebuah karakter (rahasia tautan tidak pernah dikirim). */
export async function GET(request: Request) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." }, { status: 401 });
  const characterId = String(new URL(request.url).searchParams.get("characterId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(characterId) || !(await findOwnedCharacter(characterId, user.id)))
    return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  const r = await db.execute(sql`SELECT applied_version, shared, last_sync_at FROM character_links WHERE character_id = ${characterId} AND status = 'active' LIMIT 1`);
  const row = r.rows[0] as { applied_version: number; shared: string; last_sync_at: string | null } | undefined;
  if (!row) return NextResponse.json({ linked: false });
  return NextResponse.json({ linked: true, version: row.applied_version, shared: row.shared.split(",").filter(Boolean), lastSyncAt: row.last_sync_at });
}
