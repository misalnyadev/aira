import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLinkCode, normalizeLinkCode, LINK_CODE_RE, newLinkSecret, signRequest, verifySignature } from '../src/lib/akTalentLink.ts';

test('kode tautan: format LINK- + 8 karakter alfabet PIN, unik, dinormalkan', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) { const c = generateLinkCode(); assert.match(c, LINK_CODE_RE); seen.add(c); }
  assert.ok(seen.size > 190);
  assert.equal(normalizeLinkCode(' link-abcd 2345 '), 'LINK-ABCD2345');
  assert.ok(!LINK_CODE_RE.test('LINK-ABCD234I')); assert.ok(!LINK_CODE_RE.test('LINK-ABCD23'));
  assert.ok(newLinkSecret().length >= 40);
});

test('tanda tangan: cocok, menolak badan/path/metode berubah, waktu lewat, tanda tangan rusak', () => {
  const secret = 'rahasia-tes-rahasia-tes-rahasia', body = JSON.stringify({ linkId: 'lk1' }), ts = 1_700_000_000, nonce = 'abcdef0123456789';
  const sig = signRequest(secret, 'DELETE', '/api/integrations/aktalent/link', body, ts, nonce);
  const ok = (o = {}) => verifySignature(secret, { method: 'DELETE', path: '/api/integrations/aktalent/link', body, ts: String(ts), nonce, sig, ...o }, ts + 10);
  assert.equal(ok(), true);
  assert.equal(ok({ body: '{}' }), false);
  assert.equal(ok({ path: '/x' }), false);
  assert.equal(ok({ method: 'POST' }), false);
  assert.equal(ok({ sig: 'zz' }), false);
  assert.equal(ok({ sig: null }), false);
  assert.equal(ok({ nonce: 'x' }), false);
  assert.equal(verifySignature(secret, { method: 'DELETE', path: '/api/integrations/aktalent/link', body, ts: String(ts), nonce, sig }, ts + 301), false);
  assert.equal(verifySignature('lain', { method: 'DELETE', path: '/api/integrations/aktalent/link', body, ts: String(ts), nonce, sig }, ts + 1), false);
});

test('kontrak: tanda tangan HeyTalent identik dengan sisi AK Talent', async () => {
  let ak;
  try { ak = await import('/home/claude/aktalent/api/_lib/heytalent.js'); } catch { return; }   // sisi AK tidak tersedia di lingkungan lain
  const h = ak.signRequest('s'.repeat(40), 'DELETE', '/api/integrations/aktalent/link', '{"a":1}', 1_700_000_000, 'n1n1n1n1n1n1');
  assert.equal(h['X-Signature'], signRequest('s'.repeat(40), 'DELETE', '/api/integrations/aktalent/link', '{"a":1}', 1_700_000_000, 'n1n1n1n1n1n1'));
});

test('panduan AK Talent: skema, akPubId, versi, dan panjang diperiksa', async () => {
  const { parseGuide } = await import('../src/lib/akTalentLink.ts');
  const base = { schema: 'ak-guide/1', akPubId: 'p1', version: 2, text: 'Aturan draf proyek. '.repeat(10) };
  assert.equal(parseGuide(base, 'p1').version, 2);
  assert.equal(parseGuide(base, 'lain'), null);
  assert.equal(parseGuide({ ...base, schema: 'x' }, 'p1'), null);
  assert.equal(parseGuide({ ...base, version: 0 }, 'p1'), null);
  assert.equal(parseGuide({ ...base, text: 'pendek' }, 'p1'), null);
  assert.equal(parseGuide({ ...base, text: 'a'.repeat(9000) }, 'p1').text.length, 6000);
});

test('paket peran: hanya bagian komunikasi, tanpa hubungan pemilik dan catatan tim', async () => {
  const { buildRolePackage } = await import('../src/lib/akTalentLink.ts');
  const row = { name: 'Musthzen', shortBio: 'x'.repeat(300), personality: 'Karismatik', greeting: 'Yo kawan', teamRole: 'Lead', skillPortfolio: JSON.stringify([{ title: 'IT', description: 'bantu' }, { title: '', description: 'tanpa judul' }]), bible: 'BIBLE', ownerRelationship: 'RAHASIA', sharedTeamMemory: 'TIM', pin: 'K7M2QZ' };
  const p = buildRolePackage('pub1', 4, row);
  assert.equal(p.schema, 'ht-role-package/1'); assert.equal(p.akPubId, 'pub1'); assert.equal(p.pin, 'K7M2QZ'); assert.equal(p.version, 4);
  assert.equal(p.character.shortBio.length, 120); assert.equal(p.character.skillPortfolio.length, 1); assert.equal(p.character.bible, 'BIBLE');
  assert.ok(!JSON.stringify(p).includes('RAHASIA') && !JSON.stringify(p).includes('TIM'));
  assert.equal(buildRolePackage('p', 1, { ...row, skillPortfolio: 'rusak' }).character.skillPortfolio.length, 0);
});
