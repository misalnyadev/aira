import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { customAccentPalette, customAccentText, parseCustomTheme } from '../src/lib/customTheme.ts';
import { THEME_INIT_SCRIPT } from '../src/lib/theme.ts';

function luminance(hex) {
  const values = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
test('custom settings validate untrusted saved data', () => {
  assert.deepEqual(parseCustomTheme('{bad'), { base: 'light', accent: '#ad3ebf' });
  assert.deepEqual(parseCustomTheme('{"base":"dark","accent":"red"}'), { base: 'light', accent: '#ad3ebf' });
  assert.deepEqual(parseCustomTheme('{"base":"dark","accent":"#FF00AA"}'), { base: 'dark', accent: '#ff00aa' });
});
test('custom button text and hover retain at least 4.5 contrast', () => {
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const hex = '#' + [r,g,b].map((c) => c.toString(16).padStart(2, '0')).join('');
    const p = customAccentPalette(hex);
    assert.ok(contrast(p.brand, p.ink) >= 4.5, hex);
    assert.ok(contrast(p.hover, p.ink) >= 4.5, hex + ' hover');
  }
});
test('accent text remains readable on normal and softly tinted surfaces', () => {
  const toHex = (rgb) => '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('');
  for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
    const accent = toHex([r, g, b]);
    for (const base of ['light', 'dark']) {
      const text = customAccentText(accent, base);
      for (const surface of base === 'light' ? [255, 250] : [0, 23]) {
        const plain = toHex([surface, surface, surface]);
        const tinted = toHex([r, g, b].map((channel) => Math.round(channel * 0.2 + surface * 0.8)));
        assert.ok(contrast(text, plain) >= 4.5, `${accent} ${base} plain`);
        assert.ok(contrast(text, tinted) >= 4.5, `${accent} ${base} tinted`);
      }
    }
  }
});
test('initial script applies custom palette and dark base before render', () => {
  const values = { 'aisherly-theme': 'custom', 'aisherly-custom-theme': JSON.stringify({ base: 'dark', accent: '#ff00aa' }) };
  const styles = {};
  const classes = [];
  const root = { classList: { add: (name) => classes.push(name) }, style: { setProperty: (k, v) => { styles[k] = v; } } };
  const document = { documentElement: root, querySelectorAll: () => [] };
  vm.runInNewContext(THEME_INIT_SCRIPT, { document, navigator: {}, localStorage: { getItem: (k) => values[k] }, window: { matchMedia: () => ({ matches: false }) } });
  assert.ok(classes.includes('dark'));
  const palette = customAccentPalette('#ff00aa');
  assert.equal(styles['--accent'], palette.brand);
  assert.equal(styles['--accent-text'], customAccentText('#ff00aa', 'dark'));
  assert.equal(styles['--brand'], palette.brand);
  assert.equal(styles['--brand-ink'], palette.ink);
  assert.equal(styles['--brand-strong'], palette.hover);
});

test('initial and runtime accent text agree for light and dark presets', () => {
  for (const base of ['light', 'dark']) for (const accent of ['#000000', '#ffffff', '#ff00aa', '#00c070', '#4687fe']) {
    const styles = {};
    const root = { classList: { add() {} }, style: { setProperty: (key, value) => { styles[key] = value; } } };
    const values = { 'aisherly-theme': 'custom', 'aisherly-custom-theme': JSON.stringify({ base, accent }) };
    vm.runInNewContext(THEME_INIT_SCRIPT, { document: { documentElement: root, querySelectorAll: () => [] }, navigator: {}, localStorage: { getItem: (key) => values[key] }, window: { matchMedia: () => ({ matches: false }) } });
    assert.equal(styles['--accent-text'], customAccentText(accent, base), `${base} ${accent}`);
  }
});

test('switching modes persists custom settings and clears overrides', async () => {
  const { setTheme, setCustomTheme, getIsDarkSnapshot } = await import('../src/lib/theme.ts');
  const saved = new Map();
  const props = new Map();
  const handlers = {};
  globalThis.localStorage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) };
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener: (event, handler) => { handlers[event] = handler; } };
  globalThis.document = { documentElement: { classList: { toggle() {} }, style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) } }, querySelectorAll: () => [] };
  try {
    setCustomTheme({ base: 'dark', accent: '#ff00aa' });
    setTheme('custom');
    assert.equal(getIsDarkSnapshot(), true);
    assert.equal(props.get('--brand'), '#ff00aa');
    assert.equal(props.get('--accent'), '#ff00aa');
    assert.equal(props.get('--accent-text'), customAccentText('#ff00aa', 'dark'));
    assert.equal(saved.get('aisherly-theme'), 'custom');
    setTheme('light');
    assert.equal(getIsDarkSnapshot(), false);
    assert.equal(props.has('--brand'), false);
    assert.equal(props.has('--accent'), false);
    assert.equal(props.has('--accent-text'), false);
    setTheme('custom');
    assert.equal(props.get('--brand'), '#ff00aa');
    handlers.storage({ key: 'aisherly-custom-theme', newValue: '{invalid' });
    assert.equal(props.get('--brand'), '#ad3ebf');
    assert.equal(getIsDarkSnapshot(), false);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.window;
    delete globalThis.document;
  }
});
