/* PrezEn · model: the document format, element factories, defaults and validation.
 *
 * A presentation (doc) is plain JSON:
 *   { v:1, id, title, w, h, theme, slides:[slide], effects:{id: customEffect}, assets:{id: dataURL}, password? }
 *   slide:   { id, bg, transition:{effect, duration, easing}, auto, hidden, notes, els:[element] }
 *   element: { id, type:'text'|'image'|'shape'|'icon', x, y, w, h, rot, opacity, locked, shadow, link, anim, ... }
 * Coordinates are logical pixels of the slide (1920×1080 for 16:9) whatever the screen size.
 */
(function (PZ) {
  'use strict';

  PZ.ASPECTS = [
    { id: '16:9', name: 'Widescreen 16:9', w: 1920, h: 1080 },
    { id: '4:3', name: 'Standard 4:3', w: 1440, h: 1080 },
    { id: '16:10', name: '16:10', w: 1920, h: 1200 },
    { id: '1:1', name: 'Square 1:1', w: 1080, h: 1080 },
    { id: '9:16', name: 'Portrait 9:16 (stories)', w: 1080, h: 1920 },
    { id: 'A4', name: 'A4 landscape', w: 1754, h: 1240 },
  ];

  // Google Fonts are loaded on demand when online (and can be embedded on export); system stacks always work.
  const G = (name, spec, fallback) => ({ name, google: spec == null ? '' : spec, stack: `'${name}', ${fallback || 'sans-serif'}` });
  PZ.FONTS = [
    { name: 'System Sans', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" },
    { name: 'System Serif', stack: "Georgia, Cambria, 'Times New Roman', serif" },
    { name: 'System Mono', stack: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace" },
    G('Inter', 'wght@300;400;500;600;700;800'),
    G('Poppins', 'wght@300;400;500;600;700;800'),
    G('Montserrat', 'wght@300;400;500;600;700;800'),
    G('Raleway', 'wght@300;400;500;600;700;800'),
    G('Lato', 'wght@300;400;700;900'),
    G('Open Sans', 'wght@300;400;500;600;700;800'),
    G('Roboto', 'wght@300;400;500;700;900'),
    G('Nunito', 'wght@300;400;600;700;800'),
    G('Work Sans', 'wght@300;400;500;600;700;800'),
    G('Space Grotesk', 'wght@300;400;500;600;700'),
    G('DM Sans', 'wght@400;500;700'),
    G('Oswald', 'wght@300;400;500;600;700'),
    G('Bebas Neue', '', 'Impact, sans-serif'),
    G('Anton', '', 'Impact, sans-serif'),
    G('Playfair Display', 'wght@400;600;700;800;900', 'Georgia, serif'),
    G('Merriweather', 'wght@300;400;700;900', 'Georgia, serif'),
    G('Lora', 'wght@400;500;600;700', 'Georgia, serif'),
    G('Roboto Slab', 'wght@300;400;500;700;900', 'Georgia, serif'),
    G('Abril Fatface', '', 'Georgia, serif'),
    G('Pacifico', '', 'cursive'),
    G('Caveat', 'wght@400;500;600;700', 'cursive'),
    G('Dancing Script', 'wght@400;500;600;700', 'cursive'),
    G('JetBrains Mono', 'wght@300;400;500;700', 'monospace'),
    G('Fira Code', 'wght@300;400;500;700', 'monospace'),
  ];
  const FONT_BY_NAME = new Map(PZ.FONTS.map((f) => [f.name, f]));
  PZ.font = (name) => FONT_BY_NAME.get(name);
  PZ.fontStack = function (name) {
    const f = FONT_BY_NAME.get(name);
    if (f) return f.stack;
    return typeof name === 'string' && /^[\w \-]{1,60}$/.test(name) ? `'${name}', sans-serif` : FONT_BY_NAME.get('Inter').stack;
  };
  PZ.googleFontUrl = function (name) {
    const f = FONT_BY_NAME.get(name);
    if (!f || f.google == null) return '';
    return 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(f.name).replace(/%20/g, '+') + (f.google ? ':' + f.google : '') + '&display=swap';
  };

  /** Font names used anywhere in the doc (element styles and inline font-family in rich text). */
  PZ.usedFonts = function (doc) {
    const set = new Set([doc.theme && doc.theme.font].filter(Boolean));
    for (const s of doc.slides) for (const el of s.els) {
      if (el.style && el.style.font) set.add(el.style.font);
      if (el.html) {
        const re = /font-family:\s*([^;"]+)/gi;
        let m;
        while ((m = re.exec(el.html))) m[1].split(',').forEach((f) => set.add(f.trim().replace(/^['"]|['"]$/g, '').replace(/&quot;/g, '')));
      }
    }
    return Array.from(set).filter((n) => FONT_BY_NAME.has(n));
  };

  /** Inject <link> tags for the Google fonts a doc uses (no-op when already present or offline). */
  PZ.loadFonts = function (doc, targetDoc) {
    for (const name of PZ.usedFonts(doc)) PZ.loadFont(name, targetDoc);
  };

  /** Inject the <link> for one Google font (no-op for system stacks or when already there). */
  PZ.loadFont = function (name, targetDoc) {
    const d = targetDoc || document;
    const url = PZ.googleFontUrl(name);
    if (!url || d.querySelector(`link[data-pz-font="${CSS.escape(name)}"], style[data-pz-font="${CSS.escape(name)}"]`)) return;
    d.head.appendChild(PZ.h('link', { rel: 'stylesheet', href: url, 'data-pz-font': name }));
  };

  PZ.EASINGS = [
    { id: 'smooth', name: 'Smooth', css: 'cubic-bezier(.65,0,.35,1)' },
    { id: 'ease', name: 'Ease', css: 'ease' },
    { id: 'ease-in', name: 'Ease in', css: 'ease-in' },
    { id: 'ease-out', name: 'Ease out', css: 'ease-out' },
    { id: 'ease-in-out', name: 'Ease in-out', css: 'ease-in-out' },
    { id: 'linear', name: 'Linear', css: 'linear' },
    { id: 'expo-out', name: 'Expo out (fast start)', css: 'cubic-bezier(.16,1,.3,1)' },
    { id: 'snappy', name: 'Snappy', css: 'cubic-bezier(.2,.9,.1,1)' },
    { id: 'back-out', name: 'Overshoot', css: 'cubic-bezier(.34,1.56,.64,1)' },
    { id: 'back-in', name: 'Anticipate', css: 'cubic-bezier(.36,0,.66,-.56)' },
  ];
  /** CSS easing for a preset id or a cubic-bezier()/steps() string; anything else falls back to `def`. */
  PZ.easing = function (v, def) {
    const p = PZ.EASINGS.find((e) => e.id === v);
    if (p) return p.css;
    if (typeof v === 'string' && /^cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)$/.test(v)) return v;
    if (typeof v === 'string' && /^steps\(\s*\d{1,3}\s*(,\s*(start|end|jump-start|jump-end|jump-none|jump-both)\s*)?\)$/.test(v)) return v;
    return def === undefined ? PZ.EASINGS[0].css : def;
  };

  PZ.SHADOWS = {
    '': { name: 'None' },
    soft: { name: 'Soft', box: '0 8px 30px rgba(0,0,0,.18)', drop: 'drop-shadow(0 8px 18px rgba(0,0,0,.2))' },
    medium: { name: 'Medium', box: '0 14px 40px rgba(0,0,0,.3)', drop: 'drop-shadow(0 12px 24px rgba(0,0,0,.32))' },
    hard: { name: 'Hard', box: '12px 12px 0 rgba(0,0,0,.85)', drop: 'drop-shadow(10px 10px 0 rgba(0,0,0,.85))' },
    glow: { name: 'Glow', box: '0 0 40px rgba(124,140,255,.75)', drop: 'drop-shadow(0 0 22px rgba(124,140,255,.85))' },
    text: { name: 'Text shadow', text: '0 3px 12px rgba(0,0,0,.45)' },
  };

  PZ.defaultTheme = () => ({ font: 'Inter', color: '#1d2433', accent: '#5b5bf0', accent2: '#ff6b6b', bg: '#ffffff' });

  PZ.defaultTextStyle = (theme, o) => Object.assign({
    font: (theme && theme.font) || 'Inter', size: 48, color: (theme && theme.color) || '#1d2433', bold: false,
    italic: false, underline: false, align: 'left', valign: 'top', lh: 1.25, ls: 0, bg: '', pad: 0, radius: 0, tshadow: '',
  }, o || {});

  const t = PZ.t;

  PZ.newDoc = function (o) {
    o = o || {};
    const asp = PZ.ASPECTS.find((a) => a.id === o.aspect) || PZ.ASPECTS[0];
    // o.w / o.h give a custom page size (same bounds as normalizeDoc); otherwise the aspect preset decides
    const dim = (v, def) => (isFinite(v) && v > 0 ? PZ.clamp(Math.round(v), 100, 8000) : def);
    const doc = {
      v: 1, id: PZ.uid('d'), title: o.title || t('Untitled presentation'), w: dim(o.w, asp.w), h: dim(o.h, asp.h),
      theme: PZ.defaultTheme(), slides: [], effects: {}, assets: {}, created: Date.now(), updated: Date.now(),
    };
    doc.slides.push(PZ.newSlide(doc, 'title'));
    return doc;
  };

  PZ.newSlide = function (doc, layout) {
    const s = {
      id: PZ.uid('s'), bg: { type: 'color', color: (doc.theme && doc.theme.bg) || '#ffffff' },
      transition: { effect: 'fade', duration: 700, easing: '' }, auto: 0, hidden: false, notes: '', els: [],
    };
    const L = PZ.LAYOUTS.find((l) => l.id === layout);
    if (L) s.els = L.make(doc);
    return s;
  };

  const base = (type, o) => Object.assign({ id: PZ.uid('e'), type, x: 100, y: 100, w: 400, h: 200, rot: 0, opacity: 1, locked: false, shadow: '', link: '', anim: null }, o);
  const SHAPE_TEXT = { color: '#ffffff', align: 'center', valign: 'middle', size: 40, pad: 20 };
  const styleOf = (doc, o, defaults) => PZ.defaultTextStyle(doc.theme, Object.assign({}, defaults, o && o.style));
  PZ.make = {
    text: (doc, o) => base('text', Object.assign({ html: 'Text', autoH: true }, o, { style: styleOf(doc, o) })),
    image: (doc, o) => base('image', Object.assign({ src: '', fit: 'cover', pos: '50% 50%', radius: 0, bw: 0, bc: '#ffffff', alt: '', flip: false, filters: null, crop: null }, o)),
    shape: (doc, o) => base('shape', Object.assign({ shape: 'rect', fill: (doc.theme && doc.theme.accent) || '#5b5bf0', fill2: '', gangle: 135,
      stroke: '', sw: 0, dash: '', radius: 0, html: '' }, o, { style: styleOf(doc, o, SHAPE_TEXT) })),
    icon: (doc, o) => base('icon', Object.assign({ svg: '', name: '', color: (doc.theme && doc.theme.accent) || '#5b5bf0', sw: 0 }, o)),
  };

  // ---------------------------------------------------------------- layouts for new slides
  const T = (doc, o) => PZ.make.text(doc, o);
  PZ.LAYOUTS = [
    { id: 'blank', name: 'Blank', make: () => [] },
    {
      id: 'title', name: 'Title', make: (d) => [
        T(d, { x: d.w * 0.1, y: d.h * 0.34, w: d.w * 0.8, h: d.h * 0.18, html: t('Presentation title'), style: { size: Math.round(d.h * 0.1), bold: true, align: 'center', valign: 'middle', lh: 1.1 } }),
        T(d, { x: d.w * 0.15, y: d.h * 0.55, w: d.w * 0.7, h: d.h * 0.08, html: t('Subtitle or author'), style: { size: Math.round(d.h * 0.037), align: 'center', color: '#5c6577' } }),
      ],
    },
    {
      id: 'title-content', name: 'Title & content', make: (d) => [
        T(d, { x: d.w * 0.07, y: d.h * 0.08, w: d.w * 0.86, h: d.h * 0.13, html: t('Slide title'), style: { size: Math.round(d.h * 0.065), bold: true } }),
        T(d, { x: d.w * 0.07, y: d.h * 0.26, w: d.w * 0.86, h: d.h * 0.6, html: `<ul><li>${t('First point')}</li><li>${t('Second point')}</li><li>${t('Third point')}</li></ul>`, style: { size: Math.round(d.h * 0.037), lh: 1.5 } }),
      ],
    },
    {
      id: 'section', name: 'Section', make: (d) => [
        PZ.make.shape(d, { x: d.w * 0.07, y: d.h * 0.38, w: d.w * 0.012, h: d.h * 0.24, radius: 8 }),
        T(d, { x: d.w * 0.1, y: d.h * 0.36, w: d.w * 0.8, h: d.h * 0.16, html: t('Section title'), style: { size: Math.round(d.h * 0.085), bold: true, valign: 'middle' } }),
        T(d, { x: d.w * 0.1, y: d.h * 0.52, w: d.w * 0.8, h: d.h * 0.08, html: t('A short introduction'), style: { size: Math.round(d.h * 0.035), color: '#5c6577' } }),
      ],
    },
    {
      id: 'two-col', name: 'Two columns', make: (d) => [
        T(d, { x: d.w * 0.07, y: d.h * 0.08, w: d.w * 0.86, h: d.h * 0.13, html: t('Comparison'), style: { size: Math.round(d.h * 0.065), bold: true } }),
        T(d, { x: d.w * 0.07, y: d.h * 0.27, w: d.w * 0.4, h: d.h * 0.55, html: `<b>${t('Left')}</b><ul><li>${t('Point one')}</li><li>${t('Point two')}</li></ul>`, style: { size: Math.round(d.h * 0.035), lh: 1.5 } }),
        T(d, { x: d.w * 0.53, y: d.h * 0.27, w: d.w * 0.4, h: d.h * 0.55, html: `<b>${t('Right')}</b><ul><li>${t('Point one')}</li><li>${t('Point two')}</li></ul>`, style: { size: Math.round(d.h * 0.035), lh: 1.5 } }),
      ],
    },
    {
      id: 'image-right', name: 'Text & image', make: (d) => [
        T(d, { x: d.w * 0.07, y: d.h * 0.12, w: d.w * 0.4, h: d.h * 0.14, html: t('Slide title'), style: { size: Math.round(d.h * 0.06), bold: true } }),
        T(d, { x: d.w * 0.07, y: d.h * 0.3, w: d.w * 0.4, h: d.h * 0.5, html: t('Describe the picture, or tell a story around it.'), style: { size: Math.round(d.h * 0.033), lh: 1.5, color: '#5c6577' } }),
        PZ.make.image(d, { x: d.w * 0.53, y: d.h * 0.1, w: d.w * 0.4, h: d.h * 0.8, radius: 24 }),
      ],
    },
    {
      id: 'quote', name: 'Quote', make: (d) => [
        T(d, { x: d.w * 0.12, y: d.h * 0.12, w: d.w * 0.2, h: d.h * 0.25, html: '“', style: { size: Math.round(d.h * 0.3), bold: true, color: (d.theme && d.theme.accent) || '#5b5bf0', font: 'Playfair Display', lh: 1 } }),
        T(d, { x: d.w * 0.14, y: d.h * 0.32, w: d.w * 0.72, h: d.h * 0.3, html: t('A memorable sentence that sums up your message.'), style: { size: Math.round(d.h * 0.055), italic: true, font: 'Playfair Display', lh: 1.3 } }),
        T(d, { x: d.w * 0.14, y: d.h * 0.68, w: d.w * 0.72, h: d.h * 0.06, html: t('— Someone wise'), style: { size: Math.round(d.h * 0.03), color: '#5c6577' } }),
      ],
    },
  ];

  // ---------------------------------------------------------------- validation (shared links and files are untrusted)
  const TYPES = new Set(['text', 'image', 'shape', 'icon']);
  const ALIGN = new Set(['left', 'center', 'right', 'justify']);
  const VALIGN = new Set(['top', 'middle', 'bottom']);
  const FITS = new Set(['cover', 'contain', 'fill']);

  /** Image crop: percent cut from each edge of the picture (as shown, mirror included); at least 10 % stays visible. */
  PZ.CROP_MAX = 90;
  PZ.normCrop = function (c) {
    if (!c || typeof c !== 'object') return null;
    const v = (k) => PZ.round(PZ.clamp(PZ.num(c[k], 0), 0, PZ.CROP_MAX), 1);
    const t = v('t'), l = v('l'), b = Math.min(v('b'), PZ.CROP_MAX - t), r = Math.min(v('r'), PZ.CROP_MAX - l);
    return t || r || b || l ? { t, r, b, l } : null;
  };
  const TRIGGERS = new Set(['click', 'with', 'after']);
  const N = PZ.num, S = PZ.str, C = (v, d) => (typeof v === 'string' && PZ.isColor(v) ? v : d);
  const id = (v, p) => (typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : PZ.uid(p));

  function normStyle(st, theme, defaults) {
    st = st && typeof st === 'object' ? st : {};
    const d = PZ.defaultTextStyle(theme, defaults);
    return {
      font: typeof st.font === 'string' && /^[\w \-]{1,60}$/.test(st.font) ? st.font : d.font,
      size: PZ.clamp(N(st.size, d.size), 4, 1000), color: C(st.color, d.color), bold: !!st.bold, italic: !!st.italic,
      underline: !!st.underline, align: ALIGN.has(st.align) ? st.align : d.align, valign: VALIGN.has(st.valign) ? st.valign : d.valign,
      lh: PZ.clamp(N(st.lh, d.lh), 0.5, 4), ls: PZ.clamp(N(st.ls, 0), -20, 100), bg: C(st.bg, ''), pad: PZ.clamp(N(st.pad, d.pad), 0, 400),
      radius: PZ.clamp(N(st.radius, 0), 0, 1000), tshadow: PZ.SHADOWS[st.tshadow] ? st.tshadow : '',
    };
  }

  function normAnim(a) {
    if (!a || typeof a !== 'object' || typeof a.effect !== 'string' || !a.effect) return null;
    return {
      effect: S(a.effect, '', 60), trigger: TRIGGERS.has(a.trigger) ? a.trigger : 'click',
      duration: PZ.clamp(N(a.duration, 600), 0, 20000), delay: PZ.clamp(N(a.delay, 0), 0, 60000),
      easing: S(a.easing, '', 80), order: N(a.order, 0),
    };
  }

  PZ.normalizeEl = function (e, theme) {
    if (!e || typeof e !== 'object' || !TYPES.has(e.type)) return null;
    const el = {
      id: id(e.id, 'e'), type: e.type, x: N(e.x, 0), y: N(e.y, 0), w: Math.max(1, N(e.w, 100)), h: Math.max(1, N(e.h, 100)),
      rot: N(e.rot, 0) % 360, opacity: PZ.clamp(N(e.opacity, 1), 0, 1), locked: !!e.locked,
      shadow: PZ.SHADOWS[e.shadow] ? e.shadow : '', link: PZ.safeLink ? PZ.safeLink(e.link) : '', anim: normAnim(e.anim),
    };
    if (e.type === 'text') {
      el.html = S(e.html, '', 50000); el.autoH = e.autoH !== false; el.style = normStyle(e.style, theme);
    } else if (e.type === 'image') {
      el.src = S(e.src, '', 8000000); el.fit = FITS.has(e.fit) ? e.fit : 'cover';
      el.pos = typeof e.pos === 'string' && /^\d{1,3}% \d{1,3}%$/.test(e.pos) ? e.pos : '50% 50%';
      el.radius = PZ.clamp(N(e.radius, 0), 0, 2000); el.bw = PZ.clamp(N(e.bw, 0), 0, 200); el.bc = C(e.bc, '#ffffff');
      el.alt = S(e.alt, '', 500); el.flip = !!e.flip;
      el.crop = PZ.normCrop(e.crop);
      const f = e.filters && typeof e.filters === 'object' ? e.filters : null;
      el.filters = f ? { brightness: PZ.clamp(N(f.brightness, 100), 0, 300), contrast: PZ.clamp(N(f.contrast, 100), 0, 300),
        saturate: PZ.clamp(N(f.saturate, 100), 0, 300), grayscale: PZ.clamp(N(f.grayscale, 0), 0, 100), blur: PZ.clamp(N(f.blur, 0), 0, 50) } : null;
    } else if (e.type === 'shape') {
      el.shape = typeof e.shape === 'string' && /^[\w-]{1,30}$/.test(e.shape) ? e.shape : 'rect';
      el.fill = C(e.fill, ''); el.fill2 = C(e.fill2, ''); el.gangle = N(e.gangle, 135); el.stroke = C(e.stroke, ''); el.sw = PZ.clamp(N(e.sw, 0), 0, 200);
      el.dash = ['', 'dash', 'dot'].includes(e.dash) ? e.dash : ''; el.radius = PZ.clamp(N(e.radius, 0), 0, 2000);
      el.html = S(e.html, '', 50000);
      el.style = normStyle(e.style, theme, { color: '#ffffff', align: 'center', valign: 'middle', size: 40, pad: 20 });
    } else if (e.type === 'icon') {
      el.svg = S(e.svg, '', 200000); el.name = S(e.name, '', 120); el.color = C(e.color, '#1d2433'); el.sw = PZ.clamp(N(e.sw, 0), 0, 10);
    }
    return el;
  };

  function normBg(b) {
    b = b && typeof b === 'object' ? b : {};
    const type = ['color', 'gradient', 'image'].includes(b.type) ? b.type : 'color';
    return {
      type, color: C(b.color, '#ffffff'), color2: C(b.color2, '#5b5bf0'), angle: N(b.angle, 135),
      radial: !!b.radial, src: S(b.src, '', 8000000), fit: FITS.has(b.fit) ? b.fit : 'cover',
      overlay: C(b.overlay, '#000000'), overlayOpacity: PZ.clamp(N(b.overlayOpacity, 0), 0, 1),
    };
  }

  PZ.normalizeSlide = function (s, theme) {
    if (!s || typeof s !== 'object') return null;
    const t = s.transition && typeof s.transition === 'object' ? s.transition : {};
    return {
      id: id(s.id, 's'), bg: normBg(s.bg),
      transition: { effect: S(t.effect, 'fade', 60), duration: PZ.clamp(N(t.duration, 700), 0, 20000), easing: S(t.easing, '', 80) },
      auto: PZ.clamp(N(s.auto, 0), 0, 3600), hidden: !!s.hidden, notes: S(s.notes, '', 20000),
      els: (Array.isArray(s.els) ? s.els : []).map((e) => PZ.normalizeEl(e, theme)).filter(Boolean),
    };
  };

  PZ.normalizeDoc = function (raw) {
    if (!raw || typeof raw !== 'object') throw new Error(t('Not a presentation'));
    if (raw.v !== 1) throw new Error(t('Unsupported presentation version'));
    const th = raw.theme && typeof raw.theme === 'object' ? raw.theme : {};
    const dt = PZ.defaultTheme();
    const theme = { font: typeof th.font === 'string' && /^[\w \-]{1,60}$/.test(th.font) ? th.font : dt.font,
      color: C(th.color, dt.color), accent: C(th.accent, dt.accent), accent2: C(th.accent2, dt.accent2), bg: C(th.bg, dt.bg) };
    const doc = {
      v: 1, id: id(raw.id, 'd'), title: S(raw.title, '', 200) || t('Untitled presentation'),
      w: PZ.clamp(Math.round(N(raw.w, 1920)), 100, 8000), h: PZ.clamp(Math.round(N(raw.h, 1080)), 100, 8000), theme,
      slides: (Array.isArray(raw.slides) ? raw.slides : []).map((s) => PZ.normalizeSlide(s, theme)).filter(Boolean),
      effects: {}, assets: {}, created: N(raw.created, Date.now()), updated: N(raw.updated, Date.now()),
    };
    const pw = S(raw.password, '', 128);
    if (pw) doc.password = pw; // asked before opening shared links and exported files (see codec.js)
    if (!doc.slides.length) doc.slides.push(PZ.newSlide(doc, 'blank'));
    if (raw.effects && typeof raw.effects === 'object') {
      for (const k of Object.keys(raw.effects)) {
        const fx = PZ.normalizeEffect ? PZ.normalizeEffect(raw.effects[k]) : null;
        if (fx) doc.effects[fx.id] = fx;
      }
    }
    if (raw.assets && typeof raw.assets === 'object') {
      for (const k of Object.keys(raw.assets)) {
        const v = raw.assets[k];
        if (/^[\w-]{1,40}$/.test(k) && typeof v === 'string' && /^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+$/.test(v)) doc.assets[k] = v;
      }
    }
    return doc;
  };

  /** Iterate over every element of every slide. */
  PZ.eachEl = function (doc, fn) { doc.slides.forEach((s) => s.els.forEach((el) => fn(el, s))); };

  /** Deep copy of a slide or element with fresh ids. */
  PZ.reId = function (obj) {
    const c = PZ.clone(obj);
    if (c.els) { c.id = PZ.uid('s'); c.els.forEach((e) => { e.id = PZ.uid('e'); }); } else c.id = PZ.uid('e');
    return c;
  };
})(window.PZ = window.PZ || {});
