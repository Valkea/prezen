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

test('text styles: new slides use them, links and files keep them', async () => {
  const d = PZ.newDoc();
  assert.deepEqual(plain(Object.keys(d.textStyles)), plain(PZ.TEXT_STYLES.map((s) => s.id)));
  const [title, sub] = d.slides[0].els;
  assert.equal(title.ts, 'title');
  assert.equal(sub.ts, 'subtitle');
  assert.equal(title.style.size, d.textStyles.title.size);
  assert.equal(title.style.align, 'center', 'alignment stays per text');
  assert.equal(PZ.textStyleModified(d, title), false);
  const content = PZ.newSlide(d, 'title-content').els;
  assert.deepEqual(plain(content.map((e) => e.ts)), ['h1', 'body']);
  d.textStyles.h1.color = '#ff0000';
  const back = await PZ.decodeDoc(await PZ.encodeDoc(d));
  assert.equal(back.textStyles.h1.color, '#ff0000');
  assert.equal(back.slides[0].els[0].ts, 'title');
});

test('text styles: changing one updates its texts everywhere, and only them', () => {
  const d = PZ.newDoc();
  d.slides.push(PZ.newSlide(d, 'title-content'), PZ.newSlide(d, 'two-col'));
  const h1s = [d.slides[1].els[0], d.slides[2].els[0]];
  const loose = PZ.make.text(d, { html: 'free', style: { size: d.textStyles.h1.size } }); // same size, not linked
  d.slides[2].els.push(loose);
  PZ.setTextStyle(d, 'h1', { size: 90, color: '#123456', font: 'Poppins' });
  assert.equal(d.textStyles.h1.size, 90);
  assert.equal(d.textStyles.h1.bold, true, 'values not given are kept');
  assert.deepEqual(plain(h1s.map((e) => [e.style.size, e.style.font, e.style.color])), [[90, 'Poppins', '#123456'], [90, 'Poppins', '#123456']]);
  assert.equal(h1s[0].style.align, 'left', 'alignment is not part of a style');
  assert.equal(loose.style.size, 70, 'texts without the style are untouched');
  assert.equal(d.slides[0].els[0].style.size, d.textStyles.title.size, 'other styles are untouched');
  assert.deepEqual(plain(PZ.textStyleUses(d)), { title: 1, subtitle: 1, h1: 2, body: 3 });
  PZ.useTextStyle(d, loose, 'h1');
  assert.equal(loose.style.font, 'Poppins');
  PZ.useTextStyle(d, loose, '');
  assert.equal(loose.ts, undefined);
  assert.equal(loose.style.font, 'Poppins', 'leaving a style keeps the look');
});

test('text styles: texts that do not match their style are unlinked on load', () => {
  const d = PZ.newDoc();
  d.slides[0].els[0].style.color = '#00aa00';
  assert.equal(PZ.textStyleModified(d, d.slides[0].els[0]), true);
  const back = PZ.normalizeDoc(plain(d));
  assert.equal(back.slides[0].els[0].ts, undefined);
  assert.equal(back.slides[0].els[0].style.color, '#00aa00');
  assert.equal(back.slides[0].els[1].ts, 'subtitle');
});

test('text styles: theme changes reach the styles that used the theme', () => {
  const d = PZ.newDoc();
  const old = PZ.clone(d.theme);
  d.textStyles.h2.font = 'Lora';
  d.theme.font = 'Poppins';
  d.theme.color = '#222222';
  PZ.followTheme(d, old);
  assert.equal(d.textStyles.title.font, 'Poppins');
  assert.equal(d.slides[0].els[0].style.font, 'Poppins');
  assert.equal(d.textStyles.h2.font, 'Lora');
  assert.equal(d.textStyles.quote.font, 'Playfair Display');
  assert.equal(d.textStyles.body.color, '#222222');
  assert.equal(d.textStyles.subtitle.color, '#5c6577', 'muted styles keep their colour');
});

test('text styles: untrusted and older files', () => {
  const old = PZ.normalizeDoc({ v: 1, h: 2160, slides: [{ els: [{ type: 'text', html: 'x', ts: 'h9' }, { type: 'shape', ts: 'h1' }] }] });
  assert.equal(old.textStyles.title.size, 216, 'defaults follow the page height');
  assert.equal(old.slides[0].els[0].ts, undefined);
  assert.equal(old.slides[0].els[1].ts, undefined, 'only text boxes are linked');
  const d = PZ.normalizeDoc({ v: 1, textStyles: { title: { size: 5000, color: 'red;x', font: '"><b>', bold: 'yes' }, h1: { italic: true }, evil: { size: 1 } }, slides: [] });
  assert.equal(d.textStyles.title.size, 1000);
  assert.equal(d.textStyles.title.color, '#1d2433');
  assert.equal(d.textStyles.title.font, 'Inter');
  assert.equal(d.textStyles.title.bold, true, 'invalid values fall back to the default');
  assert.equal(d.textStyles.h1.italic, true);
  assert.equal(d.textStyles.h1.bold, true, 'missing values keep the default');
  assert.equal(d.textStyles.evil, undefined);
});

test('style positions: set from a text, forgotten, kept by links, cleaned on load', async () => {
  const d = PZ.newDoc();
  d.slides.push(PZ.newSlide(d, 'title-content'));
  const [h1] = d.slides[1].els;
  assert.equal(PZ.stylePos(d, 'h1'), null);
  assert.equal(PZ.atStylePos(d, h1), false);
  PZ.setStylePos(d, 'h1', h1);
  assert.deepEqual(plain(d.tsPos), { h1: { x: h1.x, y: h1.y, w: h1.w } });
  assert.equal(PZ.atStylePos(d, h1), true);
  h1.y = Math.round(h1.y); // 86.4 from the layout, rounded by a drag
  assert.equal(PZ.atStylePos(d, h1), true, 'to the pixel');
  h1.y += 1;
  assert.equal(PZ.atStylePos(d, h1), false);
  PZ.setStylePos(d, 'h9', h1);
  assert.deepEqual(plain(Object.keys(d.tsPos)), ['h1'], 'unknown styles are ignored');
  const back = await PZ.decodeDoc(await PZ.encodeDoc(d));
  assert.deepEqual(plain(back.tsPos), plain(d.tsPos));
  PZ.setStylePos(d, 'h1', null);
  assert.equal(d.tsPos, undefined, 'no empty object left');
  const bad = PZ.normalizeDoc({ v: 1, slides: [], tsPos: { h1: { x: 'a', y: 1, w: 2 }, h2: { x: 1e9, y: -3.6, w: 0 }, evil: { x: 1, y: 1, w: 1 } } });
  assert.deepEqual(plain(bad.tsPos), { h2: { x: 3840, y: -3.6, w: 1 } });
  assert.equal(PZ.normalizeDoc({ v: 1, slides: [], tsPos: { evil: {} } }).tsPos, undefined);
});

test('paste properties: each group goes where it fits', () => {
  const d = PZ.newDoc();
  d.slides.push(PZ.newSlide(d, 'image-right'));
  const s = d.slides[1];
  const [h1, body, img] = s.els;
  const shape = PZ.make.shape(d, { x: 5, y: 6, w: 70, h: 80, fill: '#00ff00', radius: 9, shadow: 'soft' });
  s.els.push(shape);
  Object.assign(h1, { x: 11, y: 22, w: 333, h: 44, rot: 5, opacity: 0.5, anim: { effect: 'fade-in', trigger: 'click', duration: 600, delay: 0, easing: '', order: 7 } });
  const p = PZ.propsOf(h1);
  assert.equal(p.html, undefined, 'content is not copied');
  assert.equal(p.id, undefined);

  assert.equal(PZ.pasteProps(d, s, body, p, ['pos', 'size']), true);
  assert.deepEqual([body.x, body.y, body.w, body.h, body.autoH, body.rot], [11, 22, 333, 44, true, 0]);
  assert.equal(PZ.pasteProps(d, s, body, p, ['pos', 'size']), false, 'nothing left to change');

  PZ.pasteProps(d, s, body, p, ['text']);
  assert.equal(body.ts, 'h1', 'the text style link comes along');
  assert.equal(body.style.size, d.textStyles.h1.size);

  PZ.pasteProps(d, s, img, p, ['size', 'text', 'look']);
  assert.deepEqual([img.w, img.h, img.opacity, img.radius], [333, 44, 0.5, 24], 'images take size and opacity, not the text format or the text box');

  PZ.pasteProps(d, s, shape, p, ['text', 'look']);
  assert.equal(shape.style.size, d.textStyles.h1.size);
  assert.equal(shape.style.pad, 20, 'a shape keeps its own padding');
  assert.deepEqual([shape.fill, shape.radius, shape.shadow, shape.opacity], ['#00ff00', 9, '', 0.5], 'fill and corners only between shapes');

  const sp = PZ.propsOf(shape);
  const other = PZ.make.shape(d, { shape: 'ellipse', fill: '#000000' });
  s.els.push(other);
  PZ.pasteProps(d, s, other, sp, ['look']);
  assert.deepEqual([other.shape, other.fill, other.radius], ['ellipse', '#00ff00', 9]);

  PZ.pasteProps(d, s, img, p, ['anim']);
  assert.equal(img.anim.effect, 'fade-in');
  assert.equal(img.anim.order, 8, 'plays after the animations already there');
  img.anim.order = 3;
  PZ.pasteProps(d, s, img, p, ['anim']);
  assert.equal(img.anim.order, 3, 'an animated element keeps its turn');
  PZ.pasteProps(d, s, img, sp, ['anim']);
  assert.equal(img.anim, null, 'no animation copied: removed');

  const free = PZ.propsOf(Object.assign(PZ.clone(h1), { style: Object.assign({}, h1.style, { color: '#ff00ff' }) }));
  PZ.pasteProps(d, s, body, free, ['text']);
  assert.equal(body.ts, undefined, 'a custom format makes the text custom');
  assert.equal(body.style.color, '#ff00ff');

  body.locked = true;
  assert.equal(PZ.canPasteProps(p, body, 'pos'), false);
  assert.equal(PZ.pasteProps(d, s, body, Object.assign({}, p, { x: 999 }), ['pos', 'size', 'rot']), false, 'locked elements keep their place');
  assert.equal(PZ.canPasteProps(p, img, 'text'), false);
  assert.equal(PZ.canPasteProps(PZ.propsOf(img), body, 'text'), false);
});

test('image crop: clamped, at least 10 % kept, empty crop dropped', () => {
  assert.equal(PZ.normCrop(null), null);
  assert.equal(PZ.normCrop({ t: 0, r: 0, b: 0, l: 0 }), null);
  assert.deepEqual(plain(PZ.normCrop({ t: 10, r: 'x', b: 5.556, l: -3 })), { t: 10, r: 0, b: 5.56, l: 0 });
  assert.deepEqual(plain(PZ.normCrop({ t: 80, b: 80, l: 200, r: 50 })), { t: 80, r: 0, b: 10, l: 90 });
  const d = PZ.newDoc();
  d.slides[0].els.push(PZ.make.image(d, { src: 'images/a.png', crop: { t: 12, r: 0, b: 0, l: 25 } }), PZ.make.image(d, { src: 'images/b.png' }));
  const [a, b] = PZ.normalizeDoc(plain(d)).slides[0].els.slice(-2);
  assert.deepEqual(plain(a.crop), { t: 12, r: 0, b: 0, l: 25 });
  assert.equal(b.crop, null);
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
  assert.equal(steps[0].withSlide, true);
  assert.deepEqual(plain(steps[0].items.map((i) => i.start)), [0, 500]);
  assert.equal(steps[1].auto, false);
  s.els[0].anim.trigger = 'after';
  assert.equal(PZ.buildSteps(d, s)[0].withSlide, false);
  assert.deepEqual(plain(steps[1].items.map((i) => [i.kind, i.start])), [['in', 0], ['out', 100], ['emph', 600]]);
});

test('fun pack: every fun effect names a scene of its kind; custom copies keep the scene', () => {
  const fun = Object.values(PZ.EFFECTS).filter((e) => e.fun);
  assert.ok(fun.length >= 15);
  for (const fx of fun) {
    if (!fx.scene) continue;
    const sc = PZ.SCENES[fx.scene];
    assert.ok(sc, fx.id + ' scene exists');
    assert.equal(sc.kind, fx.kind === 'transition' ? 'transition' : 'element', fx.id + ' scene kind');
  }
  const copy = PZ.normalizeEffect(Object.assign({}, PZ.EFFECTS['fun-boom'], { id: 'custom-x' }));
  assert.equal(copy.scene, 'boom');
  assert.equal(copy.fun, undefined);
  assert.equal(PZ.normalizeEffect({ id: 'c', kind: 'in', frames: [], scene: 'bad scene!' }).scene, undefined);
});

test('keyframes: stretch (scaleX / scaleY) only when used', () => {
  const k = PZ.toKeyframes([{ scaleX: 1.2 }, {}], 100, 100);
  assert.match(k[0].transform, / scale\(1\.2, 1\)$/);
  assert.match(k[1].transform, / scale\(1, 1\)$/);
  assert.match(PZ.toKeyframes([{ scale: 2 }, {}], 100, 100)[0].transform, /rotateY\(0deg\) scale\(2\)$/);
});

test('imported PDF pages keep their page flag, and new slides do not copy their picture', () => {
  const d = PZ.newDoc({});
  d.slides[0].bg = { type: 'image', src: 'asset:a1', fit: 'contain', color: '#336699', page: true };
  const n = PZ.normalizeDoc(plain(d));
  assert.equal(n.slides[0].bg.page, true);
  assert.equal(PZ.normalizeDoc(plain(PZ.newDoc({}))).slides[0].bg.page, false);
  const next = PZ.slideBgFor(n, n.slides[0]);
  assert.equal(next.type, 'color');
  assert.equal(next.color, n.theme.bg);
  n.slides[0].bg.page = false;
  assert.deepEqual(plain(PZ.slideBgFor(n, n.slides[0])), plain(n.slides[0].bg));
});
