/* PrezEn · editor/panels: slide list (left) and properties inspector (right). */
(function (PZ) {
  'use strict';
  const h = PZ.h, E = PZ.ed, ui = PZ.ui, t = PZ.t, tn = PZ.tn;

  // ================================================================ slides list
  const P = (PZ.edSlides = {});
  let list;
  const thumbW = () => Math.max(96, Math.min(200, (list && list.clientWidth ? list.clientWidth : 216) - 42));

  P.mount = function (pane) {
    list = h('div', { class: 'ed-slide-list' });
    const add = h('button', { class: 'ed-add-slide', onClick: (e) => layoutMenu(e.currentTarget, E.cur) }, PZ.icon('plus'), h('span', { text: t('New slide') }));
    pane.append(list, add);
    // Drag-and-drop reordering is handled on the whole list, so the gaps between thumbnails and the empty space
    // below the last one are drop targets too (dropping there moves the slide to the end). A PDF file dropped
    // on the list is imported there.
    list.addEventListener('dragover', (e) => {
      const pdf = draggingPdf(e.dataTransfer);
      if (!pdf && !e.dataTransfer.types.includes('text/x-prezen-slide')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = pdf ? 'copy' : 'move';
      clearDropMarks();
      const items = list.children, to = dropIndex(e.clientY);
      if (to < items.length) items[to].classList.add('ed-drop-before');
      else if (items.length) items[items.length - 1].classList.add('ed-drop-after');
    });
    list.addEventListener('dragleave', (e) => { if (!list.contains(e.relatedTarget)) clearDropMarks(); });
    list.addEventListener('drop', (e) => {
      const pdf = Array.from(e.dataTransfer.files || []).find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
      if (pdf) { e.preventDefault(); e.stopPropagation(); clearDropMarks(); PZ.edPdf.open(pdf, dropIndex(e.clientY)); return; }
      const from = parseInt(e.dataTransfer.getData('text/x-prezen-slide'), 10);
      if (isNaN(from)) return;
      e.preventDefault(); e.stopPropagation();
      clearDropMarks();
      let to = dropIndex(e.clientY);
      if (from < to) to--;
      E.moveSlide(from, to);
    });
    list.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        const i = E.cur + (e.key === 'ArrowDown' ? 1 : -1);
        if (e.altKey) E.moveSlide(E.cur, i); else E.goSlide(i);
        const it = list.children[E.cur]; if (it) it.focus();
      }
    });
  };

  /** Insertion index (0..n) for a drop at viewport height y: before the first thumbnail whose middle lies below y. */
  function dropIndex(y) {
    const items = list.children;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return items.length;
  }
  const draggingPdf = (dt) => Array.from(dt.items || []).some((it) => it.kind === 'file' && it.type === 'application/pdf');
  const clearDropMarks = () => PZ.$$('.ed-drop-before, .ed-drop-after', list).forEach((n) => n.classList.remove('ed-drop-before', 'ed-drop-after'));

  function layoutMenu(anchor, after) {
    const grid = h('div', { class: 'ed-layout-grid' });
    for (const L of PZ.LAYOUTS) {
      const tmp = PZ.newSlide(E.doc, L.id);
      tmp.bg = PZ.slideBgFor(E.doc, E.slide());
      grid.appendChild(h('button', { class: 'ed-layout-btn', onClick: () => { pop.close(); E.addSlide(L.id, after); } }, PZ.renderThumb(E.doc, tmp, 132), h('span', { text: t(L.name) })));
    }
    const pdf = h('button', { class: 'ui-btn ui-small ed-layout-pdf', onClick: () => { pop.close(); PZ.edPdf.pick(after + 1); } }, PZ.icon('pdf'), h('span', { text: t('Import PDF pages…') }));
    const pop = ui.popover(anchor, h('div', { class: 'ed-pop-pad' }, h('div', { class: 'ui-menu-head', text: t('Choose a layout') }), grid, pdf));
  }

  function slideMenu(anchor, i, at) {
    const s = E.doc.slides[i];
    ui.menu(anchor, [
      { label: t('New slide after'), icon: 'plus', kbd: 'N', run: () => layoutMenu(anchor, i) },
      { label: t('Import PDF pages after…'), icon: 'pdf', run: () => PZ.edPdf.pick(i + 1) },
      { label: t('Duplicate'), icon: 'copy', kbd: 'Ctrl+D', run: () => E.duplicateSlide(i) },
      { label: s.hidden ? t('Stop skipping this slide') : t('Skip this slide when presenting'), icon: s.hidden ? 'eye' : 'eye-off', run: () => E.commit('Hide slide', () => { s.hidden = !s.hidden; }) },
      '-',
      { label: t('Move up'), icon: 'arrow-up', kbd: 'Alt+↑', disabled: i === 0, run: () => E.moveSlide(i, i - 1) },
      { label: t('Move down'), icon: 'arrow-down', kbd: 'Alt+↓', disabled: i === E.doc.slides.length - 1, run: () => E.moveSlide(i, i + 1) },
      '-',
      { label: t('Present from here'), icon: 'play', run: () => { E.goSlide(i); E.present(true); } },
      { label: t('Delete slide'), icon: 'trash', danger: true, disabled: E.doc.slides.length < 2, run: () => E.deleteSlide(i) },
    ], at ? { at } : null);
  }

  function item(i) {
    const s = E.doc.slides[i];
    const it = h('div', { class: 'ed-thumb-item' + (i === E.cur ? ' ed-on' : '') + (s.hidden ? ' ed-hidden' : ''), tabindex: '0', draggable: 'true', dataset: { i: String(i) }, 'aria-label': t('Slide {n}', { n: i + 1 }) },
      h('span', { class: 'ed-thumb-num', text: String(i + 1) }),
      h('div', { class: 'ed-thumb-prev' }, PZ.renderThumb(E.doc, s, thumbW())),
      h('div', { class: 'ed-thumb-badges' },
        s.hidden ? PZ.icon('eye-off') : null,
        s.els.some((e) => e.anim) ? h('span', { title: t('Has animations') }, PZ.icon('sparkles')) : null,
        s.notes ? h('span', { title: t('Has speaker notes') }, PZ.icon('notes')) : null,
        s.auto ? h('span', { title: t('Advances automatically after {n} s', { n: s.auto }) }, PZ.icon('clock')) : null),
      h('button', { class: 'ed-thumb-more', title: t('Slide actions'), onClick: (e) => { e.stopPropagation(); slideMenu(e.currentTarget, i); } }, PZ.icon('more')),
      i > 0 ? transGap(i) : null);
    it.addEventListener('click', () => { if (E.cur !== i) E.goSlide(i); else if (E.sel.length) E.select([]); });
    it.addEventListener('contextmenu', (e) => { e.preventDefault(); E.goSlide(i); slideMenu(it, i, { x: e.clientX, y: e.clientY }); });
    it.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-prezen-slide', String(i)); e.dataTransfer.effectAllowed = 'move'; it.classList.add('ed-dragging'); });
    it.addEventListener('dragend', () => { it.classList.remove('ed-dragging'); clearDropMarks(); });
    return it;
  }

  /** Marker in the gap above slide i for the transition from slide i-1 into it: always shown when there is one
   *  (hover reveals its name), and a click opens the studio on it. */
  function transGap(i) {
    const tr = E.doc.slides[i].transition;
    const fx = PZ.getEffect(E.doc, tr.effect);
    const on = !!fx && fx.id !== 'none';
    const name = on ? PZ.fxName(fx) : t('No transition');
    const label = t('Transition from slide {a} to {b}', { a: i, b: i + 1 }) + ': ' + name;
    const btn = h('button', { class: 'ed-trans-btn' + (on ? '' : ' ed-trans-none'), type: 'button', draggable: 'false', title: label, 'aria-label': label,
      onClick: (e) => {
        e.stopPropagation();
        if (E.cur !== i) E.goSlide(i); else if (E.sel.length) E.select([]);
        PZ.edStudio.open({ scope: 'transition', select: tr.effect });
      } },
      PZ.icon(on ? 'sparkles' : 'plus'), h('span', { class: 'ed-trans-name', text: name }));
    btn.addEventListener('dragstart', (e) => { e.preventDefault(); e.stopPropagation(); });
    return h('div', { class: 'ed-trans-gap' }, btn);
  }

  P.render = function () {
    if (!list) return;
    const top = list.scrollTop;
    list.textContent = '';
    E.doc.slides.forEach((s, i) => list.appendChild(item(i)));
    list.scrollTop = top;
    P.markCurrent();
  };
  P.renderThumb = function (i) {
    const it = list && list.children[i];
    if (!it) return P.render();
    it.replaceWith(item(i));
  };
  P.markCurrent = function () {
    PZ.$$('.ed-thumb-item', list).forEach((n, i) => n.classList.toggle('ed-on', i === E.cur));
    const on = list.children[E.cur];
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  };

  // ================================================================ inspector
  const I = (PZ.edInspector = {});
  let pane;
  I.mount = function (el) { pane = el; };

  const live = (label, fn, alsoInspector) => E.update(label, fn, { merge: true, refresh: 'stage thumb' + (alsoInspector ? ' inspector' : '') });
  const set = (label, fn, alsoInspector) => (v, done) => live(label, () => fn(v), alsoInspector && done);

  /** Picker options for effects of some kinds. Fun effects are listed when the fun pack is on (or when `cur` is one);
   *  otherwise a last option offers to turn it on. */
  const SHOW_FUN = '\u0000fun';
  function fxOptions(kinds, doc, cur) {
    const out = [];
    const fun = E.funOn();
    for (const kind of kinds) {
      const all = Object.values(PZ.EFFECTS).filter((e) => e.kind === kind);
      const builtins = all.filter((e) => !e.fun).map((e) => ({ value: e.id, label: t(e.name) }));
      const custom = Object.values(doc.effects || {}).filter((e) => e.kind === kind).map((e) => ({ value: e.id, label: '★ ' + e.name }));
      out.push({ group: t(PZ.FX_KINDS[kind]), options: builtins.concat(custom) });
      const funny = all.filter((e) => e.fun && (fun || e.id === cur)).map((e) => ({ value: e.id, label: '✨ ' + t(e.name) }));
      if (funny.length) out.push({ group: t('Fun: {kind}', { kind: t(PZ.FX_KINDS[kind]) }), options: funny });
    }
    if (!fun) out.push({ group: t('Fun pack'), options: [{ value: SHOW_FUN, label: '✨ ' + t('Show fun effects (explosions, turtles…)') }] });
    return out;
  }
  const easingOptions = (withDefault) => (withDefault ? [{ value: '', label: t('Effect default') }] : []).concat(PZ.EASINGS.map((e) => ({ value: e.id, label: t(e.name) })));
  // fonts of this computer used in the deck (e.g. from an imported PDF) come first, so the pickers can show them
  const fontOptions = () => {
    const own = new Set();
    E.doc.slides.forEach((s) => s.els.forEach((el) => { if (el.style && el.style.font && !PZ.font(el.style.font)) own.add(el.style.font); }));
    return (own.size ? [{ group: t('In this presentation'), options: Array.from(own).sort().map((n) => ({ value: n, label: n })) }] : []).concat(fontOptionsBase());
  };
  const fontOptionsBase = () => [
    { group: t('Always available'), options: PZ.FONTS.filter((f) => f.google == null).map((f) => ({ value: f.name, label: t(f.name) })) },
    { group: t('Google Fonts (online, embeddable)'), options: PZ.FONTS.filter((f) => f.google != null).map((f) => ({ value: f.name, label: f.name })) },
  ];
  /** Picker options shared by font fields: each name drawn in its own font (Google ones load when the list opens). */
  const fontPick = { optStyle: (v) => ({ fontFamily: PZ.fontStack(v) }), onOpen: () => PZ.FONTS.forEach((f) => PZ.loadFont(f.name)) };
  I.fontOptions = fontOptions;
  I.fontPick = fontPick;

  /** Picker options of the deck's text styles, each name drawn in its style's font, weight and slant. */
  const tsOptions = (extra) => (extra || []).concat(PZ.TEXT_STYLES.map((s) => ({ value: s.id, label: t(s.name) })));
  const tsPick = {
    optStyle: (v) => {
      const ts = E.doc.textStyles[v];
      return ts ? { fontFamily: PZ.fontStack(ts.font), fontWeight: ts.bold ? '700' : '400', fontStyle: ts.italic ? 'italic' : 'normal' } : { fontFamily: '', fontWeight: '', fontStyle: '' };
    },
    onOpen: () => PZ.TEXT_STYLES.forEach((s) => PZ.loadFont(E.doc.textStyles[s.id].font)),
  };
  const tsName = (id) => t((PZ.TEXT_STYLES.find((s) => s.id === id) || {}).name || '');
  I.tsName = tsName;
  const custom = () => ({ value: '', label: t('Custom') });

  /** Link texts to a style ('' makes them custom and keeps their look). A deliberate choice: no note. */
  function useStyle(els, id) {
    styleNote = null;
    live('Text style', () => els.forEach((x) => PZ.useTextStyle(E.doc, x, id)), true);
    if (id) PZ.loadFont(E.doc.textStyles[id].font);
  }

  /** Set when a setting changed on a styled text made it custom: {id, name}, shown under its style picker. */
  let styleNote = null;
  /** A style setting was changed on this text: it leaves its style (the picker then shows Custom, with a note). */
  function leaveStyle(el) {
    if (!el.ts || !PZ.textStyleModified(E.doc, el)) return;
    styleNote = { id: el.id, name: tsName(el.ts) };
    delete el.ts;
    // only the style row is redrawn, so the field being changed (e.g. size with the arrow keys) keeps the focus
    setTimeout(() => { if (tsRow && tsRow.isConnected && tsRow.dataset.id === el.id) tsRow.replaceWith(textStyleControls(el)); });
  }
  let tsRow = null; // the Text style row of the text shown in the inspector

  /** The settings of a text style preset (Text styles dialog); onSet(key, value, done) applies one change. */
  I.textStyleFields = function (st, onSet) {
    const toggle = (icon, title, key) => ui.iconBtn(icon, t(title), () => onSet(key, !st[key], true), { on: !!st[key] });
    return [
      ui.row(t('Font'), ui.pick(st.font, fontOptions(), (v) => { PZ.loadFont(v); onSet('font', v, true); }, Object.assign({ cls: 'ed-font-select' }, fontPick))),
      ui.row(t('Size'), ui.number(st.size, (v, done) => onSet('size', Math.round(v), done), { min: 4, max: 1000, step: 1, unit: 'px', decimals: 0 }),
        ui.color(st.color, (v, done) => { if (v) onSet('color', v, done); }, { palette: [E.doc.theme.color, E.doc.theme.accent, E.doc.theme.accent2, '#5c6577'], title: t('Text colour') })),
      ui.row(t('Style'), h('div', { class: 'ui-btn-group' }, toggle('bold', 'Bold', 'bold'), toggle('italic', 'Italic', 'italic'), toggle('underline', 'Underline', 'underline'))),
      ui.row(t('Line height'), ui.slider(st.lh, (v, done) => onSet('lh', v, done), { min: 0.7, max: 3, step: 0.05 })),
      ui.row(t('Spacing'), ui.number(st.ls, (v, done) => onSet('ls', v, done), { min: -20, max: 100, step: 0.5, unit: 'px' })),
      ui.row(t('Shadow'), ui.select(st.tshadow, [{ value: '', label: t('No text shadow') }, { value: 'text', label: t('Text shadow') }], (v) => onSet('tshadow', v, true))),
    ];
  };

  /** Hint saying how many texts use a style. */
  I.tsUsedHint = function (id) {
    const n = PZ.textStyleUses(E.doc)[id] || 0;
    return h('p', { class: 'ed-hint', text: n ? tn('Used by {n} text in this presentation.', 'Used by {n} texts in this presentation.', n)
      : t('No text uses this style yet: pick it in the Text section of a text box, or add one from the menu next to Text.') });
  };

  I.render = function () {
    if (!pane) return;
    const scroll = pane.scrollTop;
    pane.textContent = '';
    const els = E.selected();
    if (styleNote && !(els.length === 1 && els[0].id === styleNote.id)) styleNote = null;
    if (!els.length) slidePanel();
    else if (els.length === 1) elementPanel(els[0]);
    else multiPanel(els);
    ui.openFirst(pane);
    pane.scrollTop = scroll;
  };

  function head(title, actions) { pane.appendChild(h('div', { class: 'ed-insp-head' }, h('h3', { text: title }), h('div', { class: 'ed-insp-actions' }, actions))); }

  // ---------------------------------------------------------------- slide
  function slidePanel() {
    const s = E.slide();
    const i = E.cur;
    head(t('Slide {n}', { n: i + 1 }), [ui.iconBtn('copy', t('Duplicate slide'), () => E.duplicateSlide()), ui.iconBtn('trash', t('Delete slide'), () => E.deleteSlide())]);
    const bg = s.bg;
    const bgBody = h('div');
    bgBody.appendChild(ui.seg(bg.type, [{ value: 'color', label: t('Colour') }, { value: 'gradient', label: t('Gradient') }, { value: 'image', label: t('Image') }],
      (v) => { live('Background', () => { bg.type = v; }, true); }));
    if (bg.type === 'color' || bg.type === 'gradient') bgBody.appendChild(ui.row(bg.type === 'gradient' ? t('From') : t('Colour'), ui.color(bg.color, set('Background', (v) => { bg.color = v || '#ffffff'; }), { palette: [E.doc.theme.bg, E.doc.theme.accent] })));
    if (bg.type === 'gradient') {
      bgBody.appendChild(ui.row(t('To'), ui.color(bg.color2, set('Background', (v) => { bg.color2 = v || '#000000'; }))));
      bgBody.appendChild(ui.row(t('Angle'), ui.slider(bg.angle, set('Background', (v) => { bg.angle = v; }), { min: 0, max: 360, fmt: (v) => v + '°' })));
      bgBody.appendChild(ui.row(t('Radial'), ui.toggle(bg.radial, set('Background', (v) => { bg.radial = v; }))));
    }
    if (bg.type === 'image') {
      bgBody.appendChild(ui.row(t('Picture'), h('button', { class: 'ui-btn ui-small', text: bg.src ? t('Replace…') : t('Choose…'), onClick: () => PZ.edDialogs.image({ title: t('Background image'), onPick: (ref) => live('Background image', () => { bg.src = ref; bg.page = false; }, true) }) }),
        bg.src ? h('span', { class: 'ed-src-badge', text: t(PZ.SRC_LABELS[PZ.srcKind(bg.src)]) }) : null));
      bgBody.appendChild(ui.row(t('Fit'), ui.seg(bg.fit, [{ value: 'cover', label: t('Fill') }, { value: 'contain', label: t('Fit') }], set('Background', (v) => { bg.fit = v; }))));
      bgBody.appendChild(ui.row(t('Under'), ui.color(bg.color, set('Background', (v) => { bg.color = v || '#ffffff'; }))));
      bgBody.appendChild(ui.row(t('Tint'), ui.color(bg.overlay, set('Background', (v) => { bg.overlay = v || '#000000'; }))));
      bgBody.appendChild(ui.row(t('Tint %'), ui.slider(Math.round(bg.overlayOpacity * 100), set('Background', (v) => { bg.overlayOpacity = v / 100; }), { min: 0, max: 100, fmt: (v) => v + '%' })));
    }
    bgBody.appendChild(h('button', { class: 'ui-btn ui-small ui-ghost', text: t('Apply to all slides'), onClick: () => E.commit('Background on all slides', (d) => d.slides.forEach((x) => { x.bg = PZ.clone(bg); })) }));
    pane.appendChild(ui.section('Background', bgBody, { open: true }));

    const tr = s.transition;
    const fx = PZ.getEffect(E.doc, tr.effect);
    pane.appendChild(ui.section('Transition into this slide', h('div', null,
      ui.row(t('Effect'), ui.pick(tr.effect, fxOptions(['transition'], E.doc, tr.effect), (v) => (v === SHOW_FUN ? E.setFun(true) : I.setTransition(v)),
        { previewDelay: 250, onPreview: (v) => (v && v !== SHOW_FUN ? previewTransition(Object.assign({ effect: v }, transitionDefaults(v))) : stopTransition()) })),
      fx && fx.id !== 'none' ? ui.row(t('Duration'), ui.slider(tr.duration, set('Transition', (v) => { tr.duration = v; }), { min: 100, max: 3000, step: 50, fmt: (v) => (v / 1000).toFixed(2) + ' s' })) : null,
      fx && fx.id !== 'none' ? ui.row(t('Easing'), ui.select(tr.easing, easingOptions(true), set('Transition', (v) => { tr.easing = v; }))) : null,
      fx && fx.id !== 'none' ? null : h('p', { class: 'ed-hint', text: t('Choose an effect to set its duration and easing, or design one in the Studio.') }),
      h('div', { class: 'ui-btn-row' },
        h('button', { class: 'ui-btn ui-small', disabled: !(fx && fx.id !== 'none'), onClick: () => previewTransition(tr) }, PZ.icon('play'), h('span', { text: t('Preview') })),
        h('button', { class: 'ui-btn ui-small ui-ghost', text: t('Apply to all'), onClick: () => E.commit('Transition on all slides', (d) => d.slides.forEach((x) => { x.transition = PZ.clone(tr); })) }),
        h('button', { class: 'ui-btn ui-small ui-ghost', onClick: () => PZ.edStudio.open({ scope: 'transition', select: tr.effect }) }, PZ.icon('sparkles'), h('span', { text: t('Studio') })))), { open: true }));

    animOrderSection(true);
    pane.appendChild(ui.section('Text styles', h('button', { class: 'ui-btn ui-small', onClick: () => PZ.edDialogs.textStyles() }, PZ.icon('sliders'), h('span', { text: t('Edit text styles…') })), { open: true }));

    pane.appendChild(ui.section('Playback', h('div', null,
      ui.row(t('Auto-advance'), ui.number(s.auto, set('Auto-advance', (v) => { s.auto = v; }), { min: 0, max: 3600, step: 1, unit: 's', title: t('0 = wait for a click') })),
      ui.row(t('Hidden'), ui.toggle(s.hidden, (v) => live('Hide slide', () => { s.hidden = v; }, false), t('Skip this slide when presenting'))))));

    pane.appendChild(ui.section('Speaker notes', ui.textarea(s.notes, set('Notes', (v) => { s.notes = v; }), { rows: 6, placeholder: t('Notes for you: shown in the presenter view (S) and in the notes PDF.') })));
  }

  /** "Animation order" section, shown in every panel as soon as the current slide has an animation.
   *  Hovering a row plays that element's animation on the stage; rows of selected elements are highlighted. */
  function animOrderSection(open) {
    const s = E.slide();
    const animated = s.els.filter((e) => e.anim).sort((a, b) => (a.anim.order || 0) - (b.anim.order || 0));
    if (!animated.length) return;
    const listEl = h('div', { class: 'ed-anim-list' });
    let hoverTimer = 0;
    const stopHover = () => { clearTimeout(hoverTimer); PZ.edStage.previewEffect([], null); };
    animated.forEach((el, n) => {
      const f = PZ.getEffect(E.doc, el.anim.effect);
      const row = h('div', { class: 'ed-anim-row' + (E.sel.includes(el.id) ? ' ed-on' : '') },
        h('span', { class: 'ed-anim-n', text: String(n + 1) }),
        h('button', { class: 'ed-anim-name', onClick: () => { stopHover(); E.select([el.id]); }, title: t('Select') }, h('b', { text: elLabel(el) }), h('small', { text: (f ? PZ.fxName(f) : el.anim.effect) + ' · ' + { click: t('on click'), with: t('with previous'), after: t('after previous') }[el.anim.trigger] })),
        ui.iconBtn('chevron-up', t('Earlier'), () => reorderAnim(animated, n, -1)),
        ui.iconBtn('chevron-down', t('Later'), () => reorderAnim(animated, n, 1)));
      row.addEventListener('mouseenter', () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => PZ.edStage.previewAnim(el), 200); });
      listEl.appendChild(row);
    });
    listEl.addEventListener('mouseleave', stopHover);
    pane.appendChild(ui.section('Animation order', listEl, { open: !!open }));
  }

  function reorderAnim(animated, n, d) {
    const j = n + d;
    if (j < 0 || j >= animated.length) return;
    E.commit('Animation order', () => {
      const arr = animated.slice();
      [arr[n], arr[j]] = [arr[j], arr[n]];
      arr.forEach((el, i) => { el.anim.order = i + 1; });
    });
  }

  function elLabel(el) {
    if (el.type === 'text' || (el.type === 'shape' && el.html)) { const s = PZ.htmlToText(el.html); if (s) return s.slice(0, 28); }
    if (el.type === 'text') return t('Text');
    if (el.type === 'icon') return t('Icon') + ' ' + (el.name || '');
    if (el.type === 'shape') return t((PZ.SHAPES[el.shape] || {}).name || 'Shape');
    return t('Image');
  }

  /** Set the current slide's transition effect, with that effect's default duration and easing. */
  I.setTransition = function (effect) {
    const tr = E.slide().transition;
    live('Transition', () => { tr.effect = effect; Object.assign(tr, transitionDefaults(effect)); }, true);
  };

  /** Duration and easing a transition gets when its effect is chosen. */
  function transitionDefaults(effect) {
    const f = PZ.getEffect(E.doc, effect);
    return { duration: f && f.duration != null ? f.duration || 0 : 700, easing: '' };
  }

  let transBox = null;
  function stopTransition() { if (transBox) { transBox.remove(); transBox = null; } }

  /** Play a transition {effect, duration, easing} into this slide on the stage (from the previous slide). */
  function previewTransition(tr) {
    stopTransition();
    const stage = PZ.$('.ed-stage');
    if (!stage || !tr.effect || tr.effect === 'none') return;
    const k = PZ.edStage.scale();
    const box = h('div', { class: 'ed-trans-preview', style: { width: E.doc.w + 'px', height: E.doc.h + 'px', transform: `scale(${k})` } });
    const prev = E.doc.slides[E.cur - 1] || { bg: { type: 'color', color: '#222' }, els: [] };
    const out = h('div', { class: 'pz-layer' }, PZ.renderSlide(E.doc, prev, 'play'));
    const inn = h('div', { class: 'pz-layer' }, PZ.renderSlide(E.doc, E.slide(), 'play'));
    box.append(out, inn);
    stage.appendChild(box);
    transBox = box;
    const run = PZ.runTransition({ inLayer: inn, outLayer: out, effect: PZ.getEffect(E.doc, tr.effect), duration: tr.duration, easing: tr.easing, w: E.doc.w, h: E.doc.h, perspective: box, doc: E.doc });
    run.finished.then(() => setTimeout(() => { box.remove(); if (transBox === box) transBox = null; }, 250));
  }

  // ---------------------------------------------------------------- element
  function elementPanel(el) {
    const names = { text: t('Text'), image: t('Image'), shape: t((PZ.SHAPES[el.shape] || {}).name || 'Shape'), icon: t('Icon') };
    head(names[el.type], [
      ui.iconBtn(el.locked ? 'lock' : 'unlock', el.locked ? t('Unlock') : t('Lock position'), () => E.commit('Lock', () => { el.locked = !el.locked; }), { on: el.locked }),
      ui.iconBtn('brush', t('Copy properties ({key})', { key: E.PROPS_KEYS.copy }), () => E.copyProps()),
      pastePropsBtn(),
      ui.iconBtn('copy', t('Duplicate (Ctrl+D)'), () => E.duplicateSel()),
      ui.iconBtn('trash', t('Delete (Del)'), () => E.deleteSel()),
    ]);
    // the box shadow is part of the element's look: it lives in its main style section
    const withShadow = (body) => { body.appendChild(ui.row(t('Shadow'), ui.select(el.shadow, Object.entries(PZ.SHADOWS).filter(([k2]) => k2 !== 'text').map(([k2, v]) => ({ value: k2, label: t(v.name) })), set('Shadow', (v) => { el.shadow = v; })))); return body; };
    if (el.type === 'text') pane.appendChild(ui.section('Text', withShadow(textControls(el, true)), { open: true }));
    if (el.type === 'shape') { pane.appendChild(ui.section('Shape', withShadow(shapeControls(el)), { open: true })); pane.appendChild(ui.section('Text in shape', textControls(el, false), { open: true })); }
    if (el.type === 'image') pane.appendChild(ui.section('Image', withShadow(imageControls(el)), { open: true }));
    if (el.type === 'icon') pane.appendChild(ui.section('Icon', withShadow(iconControls(el)), { open: true }));
    pane.appendChild(ui.section('Position & size', positionControls(el), { open: true }));
    pane.appendChild(ui.section('Animation', animControls(el)));
    animOrderSection();
    pane.appendChild(ui.section('Link', h('div', null,
      ui.row(t('Link'), ui.text(el.link, (v, done) => { if (done) live('Link', () => { el.link = PZ.safeLink(v.trim()); }, true); }, { placeholder: t('https://…  or  #3 (slide 3)') })),
      el.link && !PZ.safeLink(el.link) ? h('p', { class: 'ed-hint ed-warn', text: t('Links must start with https://, mailto: or be a slide number like #3.') }) : null,
      h('p', { class: 'ed-hint', text: t('In the presentation, clicking the element opens the link or jumps to the slide.') }))));
  }

  function textControls(el, isText) {
    const st = el.style;
    const box = h('div');
    const rich = () => PZ.edStage.hasTextSelection();
    const styleOrSel = (label, key, cmd, valueOf) => (v, done) => {
      if (rich() && cmd) { PZ.edStage.execText(cmd, valueOf ? valueOf(v) : v); return; }
      live(label, () => { st[key] = v; leaveStyle(el); }, false);
      if (done) E.refresh('inspector');
    };
    if (!isText) box.appendChild(h('p', { class: 'ed-hint', text: t('Double-click the shape (or press Enter) to type in it.') }));
    if (isText) box.appendChild(textStyleControls(el));
    box.appendChild(ui.row(t('Font'), ui.pick(st.font, fontOptions(), styleOrSel('Font', 'font', 'fontName'), Object.assign({
      cls: 'ed-font-select',
      // with words selected the pick only restyles them, so a whole-box preview would mislead
      onPreview: (v) => { if (!rich()) PZ.edStage.previewFont(el, v); },
    }, fontPick))));
    box.appendChild(ui.row(t('Size'), ui.number(st.size, (v, done) => {
      if (rich()) { if (done) PZ.edStage.execText('fontSizePx', v); return; }
      live('Font size', () => { st.size = v; leaveStyle(el); });
    }, { min: 4, max: 1000, step: 1, unit: 'px' }), ui.color(st.color, styleOrSel('Text colour', 'color', 'foreColor'), { palette: [E.doc.theme.color, E.doc.theme.accent, E.doc.theme.accent2], title: t('Text colour') })));
    const toggle = (icon, title, key, cmd) => ui.iconBtn(icon, t(title), () => {
      if (rich() || (E.editing && E.editing.id === el.id && cmd !== null && rich())) { PZ.edStage.execText(cmd); return; }
      live(title, () => { st[key] = !st[key]; leaveStyle(el); }, true);
    }, { on: !!st[key] });
    box.appendChild(ui.row(t('Style'),
      h('div', { class: 'ui-btn-group' }, toggle('bold', 'Bold', 'bold', 'bold'), toggle('italic', 'Italic', 'italic', 'italic'), toggle('underline', 'Underline', 'underline', 'underline'),
        ui.iconBtn('strike', t('Strikethrough (selected text)'), () => withEdit(el, () => PZ.edStage.execText('strikeThrough'))),
        ui.iconBtn('list', t('Bullet list'), () => withEdit(el, () => PZ.edStage.execText('insertUnorderedList'))),
        ui.iconBtn('list-ordered', t('Numbered list'), () => withEdit(el, () => PZ.edStage.execText('insertOrderedList'))))));
    box.appendChild(ui.row(t('Align'), ui.seg(st.align, [['left', 'Left'], ['center', 'Center'], ['right', 'Right'], ['justify', 'Justify']].map(([a, l]) => ({ value: a, icon: 'align-' + a, title: t(l) })), set('Align', (v) => { st.align = v; })),
      ui.seg(st.valign, [{ value: 'top', icon: 'valign-top', title: t('Top') }, { value: 'middle', icon: 'valign-middle', title: t('Middle') }, { value: 'bottom', icon: 'valign-bottom', title: t('Bottom') }], set('Vertical align', (v) => { st.valign = v; }))));
    box.appendChild(ui.row(t('Line height'), ui.slider(st.lh, set('Line height', (v) => { st.lh = v; leaveStyle(el); }), { min: 0.7, max: 3, step: 0.05 })));
    box.appendChild(ui.row(t('Spacing'), ui.number(st.ls, set('Letter spacing', (v) => { st.ls = v; leaveStyle(el); }), { min: -20, max: 100, step: 0.5, unit: 'px' }),
      ui.select(st.tshadow, [{ value: '', label: t('No text shadow') }, { value: 'text', label: t('Text shadow') }], set('Text shadow', (v) => { st.tshadow = v; leaveStyle(el); }))));
    if (isText) {
      box.appendChild(ui.row(t('Box'), ui.color(st.bg, set('Text background', (v) => { st.bg = v; }, true), { allowNone: true, title: t('Box colour') }),
        ui.number(st.pad, set('Padding', (v) => { st.pad = v; }), { min: 0, max: 400, label: t('pad') }),
        st.bg ? ui.number(st.radius, set('Corner radius', (v) => { st.radius = v; }), { min: 0, max: 1000, label: t('rad') }) : null));
      box.appendChild(ui.row(t('Auto height'), ui.toggle(el.autoH, set('Auto height', (v) => { el.autoH = v; }, true), t('Grow with the text'))));
    } else box.appendChild(ui.row(t('Padding'), ui.number(st.pad, set('Padding', (v) => { st.pad = v; }), { min: 0, max: 400, unit: 'px' })));
    box.appendChild(h('p', { class: 'ed-hint', text: t('Select words while editing to style only them.') }));
    return box;
  }

  /** Text style row: pick the style of this text; when it was changed by hand, put it back or make it the style. */
  /** Text style row: the style of this text, or Custom (with a note when a setting change just made it custom). */
  function textStyleControls(el) {
    const id = el.ts && E.doc.textStyles[el.ts] ? el.ts : '';
    return (tsRow = h('div', { class: 'ed-ts', dataset: { id: el.id } },
      ui.row(t('Text style'), ui.pick(id, tsOptions([custom()]), (v) => useStyle([el], v), tsPick),
        // the style has a position (Text styles dialog) and this text is elsewhere: one click puts it there
        id && PZ.stylePos(E.doc, id) && !PZ.atStylePos(E.doc, el) && !el.locked
          ? ui.iconBtn('target', t('Move to the {name} position', { name: tsName(id) }), () => E.toStylePos(el)) : null,
        ui.iconBtn('sliders', t('Edit text styles…'), () => PZ.edDialogs.textStyles({ select: id }))),
      !id && styleNote && styleNote.id === el.id
        ? h('p', { class: 'ed-hint ed-ts-note', text: t('Now custom: a setting of this text was changed, so it no longer follows {name}.', { name: styleNote.name }) }) : null));
  }

  /** Run a rich-text command, entering edit mode with everything selected if needed. */
  function withEdit(el, fn) {
    if (E.editing && E.editing.id === el.id) { fn(); return; }
    PZ.edStage.startEdit(el.id, true);
    fn();
    PZ.edStage.endEdit();
  }

  function shapeControls(el) {
    const isLine = PZ.SHAPES[el.shape] && PZ.SHAPES[el.shape].line;
    const box = h('div');
    box.appendChild(ui.row(t('Shape'), ui.select(el.shape, Object.entries(PZ.SHAPES).map(([k2, v]) => ({ value: k2, label: t(v.name) })), set('Shape', (v) => { el.shape = v; }, true))));
    if (!isLine) {
      box.appendChild(ui.row(t('Fill'), ui.color(el.fill, set('Fill', (v) => { el.fill = v; }, true), { allowNone: true, palette: [E.doc.theme.accent, E.doc.theme.accent2] }),
        h('span', { class: 'ed-mini-label', text: t('to') }), ui.color(el.fill2, set('Gradient', (v) => { el.fill2 = v; }, true), { allowNone: true, title: t('Second colour (gradient)') })));
      if (el.fill2) box.appendChild(ui.row(t('Angle'), ui.slider(el.gangle, set('Gradient angle', (v) => { el.gangle = v; }), { min: 0, max: 360, fmt: (v) => v + '°' })));
    }
    box.appendChild(ui.row(isLine ? t('Colour') : t('Border'), ui.color(el.stroke, set('Stroke', (v) => { el.stroke = v; }), { allowNone: !isLine }),
      ui.number(el.sw, set('Stroke width', (v) => { el.sw = v; }), { min: 0, max: 200, label: t('w') })));
    box.appendChild(ui.row(t('Dash'), ui.seg(el.dash, [{ value: '', label: t('Solid') }, { value: 'dash', label: t('Dash') }, { value: 'dot', label: t('Dot') }], set('Dash', (v) => { el.dash = v; }))));
    if (el.shape === 'rect' || el.shape === 'rounded') box.appendChild(ui.row(t('Corners'), ui.slider(el.radius, set('Corner radius', (v) => { el.radius = v; }), { min: 0, max: Math.round(Math.min(el.w, el.h) / 2) })));
    return box;
  }

  function imageControls(el) {
    const box = h('div');
    const kind = PZ.srcKind(el.src);
    box.appendChild(h('div', { class: 'ed-src' }, h('span', { class: 'ed-src-badge', text: t(PZ.SRC_LABELS[kind]) }),
      kind !== 'embedded' && kind !== 'none' ? h('code', { class: 'ed-src-ref', title: el.src, text: el.src.slice(0, 120) }) : null));
    box.appendChild(h('div', { class: 'ui-btn-row' },
      h('button', { class: 'ui-btn ui-small', text: el.src ? t('Replace…') : t('Choose picture…'), onClick: () => PZ.edDialogs.image({ title: t('Replace image'), initial: el.src, onPick: (ref) => live('Replace image', () => { el.src = ref; }, true) }) }),
      el.src && kind !== 'embedded' ? h('button', { class: 'ui-btn ui-small ui-ghost', text: t('Embed copy'), title: t('Download the picture into the presentation so it works offline'), onClick: async () => {
        const tmp = { slides: [{ els: [{ type: 'image', src: el.src }] }], assets: {} };
        const r = await PZ.embedImages(tmp);
        if (r.failed.length) { PZ.toast(t('This host does not allow embedding (CORS). Download the picture and upload it instead.'), { type: 'warn', timeout: 7000 }); return; }
        const ref = tmp.slides[0].els[0].src;
        live('Embed image', (d) => { Object.assign(E.doc.assets, tmp.assets); el.src = ref; }, true);
      } }) : null));
    box.appendChild(ui.row(t('Fit'), ui.seg(el.fit, [{ value: 'cover', label: t('Fill') }, { value: 'contain', label: t('Fit') }, { value: 'fill', label: t('Stretch') }], set('Image fit', (v) => { el.fit = v; }))));
    if (el.fit === 'cover') {
      box.appendChild(ui.row(t('Focus'), ui.select(el.pos, [['50% 50%', 'Center'], ['50% 0%', 'Top'], ['50% 100%', 'Bottom'], ['0% 50%', 'Left'], ['100% 50%', 'Right'], ['0% 0%', 'Top left'], ['100% 0%', 'Top right'], ['0% 100%', 'Bottom left'], ['100% 100%', 'Bottom right']].map(([v, l]) => ({ value: v, label: t(l) })), set('Image focus', (v) => { el.pos = v; }))));
    }
    if (el.src) box.appendChild(cropControls(el));
    box.appendChild(ui.row(t('Corners'), ui.slider(el.radius, set('Corner radius', (v) => { el.radius = v; }), { min: 0, max: Math.round(Math.min(el.w, el.h) / 2) })));
    box.appendChild(ui.row(t('Border'), ui.number(el.bw, set('Border', (v) => { el.bw = v; }), { min: 0, max: 200, unit: 'px' }), ui.color(el.bc, set('Border colour', (v) => { el.bc = v || '#ffffff'; }))));
    box.appendChild(ui.row(t('Mirror'), ui.toggle(el.flip, set('Mirror', (v) => { el.flip = v; }))));
    const f = el.filters || { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, blur: 0 };
    const fset = (key) => set('Image filter', (v) => { el.filters = Object.assign({}, f, el.filters, { [key]: v }); });
    box.appendChild(ui.row(t('Brightness'), ui.slider(f.brightness, fset('brightness'), { min: 0, max: 200, fmt: (v) => v + '%' })));
    box.appendChild(ui.row(t('Contrast'), ui.slider(f.contrast, fset('contrast'), { min: 0, max: 200, fmt: (v) => v + '%' })));
    box.appendChild(ui.row(t('Saturation'), ui.slider(f.saturate, fset('saturate'), { min: 0, max: 200, fmt: (v) => v + '%' })));
    box.appendChild(ui.row(t('Greyscale'), ui.slider(f.grayscale, fset('grayscale'), { min: 0, max: 100, fmt: (v) => v + '%' })));
    box.appendChild(ui.row(t('Blur'), ui.slider(f.blur, fset('blur'), { min: 0, max: 30, fmt: (v) => v + 'px' })));
    box.appendChild(ui.row(t('Alt text'), ui.text(el.alt, set('Alt text', (v) => { el.alt = v; }), { placeholder: t('Describe the picture') })));
    return box;
  }

  /** Crop: percent cut from each edge of the picture as shown; the kept part is placed with Fit and Focus like a whole picture. */
  function cropControls(el) {
    const c = el.crop || { t: 0, r: 0, b: 0, l: 0 };
    const OPP = { t: 'b', b: 't', l: 'r', r: 'l' };
    const n = (key, label) => ui.number(c[key], set('Crop', (v) => {
      const next = Object.assign({ t: 0, r: 0, b: 0, l: 0 }, el.crop);
      next[key] = Math.min(v, PZ.CROP_MAX - next[OPP[key]]);
      el.crop = PZ.normCrop(next);
    }, true), { label, min: 0, max: PZ.CROP_MAX - c[OPP[key]], unit: '%', step: 1 });
    const fitFrame = async () => {
      const size = await PZ.imageSize(el.src, E.doc);
      if (!size || !size.w || !size.h) { PZ.toast(t('The picture could not be loaded.'), { type: 'warn' }); return; }
      const k = el.crop || { t: 0, r: 0, b: 0, l: 0 };
      const ratio = (size.w * (100 - k.l - k.r)) / (size.h * (100 - k.t - k.b));
      live('Fit frame to picture', () => {
        const h2 = Math.max(1, Math.round((el.w - 2 * el.bw) / ratio + 2 * el.bw));
        el.y = Math.round(el.y + (el.h - h2) / 2); el.h = h2;
      }, true);
    };
    return h('div', null,
      h('label', { class: 'ui-label', text: t('Crop') }),
      h('div', { class: 'ed-grid2' }, n('t', t('Top')), n('b', t('Bottom')), n('l', t('Left')), n('r', t('Right'))),
      h('div', { class: 'ui-btn-row' },
        PZ.edStage.cropping() === el.id
          ? h('button', { class: 'ui-btn ui-small ui-primary', text: t('Done cropping'), onClick: () => PZ.edStage.endCrop() })
          : h('button', { class: 'ui-btn ui-small', title: t('Crop with the mouse on the slide (Enter or double-click)'), onClick: () => PZ.edStage.startCrop(el.id) }, PZ.icon('crop'), h('span', { text: t('Crop on slide') })),
        h('button', { class: 'ui-btn ui-small', text: t('Fit frame to picture'), title: t('Change the frame height so the whole kept part shows, without empty space'), onClick: fitFrame }),
        el.crop ? h('button', { class: 'ui-btn ui-small ui-ghost', text: t('Reset crop'), onClick: () => live('Reset crop', () => { el.crop = null; }, true) }) : null));
  }

  function iconControls(el) {
    return h('div', null,
      ui.row(t('Colour'), ui.color(el.color, set('Icon colour', (v) => { el.color = v || '#000000'; }), { palette: [E.doc.theme.accent, E.doc.theme.color, E.doc.theme.accent2] })),
      /stroke=/.test(el.svg) ? ui.row(t('Line width'), ui.slider(el.sw || 2, set('Icon line width', (v) => { el.sw = v; }), { min: 0.5, max: 4, step: 0.25 })) : null,
      h('button', { class: 'ui-btn ui-small', text: t('Replace icon…'), onClick: () => PZ.edDialogs.icons({ onPick: (svg, name) => live('Replace icon', () => { el.svg = svg; el.name = name; }, true) }) }));
  }

  function positionControls(el) {
    const n = (key, label) => ui.number(el[key], set('Position', (v) => { el[key] = Math.round(v); if (key === 'h' && el.type === 'text') el.autoH = false; }), { label, step: 1 });
    return h('div', null,
      h('div', { class: 'ed-grid2' }, n('x', 'X'), n('y', 'Y'), n('w', t('W')), n('h', t('H'))),
      ui.row(t('Rotation'), ui.number(el.rot, set('Rotate', (v) => { el.rot = v % 360; }), { min: -360, max: 360, unit: '°' })),
      ui.row(t('Opacity'), ui.slider(Math.round(el.opacity * 100), set('Opacity', (v) => { el.opacity = v / 100; }), { min: 0, max: 100, fmt: (v) => v + '%' })),
      ui.row(t('Align'), h('div', { class: 'ui-btn-group' },
        ui.iconBtn('align-left', t('Align left'), () => E.align('left')), ui.iconBtn('align-center', t('Center horizontally'), () => E.align('hcenter')), ui.iconBtn('align-right', t('Align right'), () => E.align('right')),
        ui.iconBtn('valign-top', t('Align top'), () => E.align('top')), ui.iconBtn('valign-middle', t('Center vertically'), () => E.align('vcenter')), ui.iconBtn('valign-bottom', t('Align bottom'), () => E.align('bottom')))),
      ui.row(t('Layer'), h('div', { class: 'ui-btn-group' },
        ui.iconBtn('bring-front', t('Bring to front'), () => E.zorder('front')), ui.iconBtn('chevron-up', t('Bring forward'), () => E.zorder('forward')),
        ui.iconBtn('chevron-down', t('Send backward'), () => E.zorder('backward')), ui.iconBtn('send-back', t('Send to back'), () => E.zorder('back')))));
  }

  function animControls(el) {
    const a = el.anim;
    const box = h('div');
    const opts = [{ value: '', label: t('None') }].concat(fxOptions(['in', 'emph', 'out'], E.doc, a && a.effect));
    box.appendChild(ui.row(t('Effect'), ui.pick(a ? a.effect : '', opts, (v) => {
      if (v === SHOW_FUN) { E.setFun(true); return; }
      live('Animation', (d, s) => {
        if (!v) { el.anim = null; return; }
        const f = PZ.getEffect(E.doc, v);
        const maxOrder = Math.max(0, ...s.els.filter((x) => x.anim && x !== el).map((x) => x.anim.order || 0));
        el.anim = Object.assign({ trigger: 'click', delay: 0, easing: '', order: maxOrder + 1 }, el.anim || {}, { effect: v, duration: (f && f.duration) || 600 });
      }, true);
      setTimeout(() => PZ.edStage.previewAnim(el), 60);
    }, { previewDelay: 200, onPreview: (v) => PZ.edStage.previewEffect([el], v !== SHOW_FUN && v) })));
    if (a) {
      box.appendChild(ui.trigger(a.trigger, set('Animation start', (v) => { a.trigger = v; }, true), { first: ui.firstAnim(E.doc, E.slide(), el) }));
      box.appendChild(ui.row(t('Duration'), ui.slider(a.duration, set('Animation duration', (v) => { a.duration = v; }), { min: 100, max: 5000, step: 50, fmt: (v) => (v / 1000).toFixed(2) + ' s' })));
      box.appendChild(ui.row(t('Delay'), ui.slider(a.delay, set('Animation delay', (v) => { a.delay = v; }), { min: 0, max: 5000, step: 50, fmt: (v) => (v / 1000).toFixed(2) + ' s' })));
      box.appendChild(ui.row(t('Easing'), ui.select(a.easing, easingOptions(true), set('Animation easing', (v) => { a.easing = v; }))));
    } else box.appendChild(h('p', { class: 'ed-hint', text: t('Choose an effect to set when and how it plays, or design one in the Studio.') }));
    // same buttons as the slide transition, whether or not the element is animated yet
    box.appendChild(h('div', { class: 'ui-btn-row' },
      h('button', { class: 'ui-btn ui-small', disabled: !a, onClick: () => PZ.edStage.previewAnim(el) }, PZ.icon('play'), h('span', { text: t('Preview') })),
      h('button', { class: 'ui-btn ui-small ui-ghost', onClick: () => PZ.edStudio.open({ scope: 'element', select: a ? a.effect : '' }) }, PZ.icon('sparkles'), h('span', { text: t('Studio') }))));
    return box;
  }

  // ---------------------------------------------------------------- paste properties
  /** Header button opening the Paste properties chooser (disabled until some properties were copied). */
  function pastePropsBtn() {
    const b = ui.iconBtn('paste', t('Paste properties… ({key} pastes the last choice)', { key: E.PROPS_KEYS.paste }), (e) => I.pasteProps(e.currentTarget));
    b.disabled = !E.props();
    return b;
  }

  /** What the copied properties p hold for group g, in a few words. */
  function propSummary(p, g) {
    if (g === 'pos') return `X ${Math.round(p.x)} · Y ${Math.round(p.y)}`;
    if (g === 'size') return `${Math.round(p.w)} × ${Math.round(p.h)}`;
    if (g === 'rot') return Math.round(p.rot) + '°';
    if (g === 'text') return !p.style ? '' : p.ts && E.doc.textStyles[p.ts] ? tsName(p.ts) : `${t(p.style.font)} · ${Math.round(p.style.size)} px`;
    if (g === 'look') return [t('Opacity') + ' ' + Math.round(p.opacity * 100) + '%', p.shadow ? t('Shadow') : '', p.type === 'shape' ? t('Fill') : p.type === 'icon' ? t('Colour') : p.type === 'image' && p.bw ? t('Border') : ''].filter(Boolean).join(' · ');
    if (g === 'anim') { const f = p.anim && PZ.getEffect(E.doc, p.anim.effect); return !p.anim ? t('None') : f ? PZ.fxName(f) : p.anim.effect; }
    return '';
  }

  /** Paste properties chooser, under anchor (or at {x, y}): one checkbox per group, the last choice ticked. */
  I.pasteProps = function (anchor, at) {
    const p = E.props(), els = E.selected();
    if (!p || !els.length) { E.pasteProps(); return; }
    const last = E.propGroups();
    const from = p.type === 'text' ? (p.ts && E.doc.textStyles[p.ts] ? tsName(p.ts) : t('Text')) : p.type === 'shape' ? t((PZ.SHAPES[p.shape] || {}).name || 'Shape') : t(p.type === 'icon' ? 'Icon' : 'Image');
    const boxes = [];
    const rows = PZ.PROP_GROUPS.map((g) => {
      const ok = els.some((el) => PZ.canPasteProps(p, el, g.id));
      const box = h('input', { type: 'checkbox', checked: ok && last.includes(g.id), disabled: !ok, dataset: { g: g.id } });
      boxes.push(box);
      return h('label', { class: 'ed-props-row' + (ok ? '' : ' ed-off'), title: ok ? '' : t('The selection cannot take this') }, box,
        h('span', { text: t(g.name) }), h('span', { class: 'ed-props-val', text: ok ? propSummary(p, g.id) : '' }));
    });
    const go = () => { pop.close(); E.pasteProps(boxes.filter((b) => b.checked).map((b) => b.dataset.g)); };
    const btn = h('button', { class: 'ui-btn ui-small ui-primary', onClick: go }, PZ.icon('paste'), h('span', { text: t('Paste') }));
    // every group the selection can take, ticked or not; the ticked choice stays the one Ctrl+Alt+V repeats
    const all = h('button', { class: 'ui-btn ui-small', title: t('Paste everything the selection can take, whatever is ticked'),
      onClick: () => { pop.close(); E.pasteProps(PZ.PROP_GROUPS.map((g) => g.id), { remember: false }); } }, PZ.icon('paste'), h('span', { text: t('Paste all') }));
    const body = h('div', { class: 'ed-pop-pad ed-props' },
      h('div', { class: 'ui-menu-head', text: t('Paste properties') }),
      h('p', { class: 'ed-hint', text: t('From: {what}', { what: from }) }),
      rows,
      h('div', { class: 'ed-props-btns' }, all, btn),
      h('p', { class: 'ed-hint', text: t('{key} pastes this choice again without opening this list.', { key: E.PROPS_KEYS.paste }) }));
    body.addEventListener('keydown', (e) => {
      e.stopPropagation(); // arrows and Enter belong to this list, not to the slide
      if (e.key === 'Enter') { e.preventDefault(); go(); }
    });
    const pop = ui.popover(anchor, body, at ? { at } : { align: 'right' });
    btn.focus();
  };

  function multiPanel(els) {
    head(t('{n} elements', { n: els.length }), [pastePropsBtn(), ui.iconBtn('copy', t('Duplicate'), () => E.duplicateSel()), ui.iconBtn('trash', t('Delete'), () => E.deleteSel())]);
    pane.appendChild(ui.section('Align & distribute', h('div', null,
      ui.row(t('Align'), h('div', { class: 'ui-btn-group' },
        ui.iconBtn('align-left', t('Align left'), () => E.align('left')), ui.iconBtn('align-center', t('Center horizontally'), () => E.align('hcenter')), ui.iconBtn('align-right', t('Align right'), () => E.align('right')),
        ui.iconBtn('valign-top', t('Align top'), () => E.align('top')), ui.iconBtn('valign-middle', t('Center vertically'), () => E.align('vcenter')), ui.iconBtn('valign-bottom', t('Align bottom'), () => E.align('bottom')))),
      ui.row(t('Distribute'), h('div', { class: 'ui-btn-group' }, ui.iconBtn('align-h', t('Distribute horizontally'), () => E.align('hdist')), ui.iconBtn('align-v', t('Distribute vertically'), () => E.align('vdist')))),
      ui.row(t('Layer'), h('div', { class: 'ui-btn-group' }, ui.iconBtn('bring-front', t('Bring to front'), () => E.zorder('front')), ui.iconBtn('send-back', t('Send to back'), () => E.zorder('back')))))));
    pane.appendChild(ui.section('Animate together', h('div', null,
      ui.row(t('Effect'), ui.pick('', [{ value: '', label: t('Choose…') }].concat(fxOptions(['in', 'emph', 'out'], E.doc)), (v) => {
        if (v === SHOW_FUN) { E.setFun(true); return; }
        live('Animate selection', (d, s) => {
          const base = Math.max(0, ...s.els.filter((x) => x.anim && !els.includes(x)).map((x) => x.anim.order || 0));
          els.slice().sort((p, q) => p.y - q.y || p.x - q.x).forEach((x, i) => { x.anim = v ? { effect: v, trigger: i ? 'after' : 'click', duration: (PZ.getEffect(E.doc, v) || {}).duration || 600, delay: 0, easing: '', order: base + i + 1 } : null; });
        }, true);
      }, { previewDelay: 200, onPreview: (v) => PZ.edStage.previewEffect(els.slice().sort((p, q) => p.y - q.y || p.x - q.x), v !== SHOW_FUN && v) })),
      h('p', { class: 'ed-hint', text: t('One click plays them one after the other, top to bottom.') }))));
    animOrderSection();
    const texts = els.filter((x) => x.type === 'text');
    if (texts.length) {
      const same = texts.every((x) => (x.ts || '') === (texts[0].ts || '')) ? texts[0].ts || '' : '*';
      pane.appendChild(ui.section('Text style', h('div', null,
        ui.row(t('Text style'), ui.pick(same, tsOptions([same === '*' ? { value: '*', label: t('Mixed') } : null, custom()].filter(Boolean)),
          (v) => { if (v !== '*') useStyle(texts, v); }, tsPick),
        ui.iconBtn('sliders', t('Edit text styles…'), () => PZ.edDialogs.textStyles({ select: same === '*' ? '' : same }))),
        h('p', { class: 'ed-hint', text: tn('Applies to the {n} selected text.', 'Applies to the {n} selected texts.', texts.length) })), { open: true }));
    }
    pane.appendChild(ui.section('Appearance', ui.row(t('Opacity'), ui.slider(Math.round(els[0].opacity * 100), set('Opacity', (v) => els.forEach((x) => { x.opacity = v / 100; })), { min: 0, max: 100, fmt: (v) => v + '%' }))));
  }
})(window.PZ = window.PZ || {});
