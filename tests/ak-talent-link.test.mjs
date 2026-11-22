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
