import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireUser } from "@/lib/auth";
import { toUserFacingError } from "@/lib/ai";
import {
  NO_PROVIDER_ERROR,
  generateAkTalentDraft,
  loadUserChatSettings,
  normalizeAkTalentDraft,
  pickProviderCandidates,
} from "@/lib/chatEngine";
import { ensureDb } from "@/lib/dbReady";
import { findOwnedCharacter } from "@/lib/owned";
import { DEFAULT_AK_BASE, signRequest } from "@/lib/akTalentLink";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Draf proyek untuk AK Talent.
 * action "generate": model menyusun usulan dari obrolan (tidak dikirim ke mana pun).
 * action "send": pemilik mengirim draf yang sudah ia periksa; di AK Talent masuk ke Pesanan dan menunggu keputusan pemilik di sana.
 */
export async function POST(request: Request) {
  await ensureDb();
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Kamu belum masuk. Muat ulang halaman lalu masuk lagi." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { characterId?: string; action?: string; brief?: unknown } | null;
  const characterId = String(body?.characterId ?? "");
  const character = /^[0-9a-f-]{36}$/i.test(characterId) ? await findOwnedCharacter(characterId, user.id) : null;
  if (!character) return NextResponse.json({ error: "Karakter tidak ditemukan." }, { status: 404 });
  const r = await db.execute(sql`SELECT id, secret, ak_pub_id, ak_base, ak_guide FROM character_links WHERE character_id = ${characterId} AND status = 'active' LIMIT 1`);
  const link = r.rows[0] as { id: string; secret: string; ak_pub_id: string; ak_base: string | null; ak_guide: string | null } | undefined;
  if (!link) return NextResponse.json({ error: "Karakter belum tertaut ke AK Talent." }, { status: 409 });

  if (body?.action === "generate") {
    const { autoFallback } = await loadUserChatSettings(user.id);
    const candidates = await pickProviderCandidates(user.id, character.providerId, autoFallback);
    if (!candidates.length) return NextResponse.json({ error: NO_PROVIDER_ERROR }, { status: 412 });
    try {
      const draft = await generateAkTalentDraft({ userId: user.id, character, candidates, guide: link.ak_guide ?? "" });
      return NextResponse.json({ draft });
    } catch (err) {
      return NextResponse.json({ error: toUserFacingError(err) }, { status: 502 });
    }
  }

  if (body?.action === "send") {
    const brief = normalizeAkTalentDraft(body.brief);
    if (!brief.title || !brief.summary) return NextResponse.json({ error: "Judul dan ringkasan wajib diisi." }, { status: 400 });
    const payload = {
      schema: "ht-call-order/1",
      callId: crypto.randomUUID(),
      akPubId: link.ak_pub_id,
      type: "chat",
      occurredAt: new Date().toISOString(),
      from: { displayName: String((user as { displayName?: string }).displayName ?? "").slice(0, 60) },
      brief,
    };
    const bodyStr = JSON.stringify(payload);
    const path = "/api/public";
    const ts = Math.floor(Date.now() / 1000), nonce = crypto.randomBytes(16).toString("hex");
    const base = (link.ak_base || DEFAULT_AK_BASE).replace(/\/+$/, "");
    let res: Response;
    try {
      res = await fetch(base + path + "?kind=heytalent", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8", "X-Link-Id": link.id, "X-Timestamp": String(ts), "X-Nonce": nonce, "X-Signature": signRequest(link.secret, "POST", path, bodyStr, ts, nonce) },
        body: bodyStr,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return NextResponse.json({ error: "AK Talent tidak dapat dihubungi. Coba lagi sebentar lagi." }, { status: 502 });
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 401 || res.status === 404) return NextResponse.json({ error: "AK Talent menolak tautan ini. Putuskan lalu tautkan ulang." }, { status: 409 });
    if (res.status === 429) return NextResponse.json({ error: String(data.error ?? "Batas draf harian tercapai.") }, { status: 429 });
    if (!res.ok) return NextResponse.json({ error: `AK Talent menolak draf: ${String(data.error ?? res.status).slice(0, 120)}` }, { status: 502 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
}
