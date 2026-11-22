import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureDb } from "@/lib/dbReady";
import { parseCommPackage, verifySignature } from "@/lib/akTalentLink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Dipanggil server AK Talent (bertanda tangan): menyimpan paket komunikasi terbaru.
 * Paket TIDAK langsung menimpa karakter; pemilik menerapkannya lewat tombol di profil karakter.
 */
export async function POST(request: Request) {
  await ensureDb();
  const linkId = request.headers.get("x-link-id") ?? "";
  const body = await request.text();
  if (!linkId || body.length > 200_000) return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  const r = await db.execute(sql`SELECT secret, ak_pub_id, applied_version FROM character_links WHERE id = ${linkId} AND status = 'active'`);
  const link = r.rows[0] as { secret: string; ak_pub_id: string; applied_version: number } | undefined;
  const nonce = request.headers.get("x-nonce");
  const ok =
    !!link &&
    verifySignature(link.secret, {
      method: "POST",
      path: new URL(request.url).pathname,
      body,
      ts: request.headers.get("x-timestamp"),
      nonce,
      sig: request.headers.get("x-signature"),
    });
  if (!link || !ok) return NextResponse.json({ error: "Tanda tangan tidak valid." }, { status: 401 });
  const seen = await db.execute(sql`INSERT INTO character_link_nonces (nonce) VALUES (${linkId + ":" + nonce}) ON CONFLICT DO NOTHING RETURNING nonce`);
  if (!seen.rows.length) return NextResponse.json({ error: "Permintaan sudah pernah diproses." }, { status: 409 });
  await db.execute(sql`DELETE FROM character_link_nonces WHERE seen_at < now() - interval '1 hour'`);

  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return NextResponse.json({ error: "Format paket tidak valid." }, { status: 400 }); }
  const pkg = parseCommPackage(parsed, link.ak_pub_id);
  if (!pkg) return NextResponse.json({ error: "Paket tidak valid." }, { status: 400 });
  if (pkg.version <= link.applied_version) return NextResponse.json({ ok: true, appliedVersion: link.applied_version, skipped: true });
  await db.execute(sql`UPDATE character_links SET package = ${JSON.stringify(pkg)}, applied_version = ${pkg.version}, last_sync_at = now() WHERE id = ${linkId}`);
  return NextResponse.json({ ok: true, appliedVersion: pkg.version });
}
