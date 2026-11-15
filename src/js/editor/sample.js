/* PrezEn · editor/sample: the welcome presentation shown on first launch (it demonstrates the features), in the interface language. */
(function (PZ) {
  'use strict';
  const t = PZ.t;

  PZ.sampleDoc = function () {
    const d = PZ.newDoc({ title: t('Welcome to PrezEn') });
    const W = d.w, H = d.h, T = (o) => PZ.make.text(d, o), S = (o) => PZ.make.shape(d, o), I = (name, o) => PZ.make.icon(d, Object.assign({ svg: PZ.iconSvg(name), name }, o));
    const anim = (effect, trigger, order, extra) => Object.assign({ effect, trigger, order, delay: 0, duration: (PZ.EFFECTS[effect] || {}).duration || 600, easing: '' }, extra);
    const fx = Object.values(PZ.EFFECTS), nTrans = fx.filter((e) => e.kind === 'transition' && e.id !== 'none').length, nAnims = fx.length - nTrans - 1;
    const nShapes = Object.keys(PZ.SHAPES || {}).length, nIcons = Object.values(PZ.ICON_SET).reduce((n, c) => n + Object.keys(c).length, 0);
    const dark = { type: 'gradient', color: '#141832', color2: '#3d2c8d', angle: 135 };
    const light = { type: 'color', color: '#f7f7fb' };
    const slide = (bg, effect, els, notes) => Object.assign(PZ.newSlide(d, 'blank'), { bg, transition: { effect, duration: (PZ.EFFECTS[effect] || {}).duration || 800, easing: '' }, els, notes: notes || '' });

    d.slides = [
      slide(dark, 'fade', [
        S({ shape: 'ellipse', x: W * 0.72, y: -H * 0.2, w: H * 0.8, h: H * 0.8, fill: '#7c8cff', opacity: 0.18 }),
        S({ shape: 'ellipse', x: -H * 0.25, y: H * 0.62, w: H * 0.6, h: H * 0.6, fill: '#ff6b6b', opacity: 0.16 }),
        T({ x: W * 0.1, y: H * 0.3, w: W * 0.8, h: H * 0.2, html: 'PrezEn', style: { size: 190, bold: true, color: '#ffffff', align: 'center', ls: -4 }, anim: anim('rise', 'with', 1, { duration: 900 }) }),
        T({ x: W * 0.15, y: H * 0.52, w: W * 0.7, h: H * 0.08, html: t('Presentations that live in a single file'), style: { size: 52, color: '#c9cdf5', align: 'center' }, anim: anim('fade-in', 'after', 2) }),
        T({ x: W * 0.15, y: H * 0.8, w: W * 0.7, h: H * 0.05, html: t('Press → or click to continue · Esc to go back to the editor'), style: { size: 30, color: '#8d92c8', align: 'center' }, anim: anim('fade-in', 'after', 3, { delay: 400 }) }),
      ], t('Welcome! This is a speaker note: press S while presenting to open the presenter view.')),

      slide(light, 'push-left', [
        T({ x: W * 0.07, y: H * 0.09, w: W * 0.86, h: H * 0.12, html: t('Build slides like a designer'), style: { size: 80, bold: true } }),
        ...[['type', t('Text'), t('Rich text, Google Fonts, bullets'), '#5b5bf0'], ['image', t('Images'), t('Upload, web, Drive, S3 or local paths'), '#00b3a4'], ['shapes', t('Shapes & icons'), t('{shapes} shapes, {icons} icons, 200k+ online', { shapes: nShapes, icons: nIcons }), '#ff6b6b']].flatMap(([icon, title, text, color], i) => {
          const x = W * 0.07 + i * W * 0.3;
          return [
            S({ shape: 'rounded', x, y: H * 0.32, w: W * 0.26, h: H * 0.5, fill: '#ffffff', radius: 36, shadow: 'soft', anim: anim('pop', 'click', 1 + i * 3) }),
            I(icon === 'type' ? 'file-text' : icon === 'shapes' ? 'layers' : icon, { x: x + W * 0.03, y: H * 0.38, w: 110, h: 110, color, anim: anim('zoom-in', 'with', 2 + i * 3) }),
            T({ x: x + W * 0.03, y: H * 0.55, w: W * 0.2, h: H * 0.07, html: '<b>' + title + '</b>', style: { size: 46 }, anim: anim('rise', 'with', 3 + i * 3) }),
            T({ x: x + W * 0.03, y: H * 0.64, w: W * 0.2, h: H * 0.12, html: text, style: { size: 32, color: '#5c6577', lh: 1.35 }, anim: anim('rise', 'with', 3 + i * 3) }),
          ];
        }),
      ], t('The three cards appear one click at a time (Animation section of the inspector).')),

      slide(dark, 'cube-left', [
        T({ x: W * 0.07, y: H * 0.1, w: W * 0.86, h: H * 0.12, html: t('Transitions & animations'), style: { size: 80, bold: true, color: '#ffffff' } }),
        T({ x: W * 0.07, y: H * 0.28, w: W * 0.5, h: H * 0.5, html: '<ul>' + [t('{n} slide transitions: cube, flip, dive, iris…', { n: nTrans }), t('{n} element effects: entrance, emphasis, exit', { n: nAnims }), t('Design your own in the <b>Studio</b>: keyframes, pivot, easing'), t('Custom effects travel inside the file')].map((li) => '<li>' + li + '</li>').join('') + '</ul>', style: { size: 40, color: '#e3e5ff', lh: 1.6 } }),
        I('sparkles', { x: W * 0.66, y: H * 0.3, w: H * 0.45, h: H * 0.45, color: '#ffd166', anim: anim('spin-in', 'click', 1) }),
      ], t('This slide arrived with the Cube transition.')),

      slide(light, 'dive', [
        T({ x: W * 0.07, y: H * 0.1, w: W * 0.86, h: H * 0.12, html: t('No account. Your data stays yours.'), style: { size: 76, bold: true } }),
        ...[['link', t('Share a link'), t('The whole deck is packed into the link (after #), never sent to a server.')], ['save', t('Saved in your browser'), t('Automatically, on this device. Find it in “My presentations”.')], ['download', t('Export anywhere'), t('Single HTML file (slideshow or editable), PDF, JSON.')]].flatMap(([icon, title, text], i) => [
          I(icon, { x: W * 0.08, y: H * (0.32 + i * 0.19), w: 90, h: 90, color: '#5b5bf0' }),
          T({ x: W * 0.08 + 130, y: H * (0.31 + i * 0.19), w: W * 0.7, h: H * 0.06, html: '<b>' + title + '</b>', style: { size: 44 } }),
          T({ x: W * 0.08 + 130, y: H * (0.37 + i * 0.19), w: W * 0.7, h: H * 0.06, html: text, style: { size: 32, color: '#5c6577' } }),
        ]),
      ]),

      slide({ type: 'gradient', color: '#ff6b6b', color2: '#5b5bf0', angle: 120 }, 'iris', [
        T({ x: W * 0.1, y: H * 0.3, w: W * 0.8, h: H * 0.18, html: t('Your turn!'), style: { size: 160, bold: true, color: '#ffffff', align: 'center' }, anim: anim('pop', 'with', 1) }),
        T({ x: W * 0.15, y: H * 0.52, w: W * 0.7, h: H * 0.16, html: t('Press Esc, then edit this deck or start a new one from the menu (top left).'), style: { size: 44, color: '#ffffff', align: 'center', lh: 1.4 } }),
      ]),
    ];
    d.slides.forEach((s) => s.els.forEach((el) => { el.x = Math.round(el.x); el.y = Math.round(el.y); el.w = Math.round(el.w); el.h = Math.round(el.h); }));
    return PZ.normalizeDoc(d);
  };
})(window.PZ = window.PZ || {});
