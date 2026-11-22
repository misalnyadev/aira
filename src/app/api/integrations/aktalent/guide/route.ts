import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureDb } from "@/lib/dbReady";
import { parseGuide, verifySignature } from "@/lib/akTalentLink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Dipanggil server AK Talent (bertanda tangan): menyimpan panduan aturan & fitur AK Talent untuk talent yang tertaut. */
export async function POST(request: Request) {
  await ensureDb();
  const linkId = request.headers.get("x-link-id") ?? "";
  const body = await request.text();
  if (!linkId || body.length > 50_000) return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  const r = await db.execute(sql`SELECT secret, ak_pub_id, ak_guide_version FROM character_links WHERE id = ${linkId} AND status = 'active'`);
  const link = r.rows[0] as { secret: string; ak_pub_id: string; ak_guide_version: number } | undefined;
  const nonce = request.headers.get("x-nonce");
  const ok = !!link && verifySignature(link.secret, { method: "POST", path: new URL(request.url).pathname, body, ts: request.headers.get("x-timestamp"), nonce, sig: request.headers.get("x-signature") });
  if (!link || !ok) return NextResponse.json({ error: "Tanda tangan tidak valid." }, { status: 401 });
  const seen = await db.execute(sql`INSERT INTO character_link_nonces (nonce) VALUES (${linkId + ":" + nonce}) ON CONFLICT DO NOTHING RETURNING nonce`);
  if (!seen.rows.length) return NextResponse.json({ error: "Permintaan sudah pernah diproses." }, { status: 409 });
  await db.execute(sql`DELETE FROM character_link_nonces WHERE seen_at < now() - interval '1 hour'`);
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return NextResponse.json({ error: "Format tidak valid." }, { status: 400 }); }
  const guide = parseGuide(parsed, link.ak_pub_id);
  if (!guide) return NextResponse.json({ error: "Panduan tidak valid." }, { status: 400 });
  if (guide.version <= link.ak_guide_version) return NextResponse.json({ ok: true, version: link.ak_guide_version, skipped: true });
  await db.execute(sql`UPDATE character_links SET ak_guide = ${guide.text}, ak_guide_version = ${guide.version}, last_sync_at = now() WHERE id = ${linkId}`);
  return NextResponse.json({ ok: true, version: guide.version });
}
