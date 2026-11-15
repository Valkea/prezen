import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, CORE, plain } from './load.mjs';

const PZ = load([...CORE, 'src/js/player.js', 'src/js/editor/sample.js']);

test('the welcome deck is valid and survives normalisation unchanged', () => {
  const d = PZ.sampleDoc();
  assert.ok(d.slides.length >= 4);
  assert.deepEqual(plain(PZ.normalizeDoc(plain(d))), plain(d));
});

test('share links round-trip the whole presentation', async () => {
  const d = PZ.sampleDoc();
  const packed = await PZ.encodeDoc(d);
  assert.match(packed, /^z[A-Za-z0-9_-]+$/);
  const back = await PZ.decodeDoc(packed);
  assert.deepEqual(plain(back), plain(PZ.normalizeDoc(plain(d))));
  assert.ok(packed.length < JSON.stringify(d).length / 3, 'compressed');
});

test('password-protected links are encrypted and need the password', async () => {
  const d = PZ.sampleDoc();
  d.password = 'correct horse';
  const packed = await PZ.encodeDoc(d);
  assert.ok(PZ.isLocked(packed));
  assert.match(packed, /^e[A-Za-z0-9_-]+$/);
  await assert.rejects(PZ.unpackJson(packed), /Unknown link format/);
  await assert.rejects(PZ.decodeDoc(packed, { password: 'wrong' }), (e) => e.wrongPassword === true);
  const back = await PZ.decodeDoc(packed, { password: 'correct horse' });
  assert.equal(back.password, 'correct horse');
  assert.deepEqual(plain(back), plain(PZ.normalizeDoc(plain(d))));
  assert.notEqual(await PZ.encodeDoc(d), packed, 'fresh salt and iv each time');
});

test('documents without a password stay open', async () => {
  const d = PZ.newDoc();
  assert.equal(PZ.normalizeDoc(plain(d)).password, undefined);
  assert.equal(PZ.normalizeDoc(Object.assign(plain(d), { password: 42 })).password, undefined);
  assert.equal(PZ.isLocked(await PZ.encodeDoc(d)), false);
});

test('false values survive links (inTop:false, autoH:false)', async () => {
  const d = PZ.newDoc();
  d.slides[0].els[0].autoH = false;
  d.effects.x1 = { id: 'x1', name: 'Mine', kind: 'transition', inTop: false, in: [{ opacity: 0 }, {}], out: [] };
  const back = await PZ.decodeDoc(await PZ.encodeDoc(d));
  assert.equal(back.slides[0].els[0].autoH, false);
  assert.equal(back.effects.x1.inTop, false);
});

test('untrusted documents are cleaned', () => {
  const d = PZ.normalizeDoc({
    v: 1, title: 42, w: 1e9, h: -5,
    slides: [{ els: [
      { type: 'script', x: 1 },
      { type: 'text', html: '<b>hi</b>', link: 'javascript:alert(1)', x: 'oops', opacity: 9, style: { color: 'red;background:url(x)', font: '"><script>' } },
      { type: 'image', src: 'images/a.png', fit: 'weird', filters: { brightness: 9999 } },
    ] }, null],
    assets: { good: 'data:image/png;base64,iVBORw0KGgo=', bad: 'data:text/html;base64,PHNjcmlwdD4=', 'bad id!': 'data:image/png;base64,AA==' },
    effects: { e1: { id: 'e1', kind: 'in', frames: [{ opacity: 0, clip: 'url(javascript:x)' }, { x: 'a' }] }, e2: { id: '../x', kind: 'in' } },
  });
  assert.equal(d.title, 'Untitled presentation');
  assert.equal(d.w, 8000); assert.equal(d.h, 100);
  assert.equal(d.slides.length, 1);
  const [t, img] = d.slides[0].els;
  assert.equal(d.slides[0].els.length, 2);
  assert.equal(t.link, '');
  assert.equal(t.x, 0);
  assert.equal(t.opacity, 1);
  assert.equal(t.style.color, '#1d2433');
  assert.equal(t.style.font, 'Inter');
  assert.equal(img.fit, 'cover');
  assert.equal(img.filters.brightness, 300);
  assert.deepEqual(Object.keys(d.assets), ['good']);
  assert.deepEqual(Object.keys(d.effects), ['e1']);
  assert.deepEqual(plain(d.effects.e1.frames), [{ opacity: 0 }, {}]);
});

test('new documents: size presets and custom sizes', () => {
  assert.deepEqual([PZ.newDoc().w, PZ.newDoc().h], [1920, 1080]);
  const p = PZ.newDoc({ aspect: '4:3' });
  assert.deepEqual([p.w, p.h], [1440, 1080]);
  const c = PZ.newDoc({ w: 1200.4, h: 628 });
  assert.deepEqual([c.w, c.h], [1200, 628]);
  const big = PZ.newDoc({ w: 99999, h: 5 });
  assert.deepEqual([big.w, big.h], [8000, 100]);
  const bad = PZ.newDoc({ aspect: '4:3', w: NaN, h: -1 });
  assert.deepEqual([bad.w, bad.h], [1440, 1080]);
  assert.deepEqual(plain(PZ.normalizeDoc(plain(c))).w, 1200);
});

test('safe links', () => {
  assert.equal(PZ.safeLink('https://a.b/c'), 'https://a.b/c');
  assert.equal(PZ.safeLink('#3'), '#3');
  assert.equal(PZ.safeLink('mailto:a@b.c'), 'mailto:a@b.c');
  assert.equal(PZ.safeLink('javascript:alert(1)'), '');
  assert.equal(PZ.safeLink('data:text/html,x'), '');
  assert.equal(PZ.safeLink('https://a.b/" onclick="x'), '');
});

test('image sources: Drive, S3, Dropbox, GitHub, relative, unsafe', () => {
  const r = (u) => PZ.resolveSrc(u).src;
  assert.equal(r('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing'), 'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOp=w2400');
  assert.equal(r('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp'), 'https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOp=w2400');
  assert.equal(PZ.resolveSrc('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view').fallbacks.length, 2);
  assert.equal(r('s3://my-bucket/photos/a b.jpg'), 'https://my-bucket.s3.amazonaws.com/photos/a%20b.jpg');
  assert.equal(r('gs://bkt/x.png'), 'https://storage.googleapis.com/bkt/x.png');
  assert.equal(r('https://www.dropbox.com/s/abc/pic.jpg?dl=0'), 'https://www.dropbox.com/s/abc/pic.jpg?raw=1');
  assert.equal(r('https://github.com/u/r/blob/main/img/a.png'), 'https://raw.githubusercontent.com/u/r/main/img/a.png');
  assert.equal(r('images/photo.jpg'), 'images/photo.jpg');
  assert.equal(r('javascript:alert(1)'), '');
  assert.equal(r('data:text/html,<b>'), '');
  assert.equal(PZ.srcKind('https://bucket.s3.eu-west-3.amazonaws.com/a.png'), 's3');
  assert.equal(PZ.srcKind('../pics/a.png'), 'relative');
  const doc = { assets: { a1: 'data:image/png;base64,AA==' } };
  assert.equal(PZ.resolveSrc('asset:a1', doc).src, 'data:image/png;base64,AA==');
});

test('assets are deduplicated and garbage-collected', () => {
  const d = PZ.newDoc();
  const ref1 = PZ.addAsset(d, 'data:image/png;base64,AAAA');
  const ref2 = PZ.addAsset(d, 'data:image/png;base64,AAAA');
  assert.equal(ref1, ref2);
  PZ.addAsset(d, 'data:image/png;base64,BBBB');
  d.slides[0].els.push(PZ.make.image(d, { src: ref1 }));
  PZ.gcAssets(d);
  assert.deepEqual(Object.keys(d.assets), [ref1.slice(6)]);
});

test('keyframes: percent of slide → px, clips carried over, blur only when used', () => {
  const k = PZ.toKeyframes([{ x: 50, opacity: 0, clip: 'inset(0% 0% 0% 100%)' }, { offset: 0.5 }, { y: -10 }], 1920, 1080);
  assert.equal(k.length, 3);
  assert.match(k[0].transform, /^translate\(960px, 0px\)/);
  assert.match(k[2].transform, /translate\(0px, -108px\)/);
  assert.equal(k[1].clipPath, 'inset(0% 0% 0% 100%)');
  assert.equal(k[1].offset, 0.5);
  assert.equal(k[0].filter, undefined);
  assert.equal(PZ.toKeyframes([{ blur: 4 }], 100, 100)[1].filter, 'blur(0px)');
});

test('every built-in effect produces valid keyframes', () => {
  for (const fx of Object.values(PZ.EFFECTS)) {
    const lists = fx.kind === 'transition' ? [fx.in, fx.out] : [fx.frames];
    for (const l of lists) {
      const kf = PZ.toKeyframes(l, 1920, 1080);
      const kinds = new Set(kf.filter((x) => x.clipPath).map((x) => x.clipPath.split('(')[0]));
      assert.ok(kinds.size <= 1, fx.id + ' mixes clip-path kinds');
      if (kf.some((x) => x.clipPath)) assert.ok(kf.every((x) => x.clipPath), fx.id + ' has keyframes without clip');
    }
  }
});

test('easing presets and validation', () => {
  assert.equal(PZ.easing('smooth'), 'cubic-bezier(.65,0,.35,1)');
  assert.equal(PZ.easing('cubic-bezier(0.1, 0.2, 0.3, 1.5)'), 'cubic-bezier(0.1, 0.2, 0.3, 1.5)');
  assert.equal(PZ.easing('steps(4, end)'), 'steps(4, end)');
  assert.equal(PZ.easing('evil()'), 'cubic-bezier(.65,0,.35,1)');
});

test('animation steps: click / with / after', () => {
  const d = PZ.newDoc();
  const mk = (effect, trigger, order, extra) => PZ.make.text(d, { anim: Object.assign({ effect, trigger, order, delay: 0, duration: 500 }, extra) });
  const s = d.slides[0];
  s.els = [mk('fade-in', 'with', 1), mk('rise', 'after', 2), mk('pop', 'click', 3), mk('fade-out', 'with', 4, { delay: 100 }), mk('pulse', 'after', 5), PZ.make.text(d, {})];
  const steps = PZ.buildSteps(d, s);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].auto, true);
  assert.deepEqual(plain(steps[0].items.map((i) => i.start)), [0, 500]);
  assert.equal(steps[1].auto, false);
  assert.deepEqual(plain(steps[1].items.map((i) => [i.kind, i.start])), [['in', 0], ['out', 100], ['emph', 600]]);
});
