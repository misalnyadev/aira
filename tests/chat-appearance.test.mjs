import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChatBackground, parseChatBackground, chatBackgroundProps } from '../src/lib/chatBackground.ts';
import { normalizeBubbleStyle, bubblePaint, bubbleInk, DEFAULT_BUBBLE_STYLE } from '../src/lib/bubbleStyle.ts';

test('custom solid background validates, round trips, and renders identically in either theme', () => {
  const saved = normalizeChatBackground({ kind: 'color', color: '#Ab12EF' });
  assert.deepEqual(saved, { kind: 'color', color: '#ab12ef' });
  assert.deepEqual(parseChatBackground(JSON.stringify(saved)), saved);
  for (const dark of [false, true]) {
    assert.deepEqual(chatBackgroundProps(saved, dark), { className: '', style: { backgroundColor: '#ab12ef', backgroundImage: 'none' } });
  }
  for (const color of ['red', '#fff', '#123456;foo', null]) {
    assert.deepEqual(normalizeChatBackground({ kind: 'color', color }), { kind: 'default' });
  }
  assert.deepEqual(normalizeChatBackground({ kind: 'animated', id: 'waves' }), { kind: 'animated', id: 'waves' });
  assert.deepEqual(normalizeChatBackground({ kind: 'preset', id: 'sand' }), { kind: 'preset', id: 'sand' });
});

test('custom bubble colors remain independent and transparency is retained', () => {
  const style = normalizeBubbleStyle({ ...DEFAULT_BUBBLE_STYLE, bgColorIn: '#123456', textColorOut: '#ABCDEF', glass: true, opacity: 40 });
  assert.equal(style.textColorIn, null);
  assert.equal(style.bgColorOut, null);
  assert.deepEqual(bubblePaint(style, 'in'), { backgroundColor: 'rgba(18, 52, 86, 0.4)' });
  assert.deepEqual(bubbleInk(style, 'out'), { color: '#abcdef' });
  assert.equal(bubbleInk(style, 'in'), undefined);
  assert.equal(normalizeBubbleStyle({ textColorIn: 'red' }).textColorIn, null);
});
