import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureDb } from "@/lib/dbReady";
import { LINK_CODE_MAX_TRIES, LINK_CODE_RE, newLinkSecret, normalizeLinkCode } from "@/lib/akTalentLink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BAD = { error: "Kode tidak valid atau sudah kedaluwarsa." };

/**
 * Dipanggil server AK Talent: menukar kode sekali pakai dengan tautan.
 * Tanpa tanda tangan; diamankan oleh kode (15 menit, sekali pakai, batas percobaan).
 */
export async function POST(request: Request) {
  await ensureDb();
  const body = (await request.json().catch(() => null)) as { code?: string; akPubId?: string } | null;
  const code = normalizeLinkCode(body?.code);
  const akPubId = String(body?.akPubId ?? "").slice(0, 64);
  if (!LINK_CODE_RE.test(code) || !akPubId) return NextResponse.json(BAD, { status: 400 });

  // Klaim atomik: hanya kode yang belum terpakai, belum kedaluwarsa, dan belum kebanyakan salah.
  const claimed = await db.execute(sql`
    UPDATE character_link_codes SET used = true
    WHERE code = ${code} AND used = false AND expires_at > now() AND tries < ${LINK_CODE_MAX_TRIES}
    RETURNING character_id, owner_user_id`);
  const row = claimed.rows[0] as { character_id: string; owner_user_id: string } | undefined;
  if (!row) {
    await db.execute(sql`UPDATE character_link_codes SET tries = tries + 1 WHERE code = ${code}`);
    return NextResponse.json(BAD, { status: 410 });
  }
  const existing = await db.execute(sql`SELECT 1 FROM character_links WHERE character_id = ${row.character_id} AND status = 'active' LIMIT 1`);
  if (existing.rows.length) return NextResponse.json({ error: "Karakter sudah tertaut." }, { status: 409 });

  const linkId = crypto.randomUUID();
  const secret = newLinkSecret();
  await db.execute(sql`INSERT INTO character_links (id, character_id, owner_user_id, ak_pub_id, secret) VALUES (${linkId}, ${row.character_id}, ${row.owner_user_id}, ${akPubId}, ${secret})`);
  const ch = await db.execute(sql`SELECT invite_pin FROM characters WHERE id = ${row.character_id}`);
  const pin = (ch.rows[0] as { invite_pin: string | null } | undefined)?.invite_pin ?? "";
  return NextResponse.json({ linkId, secret, characterId: row.character_id, pin });
}
