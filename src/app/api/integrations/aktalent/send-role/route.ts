import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { characters } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureDb } from "@/lib/dbReady";
import { findOwnedCharacter } from "@/lib/owned";
import { DEFAULT_AK_BASE, buildRolePackage, signRequest } from "@/lib/akTalentLink";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Pemilik mengirim hasil pelatihan komunikasi (Bible peran) ke AK Talent.
 * Di AK Talent paket itu menunggu; pemilik yang menerapkannya di sana. Karakter di HeyTalent tidak berubah.
 */
export async function POST(request: Request) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { characterId?: string } | null;
  const characterId = String(body?.characterId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(characterId) || !(await findOwnedCharacter(characterId, user.id)))
    return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  const r = await db.execute(sql`SELECT id, secret, ak_pub_id, ak_base, role_sent_version FROM character_links WHERE character_id = ${characterId} AND status = 'active' LIMIT 1`);
  const link = r.rows[0] as { id: string; secret: string; ak_pub_id: string; ak_base: string | null; role_sent_version: number } | undefined;
  if (!link) return NextResponse.json({ error: "Karakter belum tertaut ke AK Talent." }, { status: 409 });
  const [c] = await db.select().from(characters).where(eq(characters.id, characterId)).limit(1);
  if (!c) return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  const version = link.role_sent_version + 1;
  const pkg = buildRolePackage(link.ak_pub_id, version, {
    name: c.name, shortBio: c.shortBio, personality: c.personality, greeting: c.greeting,
    teamRole: c.teamRole, skillPortfolio: c.skillPortfolio, bible: c.bible,
  });
  if (!pkg.character.bible && !pkg.character.personality)
    return NextResponse.json({ error: "Bible dan kepribadian karakter masih kosong." }, { status: 422 });
  const bodyStr = JSON.stringify(pkg);
  const path = "/api/public";
  const ts = Math.floor(Date.now() / 1000), nonce = crypto.randomBytes(16).toString("hex");
  const base = (link.ak_base || DEFAULT_AK_BASE).replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetch(base + path + "?kind=heytalent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Link-Id": link.id, "X-Timestamp": String(ts), "X-Nonce": nonce, "X-Signature": signRequest(link.secret, "POST", path, bodyStr, ts, nonce) },
      body: bodyStr,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return NextResponse.json({ error: "AK Talent tidak dapat dihubungi. Coba lagi sebentar lagi." }, { status: 502 });
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; version?: number };
  if (res.status === 401 || res.status === 404) return NextResponse.json({ error: "AK Talent menolak tautan ini. Putuskan lalu tautkan ulang." }, { status: 409 });
  if (!res.ok) return NextResponse.json({ error: `AK Talent menolak paket: ${String(data.error ?? res.status).slice(0, 120)}` }, { status: 502 });
  const sent = Math.max(version, Number(data.version) || 0);
  await db.execute(sql`UPDATE character_links SET role_sent_version = ${sent}, last_sync_at = now() WHERE id = ${link.id}`);
  return NextResponse.json({ ok: true, version: sent });
}
