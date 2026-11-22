import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { findOwnedCharacter } from "@/lib/owned";
import { verifySignature } from "@/lib/akTalentLink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Putus tautan AK Talent. Dua jalur:
 * - pemilik (sesi login): ?characterId=...
 * - server AK Talent (bertanda tangan): header X-Link-Id, X-Timestamp, X-Nonce, X-Signature
 */
export async function DELETE(request: Request) {
  await ensureDb();
  const linkId = request.headers.get("x-link-id");
  if (linkId) {
    const body = await request.text();
    const r = await db.execute(sql`SELECT secret FROM character_links WHERE id = ${linkId} AND status = 'active'`);
    const row = r.rows[0] as { secret: string } | undefined;
    const path = new URL(request.url).pathname;
    const nonce = request.headers.get("x-nonce");
    const ok = !!row && verifySignature(row.secret, { method: "DELETE", path, body, ts: request.headers.get("x-timestamp"), nonce, sig: request.headers.get("x-signature") });
    if (!ok) return NextResponse.json({ error: "Tanda tangan tidak valid." }, { status: 401 });
    const seen = await db.execute(sql`INSERT INTO character_link_nonces (nonce) VALUES (${linkId + ":" + nonce}) ON CONFLICT DO NOTHING RETURNING nonce`);
    if (!seen.rows.length) return NextResponse.json({ error: "Permintaan sudah pernah diproses." }, { status: 409 });
    await db.execute(sql`UPDATE character_links SET status = 'revoked', secret = '' WHERE id = ${linkId}`);
    return NextResponse.json({ ok: true });
  }
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." }, { status: 401 });
  const characterId = String(new URL(request.url).searchParams.get("characterId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(characterId) || !(await findOwnedCharacter(characterId, user.id)))
    return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  await db.execute(sql`UPDATE character_links SET status = 'revoked', secret = '' WHERE character_id = ${characterId} AND status = 'active'`);
  return NextResponse.json({ ok: true });
}
