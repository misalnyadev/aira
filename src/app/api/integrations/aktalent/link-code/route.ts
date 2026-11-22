import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { findOwnedCharacter } from "@/lib/owned";
import { LINK_CODE_TTL_MS, generateLinkCode } from "@/lib/akTalentLink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Pemilik karakter membuat kode tautan sekali pakai (berlaku 15 menit) untuk ditempel di AK Talent. */
export async function POST(request: Request) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { characterId?: string } | null;
  const characterId = String(body?.characterId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(characterId)) return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  const character = await findOwnedCharacter(characterId, user.id);
  if (!character) return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  const linked = await db.execute(sql`SELECT 1 FROM character_links WHERE character_id = ${characterId} AND status = 'active' LIMIT 1`);
  if (linked.rows.length) return NextResponse.json({ error: "Karakter ini sudah tertaut ke AK Talent. Putuskan dulu bila ingin menautkan ulang." }, { status: 409 });
  // Kode lama yang belum terpakai untuk karakter ini dibatalkan; satu kode aktif per karakter.
  await db.execute(sql`DELETE FROM character_link_codes WHERE character_id = ${characterId} OR expires_at < now()`);
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  for (let i = 0; i < 5; i++) {
    const code = generateLinkCode();
    try {
      await db.execute(sql`INSERT INTO character_link_codes (code, character_id, owner_user_id, expires_at) VALUES (${code}, ${characterId}, ${user.id}, ${expiresAt.toISOString()})`);
      return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
    } catch { /* kode kebetulan kembar, ulangi */ }
  }
  return NextResponse.json({ error: "Gagal membuat kode. Coba lagi." }, { status: 500 });
}
