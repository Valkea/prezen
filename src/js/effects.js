/* PrezEn · effects: one keyframe engine for slide transitions and element animations (Web Animations API).
 *
 * An effect is plain JSON, so custom ones travel inside the presentation:
 *   { id, name, kind:'transition'|'in'|'emph'|'out', duration, easing,
 *     in:[frame], out:[frame], inTop:true, inOrigin:'50% 50%', outOrigin:'50% 50%' }   (transition)
 *   { id, name, kind:'in'|'emph'|'out', duration, easing, frames:[frame], origin }      (element)
 * frame = { offset?, opacity, x, y (percent of the slide), scale, scaleX, scaleY (stretch), rotate, rotateX, rotateY (deg),
 *           blur (px), clip ('inset(…)' | 'circle(…)' | 'ellipse(…)' | 'polygon(…)'), easing }
 * Any effect may also name a particle `scene` (PZ.SCENES, filled by fun.js): drawn on top while it plays.
 */
(function (PZ) {
  'use strict';

  PZ.FX_KINDS = { transition: 'Slide transitions', in: 'Entrance', emph: 'Emphasis', out: 'Exit' };
  PZ.FRAME_PROPS = [
    { k: 'opacity', name: 'Opacity', def: 1, step: 0.05, min: 0, max: 1 },
    { k: 'x', name: 'Move X %', def: 0, step: 1 },
    { k: 'y', name: 'Move Y %', def: 0, step: 1 },
    { k: 'scale', name: 'Scale', def: 1, step: 0.05, min: 0 },
    { k: 'scaleX', name: 'Stretch X', def: 1, step: 0.05 },
    { k: 'scaleY', name: 'Stretch Y', def: 1, step: 0.05 },
    { k: 'rotate', name: 'Rotate°', def: 0, step: 1 },
    { k: 'rotateX', name: '3D tilt X°', def: 0, step: 1 },
    { k: 'rotateY', name: '3D turn Y°', def: 0, step: 1 },
    { k: 'blur', name: 'Blur px', def: 0, step: 1, min: 0 },
  ];

  const L = {}; // built-in library
  const T = (id, name, def) => { L[id] = Object.assign({ id, name, kind: 'transition', builtin: true, inTop: true, in: [], out: [] }, def); };
  const A = (kind, id, name, frames, def) => { L[id] = Object.assign({ id, name, kind, builtin: true, frames }, def); };

  // ---- slide transitions (frames of the incoming slide = in, outgoing = out)
  T('none', 'None (cut)', { duration: 0 });
  T('fade', 'Fade', { in: [{ opacity: 0 }, {}] });
  T('fade-black', 'Fade through black', { in: [{ opacity: 0 }, { offset: 0.5, opacity: 0 }, {}], out: [{}, { offset: 0.5, opacity: 0 }, { opacity: 0 }] });
  T('slide-fade', 'Slide & fade', { in: [{ x: 6, opacity: 0 }, {}], out: [{}, { x: -6, opacity: 0 }], easing: 'expo-out' });
  T('push-left', 'Push left', { in: [{ x: 100 }, {}], out: [{}, { x: -100 }] });
  T('push-right', 'Push right', { in: [{ x: -100 }, {}], out: [{}, { x: 100 }] });
  T('push-up', 'Push up', { in: [{ y: 100 }, {}], out: [{}, { y: -100 }] });
  T('push-down', 'Push down', { in: [{ y: -100 }, {}], out: [{}, { y: 100 }] });
  T('cover-left', 'Cover from right', { in: [{ x: 100 }, {}], out: [{}, { scale: 0.9, opacity: 0.4 }] });
  T('cover-up', 'Cover from bottom', { in: [{ y: 100 }, {}], out: [{}, { scale: 0.9, opacity: 0.4 }] });
  T('reveal-left', 'Reveal (slide away left)', { inTop: false, in: [{ scale: 0.9, opacity: 0.4 }, {}], out: [{}, { x: -100 }] });
  T('reveal-up', 'Reveal (slide away up)', { inTop: false, in: [{ scale: 0.9, opacity: 0.4 }, {}], out: [{}, { y: -100 }] });
  T('zoom-in', 'Zoom in', { in: [{ scale: 0.5, opacity: 0 }, {}], out: [{}, { scale: 1.6, opacity: 0 }] });
  T('zoom-out', 'Zoom out', { in: [{ scale: 1.6, opacity: 0 }, {}], out: [{}, { scale: 0.5, opacity: 0 }] });
  T('dive', 'Dive (zoom through)', { in: [{ scale: 0.15, opacity: 0, blur: 8 }, { offset: 0.35, scale: 0.15, opacity: 0, blur: 8 }, {}], out: [{}, { offset: 0.65, scale: 5, opacity: 0, blur: 10 }, { scale: 5, opacity: 0, blur: 10 }], duration: 1200 });
  T('flip-h', 'Flip horizontal', { in: [{ rotateY: -90 }, { offset: 0.5, rotateY: -90 }, {}], out: [{}, { offset: 0.5, rotateY: 90 }, { rotateY: 90 }], duration: 900 });
  T('flip-v', 'Flip vertical', { in: [{ rotateX: 90 }, { offset: 0.5, rotateX: 90 }, {}], out: [{}, { offset: 0.5, rotateX: -90 }, { rotateX: -90 }], duration: 900 });
  T('cube-left', 'Cube left', { in: [{ x: 100, rotateY: 90 }, {}], out: [{}, { x: -100, rotateY: -90 }], inOrigin: '0% 50%', outOrigin: '100% 50%', duration: 1000 });
  T('cube-up', 'Cube up', { in: [{ y: 100, rotateX: -90 }, {}], out: [{}, { y: -100, rotateX: 90 }], inOrigin: '50% 0%', outOrigin: '50% 100%', duration: 1000 });
  T('door', 'Swing door', { inTop: false, in: [{ scale: 0.9, opacity: 0.3 }, {}], out: [{}, { rotateY: -100, opacity: 0.6 }], outOrigin: '0% 50%', duration: 1000 });
  T('spin', 'Spin', { in: [{ rotate: 90, scale: 0.4, opacity: 0 }, {}], out: [{}, { rotate: -90, scale: 0.4, opacity: 0 }] });
  T('blur', 'Blur', { in: [{ blur: 30, opacity: 0 }, {}], out: [{}, { blur: 30, opacity: 0 }] });
  T('wipe-left', 'Wipe left', { in: [{ clip: 'inset(0% 0% 0% 100%)' }, { clip: 'inset(0% 0% 0% 0%)' }] });
  T('wipe-right', 'Wipe right', { in: [{ clip: 'inset(0% 100% 0% 0%)' }, { clip: 'inset(0% 0% 0% 0%)' }] });
  T('wipe-up', 'Wipe up', { in: [{ clip: 'inset(100% 0% 0% 0%)' }, { clip: 'inset(0% 0% 0% 0%)' }] });
  T('wipe-down', 'Wipe down', { in: [{ clip: 'inset(0% 0% 100% 0%)' }, { clip: 'inset(0% 0% 0% 0%)' }] });
  T('split', 'Split (barn doors)', { in: [{ clip: 'inset(0% 50% 0% 50%)' }, { clip: 'inset(0% 0% 0% 0%)' }] });
  T('iris', 'Iris (circle)', { in: [{ clip: 'circle(0% at 50% 50%)' }, { clip: 'circle(75% at 50% 50%)' }], duration: 900 });
  T('diagonal', 'Diagonal wipe', { in: [{ clip: 'polygon(0% 0%, 0% 0%, 0% 0%)' }, { clip: 'polygon(0% 0%, 200% 0%, 0% 200%)' }], duration: 900 });
  T('drop', 'Drop in', { in: [{ y: -100 }, {}], out: [{}, { opacity: 0.2, scale: 0.94 }], easing: 'back-out', duration: 900 });

  // ---- element animations
  A('in', 'fade-in', 'Fade in', [{ opacity: 0 }, {}]);
  A('in', 'rise', 'Rise up', [{ y: 4, opacity: 0 }, {}], { easing: 'expo-out' });
  A('in', 'sink', 'Sink down', [{ y: -4, opacity: 0 }, {}], { easing: 'expo-out' });
  A('in', 'fly-left', 'Fly in from left', [{ x: -100 }, {}], { easing: 'expo-out', duration: 900 });
  A('in', 'fly-right', 'Fly in from right', [{ x: 100 }, {}], { easing: 'expo-out', duration: 900 });
  A('in', 'fly-top', 'Fly in from top', [{ y: -100 }, {}], { easing: 'expo-out', duration: 900 });
  A('in', 'fly-bottom', 'Fly in from bottom', [{ y: 100 }, {}], { easing: 'expo-out', duration: 900 });
  A('in', 'zoom-in', 'Zoom in', [{ scale: 0.3, opacity: 0 }, {}], { easing: 'expo-out' });
  A('in', 'zoom-down', 'Zoom down', [{ scale: 1.8, opacity: 0 }, {}], { easing: 'expo-out' });
  A('in', 'pop', 'Pop', [{ scale: 0, opacity: 0 }, { offset: 0.65, scale: 1.12, opacity: 1 }, {}], { easing: 'ease-out' });
  A('in', 'spin-in', 'Spin in', [{ rotate: -180, scale: 0, opacity: 0 }, {}], { easing: 'expo-out', duration: 800 });
  A('in', 'blur-in', 'Blur in', [{ blur: 20, opacity: 0 }, {}]);
  A('in', 'flip-in', 'Flip in', [{ rotateY: 90, opacity: 0 }, {}], { easing: 'expo-out', duration: 800 });
  A('in', 'wipe-in-right', 'Wipe from left', [{ clip: 'inset(0% 100% 0% 0%)' }, { clip: 'inset(0% 0% 0% 0%)' }]);
  A('in', 'wipe-in-down', 'Wipe from top', [{ clip: 'inset(0% 0% 100% 0%)' }, { clip: 'inset(0% 0% 0% 0%)' }]);
  A('in', 'reveal-circle', 'Circle reveal', [{ clip: 'circle(0% at 50% 50%)' }, { clip: 'circle(75% at 50% 50%)' }]);
  A('in', 'drop-in', 'Drop & bounce', [{ y: -12, opacity: 0 }, {}], { easing: 'back-out', duration: 700 });
  A('emph', 'pulse', 'Pulse', [{}, { offset: 0.5, scale: 1.15 }, {}]);
  A('emph', 'shake', 'Shake', [{}, { offset: 0.15, x: -1 }, { offset: 0.35, x: 1 }, { offset: 0.55, x: -1 }, { offset: 0.75, x: 1 }, {}], { easing: 'linear' });
  A('emph', 'wobble', 'Wobble', [{}, { offset: 0.2, rotate: -8 }, { offset: 0.45, rotate: 6 }, { offset: 0.7, rotate: -3 }, {}], { easing: 'linear' });
  A('emph', 'bounce', 'Bounce', [{}, { offset: 0.3, y: -4 }, { offset: 0.5 }, { offset: 0.7, y: -2 }, {}], { easing: 'linear' });
  A('emph', 'spin-once', 'Spin', [{}, { rotate: 360 }]);
  A('emph', 'flash', 'Flash', [{}, { offset: 0.25, opacity: 0.1 }, { offset: 0.5 }, { offset: 0.75, opacity: 0.1 }, {}], { easing: 'linear' });
  A('emph', 'grow', 'Grow & settle', [{}, { offset: 0.4, scale: 1.3 }, {}], { easing: 'ease-in-out' });
  A('out', 'fade-out', 'Fade out', [{}, { opacity: 0 }]);
  A('out', 'fly-out-left', 'Fly out left', [{}, { x: -100 }], { easing: 'ease-in', duration: 700 });
  A('out', 'fly-out-right', 'Fly out right', [{}, { x: 100 }], { easing: 'ease-in', duration: 700 });
  A('out', 'fly-out-top', 'Fly out top', [{}, { y: -100 }], { easing: 'ease-in', duration: 700 });
  A('out', 'fly-out-bottom', 'Fly out bottom', [{}, { y: 100 }], { easing: 'ease-in', duration: 700 });
  A('out', 'zoom-out', 'Zoom out', [{}, { scale: 0.3, opacity: 0 }], { easing: 'ease-in' });
  A('out', 'blur-out', 'Blur out', [{}, { blur: 20, opacity: 0 }]);
  A('out', 'shrink', 'Shrink away', [{}, { scale: 0, rotate: 90, opacity: 0 }], { easing: 'back-in' });
  PZ.EFFECTS = L;
  /** Particle scenes { id: { kind: 'transition'|'element', name, run(ctx) } }, registered by fun.js. */
  PZ.SCENES = PZ.SCENES || {};

  /** Effects of a kind: built-ins followed by the doc's custom ones. */
  PZ.effectList = function (doc, kind) {
    const out = Object.values(L).filter((e) => e.kind === kind);
    if (doc && doc.effects) for (const e of Object.values(doc.effects)) if (e.kind === kind) out.push(e);
    return out;
  };
  PZ.getEffect = (doc, id) => (doc && doc.effects && doc.effects[id]) || L[id] || null;
  /** Display name: built-in names are translated, custom ones are the author's own text. */
  PZ.fxName = (e) => (!e ? '' : e.builtin ? PZ.t(e.name) : e.name);

  // ---------------------------------------------------------------- validation of custom effects
  const CLIP_RE = /^(inset|circle|ellipse|polygon)\([\d\s.,%a-z-]{0,400}\)$/i;
  function normFrame(f) {
    if (!f || typeof f !== 'object') return {};
    const o = {};
    if (typeof f.offset === 'number' && isFinite(f.offset)) o.offset = PZ.clamp(f.offset, 0, 1);
    for (const p of PZ.FRAME_PROPS) if (typeof f[p.k] === 'number' && isFinite(f[p.k])) o[p.k] = PZ.clamp(f[p.k], -100000, 100000);
    if (typeof f.clip === 'string' && CLIP_RE.test(f.clip.trim())) o.clip = f.clip.trim();
    if (typeof f.easing === 'string' && PZ.easing(f.easing, null)) o.easing = f.easing;
    return o;
  }
  const frames = (a) => (Array.isArray(a) ? a.slice(0, 40).map(normFrame) : []);
  const origin = (v) => (typeof v === 'string' && /^-?\d{1,4}(\.\d+)?% -?\d{1,4}(\.\d+)?%$/.test(v) ? v : '50% 50%');

  PZ.normalizeEffect = function (e) {
    if (!e || typeof e !== 'object' || !/^[\w-]{1,60}$/.test(e.id || '') || !PZ.FX_KINDS[e.kind]) return null;
    const o = { id: e.id, name: PZ.str(e.name, 'Custom effect', 80) || 'Custom effect', kind: e.kind,
      duration: PZ.clamp(PZ.num(e.duration, 700), 0, 20000), easing: PZ.str(e.easing, '', 80) };
    if (e.kind === 'transition') {
      o.in = frames(e.in); o.out = frames(e.out); o.inTop = e.inTop !== false;
      o.inOrigin = origin(e.inOrigin); o.outOrigin = origin(e.outOrigin); o.perspective = PZ.clamp(PZ.num(e.perspective, 0), 0, 10000);
    } else { o.frames = frames(e.frames); o.origin = origin(e.origin); }
    if (typeof e.scene === 'string' && /^[\w-]{1,40}$/.test(e.scene)) o.scene = e.scene; // unknown scenes are ignored when playing
    return o;
  };

  // ---------------------------------------------------------------- engine
  /** Frames → Web Animations keyframes. x/y are percentages of the slide (w × h logical px). */
  PZ.toKeyframes = function (fr, w, h) {
    if (!fr || !fr.length) return [];
    if (fr.length === 1) fr = [fr[0], {}];
    const useBlur = fr.some((f) => f.blur), clipAt = fr.map((f) => f.clip || null);
    const useStretch = fr.some((f) => f.scaleX != null || f.scaleY != null);
    const useClip = clipAt.some(Boolean);
    if (useClip) { // frames without a clip borrow the nearest one so every keyframe has the same shape
      for (let i = 0; i < clipAt.length; i++) if (!clipAt[i]) clipAt[i] = clipAt.slice(0, i).reverse().find(Boolean) || clipAt.slice(i).find(Boolean);
    }
    return fr.map((f, i) => {
      const k = {
        opacity: f.opacity == null ? 1 : f.opacity,
        transform: `translate(${PZ.round(((f.x || 0) * w) / 100, 1)}px, ${PZ.round(((f.y || 0) * h) / 100, 1)}px) rotate(${f.rotate || 0}deg) rotateX(${f.rotateX || 0}deg) rotateY(${f.rotateY || 0}deg) scale(${f.scale == null ? 1 : f.scale})` +
          (useStretch ? ` scale(${f.scaleX == null ? 1 : f.scaleX}, ${f.scaleY == null ? 1 : f.scaleY})` : ''),
      };
      if (f.offset != null) k.offset = f.offset;
      if (useBlur) k.filter = `blur(${f.blur || 0}px)`;
      if (useClip) k.clipPath = clipAt[i];
      if (f.easing) k.easing = PZ.easing(f.easing);
      return k;
    });
  };

  /** Animate a node with frames. Returns the Animation, or null when there is nothing to play. */
  PZ.animate = function (node, fr, o) {
    const kf = PZ.toKeyframes(fr, o.w, o.h);
    if (!kf.length || !node.animate) return null;
    node.style.transformOrigin = o.origin || '50% 50%';
    const timing = { duration: Math.max(1, o.duration || 1), delay: o.delay || 0, easing: PZ.easing(o.easing), fill: o.fill || 'both', direction: o.direction || 'normal' };
    try { return node.animate(kf, timing); } catch (e) {
      try { timing.easing = 'ease'; kf.forEach((k) => delete k.easing); return node.animate(kf, timing); } catch (e2) { return null; }
    }
  };

  /**
   * Run a particle scene on a fresh layer appended to `parent` (w × h logical px). o: { w, h, duration, delay, easing,
   * box: {x, y, w, h} of the animated element (element scenes), doc }. Returns the scene's animations, or [] when
   * there is no such scene. The layer removes itself once they are all over.
   */
  PZ.runScene = function (id, kind, parent, o) {
    const sc = PZ.SCENES[id];
    if (!sc || sc.kind !== kind || !parent || !parent.appendChild || !document.createElement('div').animate) return [];
    const layer = document.createElement('div');
    layer.className = 'pz-fx' + (kind === 'element' ? ' pz-fx-el' : '');
    layer.style.width = o.w + 'px'; layer.style.height = o.h + 'px';
    parent.appendChild(layer);
    const ctx = Object.assign({}, o, { layer, D: Math.max(1, o.duration || 1), delay: o.delay || 0, easing: PZ.easing(o.easing), anims: [] });
    try { sc.run(ctx); } catch (e) { /* decoration only: never break the show */ }
    const anims = ctx.anims;
    if (!anims.length) { layer.remove(); return []; }
    Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => layer.remove());
    return anims;
  };

  /**
   * Play a slide transition between two stacked layers (both W×H, absolutely positioned).
   * reverse: going back, the current slide's transition is rewound (the old "in" layer leaves, the old "out" one returns).
   * Effects with a particle scene play forward instead (an explosion played backwards makes no sense).
   * Returns { finished: Promise, finish() }.
   */
  PZ.runTransition = function (o) {
    const fx = o.effect || L.fade;
    const duration = o.duration != null ? o.duration : (fx.duration != null ? fx.duration : 700);
    const easing = o.easing || fx.easing || 'smooth';
    const inTop = fx.inTop !== false;
    const anims = [];
    const t = { w: o.w, h: o.h, duration, easing };
    if (!duration || fx.id === 'none') return { finished: Promise.resolve(), finish() {} };
    if (o.perspective != null) o.perspective.style.perspective = (fx.perspective || Math.max(o.w, o.h) * 2) + 'px';
    const scene = fx.scene && PZ.SCENES[fx.scene];
    if (!o.reverse || scene) {
      o.inLayer.style.zIndex = inTop ? 2 : 1; o.outLayer.style.zIndex = inTop ? 1 : 2;
      anims.push(PZ.animate(o.inLayer, fx.in, Object.assign({ origin: fx.inOrigin }, t)), PZ.animate(o.outLayer, fx.out, Object.assign({ origin: fx.outOrigin }, t)));
    } else {
      o.outLayer.style.zIndex = inTop ? 2 : 1; o.inLayer.style.zIndex = inTop ? 1 : 2;
      anims.push(PZ.animate(o.outLayer, fx.in, Object.assign({ origin: fx.inOrigin, direction: 'reverse' }, t)), PZ.animate(o.inLayer, fx.out, Object.assign({ origin: fx.outOrigin, direction: 'reverse' }, t)));
    }
    if (scene) anims.push(...PZ.runScene(fx.scene, 'transition', o.inLayer.parentNode, { w: o.w, h: o.h, duration, easing, doc: o.doc }));
    const live = anims.filter(Boolean);
    return {
      finished: Promise.all(live.map((a) => a.finished.catch(() => {}))).then(() => live.forEach((a) => a.cancel())),
      finish() { live.forEach((a) => { try { a.finish(); } catch (e) { /* already done */ } }); },
    };
  };

  /** Play an element animation (on the element's outer box). */
  PZ.animateElement = function (node, anim, doc, opts) {
    const fx = PZ.getEffect(doc, anim.effect);
    if (!fx) return null;
    const timing = { delay: (opts && opts.delay) || 0, duration: anim.duration || fx.duration || 600, easing: anim.easing || fx.easing || 'smooth' };
    const a = PZ.animate(node, fx.frames, Object.assign({ w: doc.w, h: doc.h, origin: fx.origin }, timing));
    if (a) PZ.elementScene(node, fx.scene, doc, timing);
    return a;
  };

  /** Particles of an element effect around its box, on a layer of the slide (they outlive a skipped animation). */
  PZ.elementScene = function (node, scene, doc, timing) {
    if (!scene || !PZ.SCENES[scene]) return;
    const st = node.style, box = { x: parseFloat(st.left) || 0, y: parseFloat(st.top) || 0, w: parseFloat(st.width) || 100, h: parseFloat(st.height) || 100 };
    PZ.runScene(scene, 'element', node.closest('.pz-slide') || node.parentNode, Object.assign({ w: doc.w, h: doc.h, box, doc }, timing));
  };
})(window.PZ = window.PZ || {});
