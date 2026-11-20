import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { load, CORE } from './load.mjs';

const PZ = load([...CORE, 'src/js/player.js', 'src/js/editor/lang-fr.js', 'src/js/editor/sample.js']);
const FILES = [...readdirSync('src/js').filter((f) => f.endsWith('.js')).map((f) => 'src/js/' + f),
  ...readdirSync('src/js/editor').filter((f) => f.endsWith('.js') && !f.startsWith('lang-')).map((f) => 'src/js/editor/' + f)];

const LIT = String.raw`'((?:[^'\\]|\\.)*)'`;
const unescape = (s) => s.replace(/\\(.)/g, '$1');

/** Every English string the interface can show: t()/tn() literals, undo labels, section titles, data names. */
export function englishKeys() {
  const keys = new Set();
  const grab = (re, src) => { for (const m of src.matchAll(re)) m.slice(1).filter(Boolean).forEach((k) => keys.add(unescape(k))); };
  for (const f of FILES) {
    const src = readFileSync(f, 'utf8');
    grab(new RegExp(String.raw`\b(?:PZ\.)?t\(${LIT}`, 'g'), src);
    grab(new RegExp(String.raw`\b(?:PZ\.)?tn\(${LIT},\s*${LIT}`, 'g'), src);
    grab(new RegExp(String.raw`\b(?:E\.commit|E\.update|live|set)\(${LIT}`, 'g'), src);
    grab(new RegExp(String.raw`\binsert\([^;]*?,\s*${LIT}\)`, 'g'), src);
    grab(new RegExp(String.raw`\bui\.section\(${LIT}`, 'g'), src);
    grab(new RegExp(String.raw`E\.commit\(one\.locked \? ${LIT} : ${LIT}`, 'g'), src);
    if (f.endsWith('dialogs.js')) { // shortcut table: [key, description] pairs translated when shown
      const rows = /const rows = \[([\s\S]*?)\n {4}\];/.exec(src)[1];
      grab(new RegExp(LIT, 'g'), rows);
    }
    if (f.endsWith('panels.js')) grab(new RegExp(String.raw`\['[\d% ]+', ${LIT}\]`, 'g'), src); // image focus options
    if (f.endsWith('panels.js')) grab(new RegExp(String.raw`\['(?:left|center|right|justify)', ${LIT}\]`, 'g'), src); // text alignment titles
    if (f.endsWith('panels.js')) grab(new RegExp(String.raw`toggle\('[\w-]+', ${LIT}`, 'g'), src); // bold / italic / underline
    if (f.endsWith('studio.js')) grab(new RegExp(String.raw`rowOf\(${LIT}`, 'g'), src); // keyframe table rows
  }
  const names = [
    ...Object.values(PZ.EFFECTS).map((e) => e.name), ...Object.values(PZ.SHAPES).map((s) => s.name), ...PZ.LAYOUTS.map((l) => l.name),
    ...PZ.ASPECTS.map((a) => a.name), ...PZ.TEXT_STYLES.map((s) => s.name), ...PZ.EASINGS.map((e) => e.name), ...Object.values(PZ.SHADOWS).map((s) => s.name),
    ...Object.values(PZ.FX_KINDS), ...PZ.FRAME_PROPS.map((p) => p.name), ...Object.values(PZ.SCENES).map((s) => s.name), ...Object.values(PZ.SRC_LABELS), ...Object.keys(PZ.ICON_SET),
    ...PZ.FONTS.filter((f) => f.google == null).map((f) => f.name),
  ];
  names.forEach((n) => keys.add(n));
  // not words: keys, numbers, symbols, the brand
  for (const k of keys) if (!/[a-z]{2}/.test(k) || /^(Ctrl|⌘)? ?[A-Z]( \/ [A-Z])*$/.test(k) || /^(mod|Ctrl) /.test(k) || ['PrezEn', 'Google Drive', 'Amazon S3', 'Google Cloud', 'Dropbox', 'PDF'].includes(k)) keys.delete(k);
  return keys;
}

const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');

test('every interface string has a French translation', () => {
  const fr = PZ.strings('fr');
  const missing = [...englishKeys()].filter((k) => !Object.prototype.hasOwnProperty.call(fr, k));
  assert.deepEqual(missing, [], 'add these to src/js/editor/lang-fr.js or src/js/i18n.js');
});

test('French strings keep the same {placeholders}', () => {
  const fr = PZ.strings('fr');
  const wrong = Object.keys(fr).filter((k) => placeholders(k) !== placeholders(fr[k]));
  assert.deepEqual(wrong, []);
});

test('t() fills placeholders and falls back to English', () => {
  PZ.lang = 'fr';
  try {
    assert.equal(PZ.t('Slide {n} / {total}', { n: 2, total: 5 }), 'Diapositive 2 / 5');
    assert.equal(PZ.t('Not in any dictionary {x}', { x: 1 }), 'Not in any dictionary 1');
    assert.equal(PZ.tn('{n} slide', '{n} slides', 0), '0 diapositive');
    assert.equal(PZ.tn('{n} slide', '{n} slides', 3), '3 diapositives');
  } finally { PZ.lang = 'en'; }
  assert.equal(PZ.tn('{n} slide', '{n} slides', 1), '1 slide');
  assert.equal(PZ.tn('{n} slide', '{n} slides', 0), '0 slides');
});

test('language codes are validated', () => {
  assert.equal(PZ.validLang('fr-CA'), 'fr');
  assert.equal(PZ.validLang('EN'), 'en');
  assert.equal(PZ.validLang('de'), null);
  assert.equal(PZ.validLang(undefined), null);
});

test('the welcome deck follows the language', () => {
  PZ.lang = 'fr';
  try {
    const d = PZ.sampleDoc();
    assert.equal(d.title, 'Bienvenue dans PrezEn');
    assert.match(JSON.stringify(d), /À vous de jouer/);
  } finally { PZ.lang = 'en'; }
});
