/* PrezEn · editor/stage: the slide canvas. Select, move (with snapping), resize, rotate, edit text in place. */
(function (PZ) {
  'use strict';
  const h = PZ.h, E = PZ.ed, t = PZ.t;
  const S = (PZ.edStage = {});
  let canvas, stage, host, overlay, k = 0.5, resizeObs = null, globalsBound = false;
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const DIRS = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };

  S.mount = function (container) {
    canvas = container;
    host = h('div', { class: 'ed-slide-host' });
    overlay = h('div', { class: 'ed-overlay' });
    stage = h('div', { class: 'ed-stage' }, host, overlay);
    canvas.appendChild(stage);
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('dblclick', onDbl);
    stage.addEventListener('contextmenu', onContext);
    canvas.addEventListener('pointerdown', (e) => { if (e.target === canvas && e.button === 0) { if (E.editing) S.endEdit(); E.select([]); } });
    canvas.addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      S.setZoom(PZ.clamp(k * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.1, 4));
    }, { passive: false });
    canvas.addEventListener('dragover', (e) => { e.preventDefault(); canvas.classList.add('ed-drop'); });
    canvas.addEventListener('dragleave', () => canvas.classList.remove('ed-drop'));
    canvas.addEventListener('drop', onDrop);
    if (resizeObs) resizeObs.disconnect(); // mount runs again when the UI is rebuilt (language change)
    resizeObs = new ResizeObserver(() => { if (E.zoom === 'fit') layout(); });
    resizeObs.observe(canvas);
    if (globalsBound) return;
    globalsBound = true;
    document.addEventListener('selectionchange', () => {
      const ed = E.editing;
      const sel = window.getSelection();
      if (ed && sel.rangeCount && ed.node.contains(sel.anchorNode)) ed.range = sel.getRangeAt(0).cloneRange();
    });
    if (document.fonts) document.fonts.addEventListener('loadingdone', () => { if (!E.editing) S.render(); });
  };

  function layout() {
    const W = E.doc.w, H = E.doc.h;
    if (E.zoom === 'fit') {
      const cw = canvas.clientWidth - 64, ch = canvas.clientHeight - 64;
      k = Math.max(0.05, Math.min(cw / W, ch / H));
    } else k = E.zoom;
    stage.style.width = W * k + 'px';
    stage.style.height = H * k + 'px';
    host.style.width = W + 'px';
    host.style.height = H + 'px';
    host.style.transform = `scale(${k})`;
    host.style.setProperty('--k', k);
    S.renderOverlay();
    if (E.renderStatus) E.renderStatus();
  }
  S.scale = () => k;

  S.setZoom = function (z) { E.zoom = z; layout(); };
  S.zoomControl = function () {
    const pct = h('button', { class: 'ed-zoom-pct', title: t('Fit to window'), text: (E.zoom === 'fit' ? t('Fit') + ' · ' : '') + Math.round(k * 100) + '%', onClick: () => S.setZoom('fit') });
    return h('span', { class: 'ed-zoom' },
      h('button', { class: 'ed-zoom-btn', title: t('Zoom out (Ctrl+wheel)'), text: '−', onClick: () => S.setZoom(PZ.clamp(k / 1.25, 0.1, 4)) }), pct,
      h('button', { class: 'ed-zoom-btn', title: t('Zoom in (Ctrl+wheel)'), text: '+', onClick: () => S.setZoom(PZ.clamp(k * 1.25, 0.1, 4)) }));
  };

  /** Re-render the current slide. */
  S.render = function () {
    if (E.editing) return; // never destroy the text being typed; endEdit re-renders
    host.textContent = '';
    host.appendChild(PZ.renderSlide(E.doc, E.slide(), 'edit'));
    layout();
    fitTexts();
    if (fontPreview) { const el = E.find(fontPreview.id); if (el && el.style) applyFontPreview(el); else fontPreview = null; }
  };

  function nodeOf(id) { return host.querySelector(`.pz-el[data-id="${CSS.escape(id)}"]`); }

  /** Text boxes with autoH follow their content height. */
  function contentHeight(node) {
    const box = node && node.querySelector('.pz-textbox');
    const t = box && box.querySelector('.pz-text');
    if (!t) return 0;
    const pad = parseFloat(box.style.padding) || 0;
    return t.offsetHeight + pad * 2;
  }
  function fitText(el, node) {
    if (el.type !== 'text' || !el.autoH) return false;
    const ch = Math.ceil(contentHeight(node || nodeOf(el.id)));
    if (ch && Math.abs(ch - el.h) > 1) { el.h = ch; PZ.placeElement(node || nodeOf(el.id), el); return true; }
    return false;
  }
  function fitTexts() {
    let changed = false;
    E.slide().els.forEach((el) => { if (fitText(el)) changed = true; });
    if (changed) { S.renderOverlay(); E.refresh('thumb'); }
  }

  // ---------------------------------------------------------------- overlay (selection frames, handles, guides)
  S.renderOverlay = function (guides) {
    if (!overlay) return;
    overlay.textContent = '';
    if (crop) {
      const el = E.one();
      // leave crop mode when the selection, the picture or its layout changed under it (undo, inspector…)
      if (el && el.id === crop.id && el.src === crop.src && !el.locked && !cropMismatch(el, crop.nw, crop.nh)) { drawCrop(el); return; }
      crop = null;
      if (PZ.edInspector) E.refresh('inspector');
    }
    const els = E.selected();
    const single = els.length === 1 ? els[0] : null;
    for (const el of els) {
      const f = h('div', { class: 'ed-frame' + (el.locked ? ' ed-locked' : '') + (E.editing && E.editing.id === el.id ? ' ed-editing' : '') });
      f.style.left = el.x * k + 'px'; f.style.top = el.y * k + 'px';
      f.style.width = el.w * k + 'px'; f.style.height = el.h * k + 'px';
      if (el.rot) f.style.transform = `rotate(${el.rot}deg)`;
      if (single && !el.locked && !E.editing) {
        const isLine = el.type === 'shape' && PZ.SHAPES[el.shape] && PZ.SHAPES[el.shape].line;
        for (const hd of HANDLES) {
          if (isLine && hd !== 'e' && hd !== 'w') continue;
          if (el.type === 'text' && el.autoH && (hd === 'n' || hd === 's')) continue;
          f.appendChild(h('div', { class: 'ed-h ed-h-' + hd, dataset: { handle: hd } }));
        }
        f.appendChild(h('div', { class: 'ed-rot', dataset: { handle: 'rot' }, title: t('Rotate (Shift: 15° steps)') }));
        f.appendChild(h('div', { class: 'ed-size-tag', text: `${Math.round(el.w)} × ${Math.round(el.h)}${el.rot ? ' · ' + Math.round(el.rot) + '°' : ''}` }));
      }
      if (el.locked) f.appendChild(h('div', { class: 'ed-lock-tag' }, PZ.icon('lock')));
      if (el.anim) f.appendChild(h('div', { class: 'ed-anim-tag', title: t('Animated') }, PZ.icon('sparkles')));
      overlay.appendChild(f);
    }
    if (els.length > 1) {
      const b = E.bbox(els);
      overlay.appendChild(h('div', { class: 'ed-group-frame', style: { left: b.x * k + 'px', top: b.y * k + 'px', width: b.w * k + 'px', height: b.h * k + 'px' } }));
    }
    (guides || []).forEach((g) => overlay.appendChild(h('div', { class: 'ed-guide ' + (g.x != null ? 'ed-gv' : 'ed-gh'), style: g.x != null ? { left: g.x * k + 'px' } : { top: g.y * k + 'px' } })));
  };

  function toLogical(e) {
    const r = stage.getBoundingClientRect();
    return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
  }

  // ---------------------------------------------------------------- pointer interactions
  function onDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.ed-crop-bar')) return;
    if (crop) {
      const c = e.target.closest('[data-crop]');
      if (c) { e.preventDefault(); e.stopPropagation(); startCropDrag(e, c.dataset.crop); return; }
      S.endCrop();
    }
    const handle = e.target.closest('[data-handle]');
    if (handle) { e.preventDefault(); e.stopPropagation(); if (handle.dataset.handle === 'rot') startRotate(e); else startResize(e, handle.dataset.handle); return; }
    if (E.editing) {
      const n = e.target.closest('.pz-el');
      if (n && n.dataset.id === E.editing.id) return; // caret placement inside the text being edited
      S.endEdit();
    }
    const node = e.target.closest('.pz-el');
    const el = node && E.find(node.dataset.id);
    if (el) {
      e.preventDefault();
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        E.select(E.sel.includes(el.id) ? E.sel.filter((i) => i !== el.id) : E.sel.concat(el.id));
        return;
      }
      if (!E.sel.includes(el.id)) E.select([el.id]);
      if (!el.locked) startMove(e);
    } else {
      e.preventDefault();
      if (!e.shiftKey) E.select([]);
      startMarquee(e);
    }
  }

  function drag(e, onMove, onUp) {
    const target = e.target;
    try { target.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const move = (ev) => onMove(ev);
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      onUp(ev);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function snapTargets(exclude) {
    const W = E.doc.w, H = E.doc.h;
    const xs = [0, W / 2, W], ys = [0, H / 2, H];
    for (const o of E.slide().els) {
      if (exclude.has(o.id)) continue;
      xs.push(o.x, o.x + o.w / 2, o.x + o.w);
      ys.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    return { xs, ys };
  }
  function snapAxis(values, targets, thr) {
    let best = null;
    for (const v of values) for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t };
    }
    return best;
  }

  function startMove(e) {
    const p0 = toLogical(e);
    const items = E.selected().filter((x) => !x.locked).map((el) => ({ el, x: el.x, y: el.y, node: nodeOf(el.id) }));
    if (!items.length) return;
    const box0 = E.bbox(items.map((i) => i.el));
    const targets = snapTargets(new Set(items.map((i) => i.el.id)));
    let moved = false, dx = 0, dy = 0;
    drag(e, (ev) => {
      const p = toLogical(ev);
      dx = p.x - p0.x; dy = p.y - p0.y;
      if (!moved && Math.hypot(dx, dy) * k < 3) return;
      moved = true;
      if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const guides = [];
      if (!ev.altKey) {
        const thr = 7 / k;
        const sx = snapAxis([box0.x + dx, box0.x + box0.w / 2 + dx, box0.x + box0.w + dx], targets.xs, thr);
        const sy = snapAxis([box0.y + dy, box0.y + box0.h / 2 + dy, box0.y + box0.h + dy], targets.ys, thr);
        if (sx) { dx += sx.d; guides.push({ x: sx.at }); }
        if (sy) { dy += sy.d; guides.push({ y: sy.at }); }
      }
      dx = Math.round(dx); dy = Math.round(dy);
      items.forEach((i) => { i.el.x = i.x + dx; i.el.y = i.y + dy; if (i.node) PZ.placeElement(i.node, i.el); });
      S.renderOverlay(guides);
    }, () => {
      if (!moved) return;
      items.forEach((i) => { i.el.x = i.x; i.el.y = i.y; });
      E.commit('Move', () => items.forEach((i) => { i.el.x = i.x + dx; i.el.y = i.y + dy; }), { refresh: 'stage thumb inspector' });
    });
  }

  function startResize(e, hd) {
    const el = E.one();
    if (!el) return;
    const p0 = toLogical(e);
    const o = { x: el.x, y: el.y, w: el.w, h: el.h, autoH: el.autoH, size: el.style ? el.style.size : 0 };
    const [sx, sy] = DIRS[hd];
    const th = (el.rot * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
    const cx0 = o.x + o.w / 2, cy0 = o.y + o.h / 2;
    const keepRatio = (ev) => (sx && sy) && (ev.shiftKey !== (el.type === 'image' || el.type === 'icon'));
    let node = nodeOf(el.id);
    const targets = snapTargets(new Set([el.id]));
    drag(e, (ev) => {
      const p = toLogical(ev);
      const ddx = p.x - p0.x, ddy = p.y - p0.y;
      const lx = ddx * cos + ddy * sin, ly = -ddx * sin + ddy * cos; // pointer delta in the element's own axes
      let w = sx ? Math.max(8, o.w + sx * lx) : o.w;
      let hh = sy ? Math.max(8, o.h + sy * ly) : o.h;
      if (keepRatio(ev)) { const r = Math.max(w / o.w, hh / o.h); w = o.w * r; hh = o.h * r; }
      const guides = [];
      if (!el.rot && !ev.altKey && !keepRatio(ev)) { // snap the moving edges when not rotated
        const thr = 7 / k;
        if (sx) { const edge = sx > 0 ? o.x + w : o.x + o.w - w; const s = snapAxis([edge], targets.xs, thr); if (s) { w += sx * s.d; guides.push({ x: s.at }); } }
        if (sy) { const edge = sy > 0 ? o.y + hh : o.y + o.h - hh; const s = snapAxis([edge], targets.ys, thr); if (s) { hh += sy * s.d; guides.push({ y: s.at }); } }
      }
      // keep the opposite side fixed in slide space
      const ax = (-sx * o.w) / 2, ay = (-sy * o.h) / 2;
      const axw = cx0 + ax * cos - ay * sin, ayw = cy0 + ax * sin + ay * cos;
      const bx = (sx * w) / 2, by = (sy * hh) / 2;
      const cx = axw + bx * cos - by * sin, cy = ayw + bx * sin + by * cos;
      el.w = Math.round(w); el.h = Math.round(hh);
      el.x = Math.round(cx - w / 2); el.y = Math.round(cy - hh / 2);
      if (el.type === 'text' && sy) el.autoH = false;
      const fresh = PZ.renderElement(E.doc, el, 'edit');
      node.replaceWith(fresh); node = fresh;
      if (el.type === 'text' && el.autoH) fitText(el, node);
      S.renderOverlay(guides);
    }, () => {
      const fin = { x: el.x, y: el.y, w: el.w, h: el.h, autoH: el.autoH };
      Object.assign(el, { x: o.x, y: o.y, w: o.w, h: o.h, autoH: o.autoH });
      if (fin.w === o.w && fin.h === o.h && fin.x === o.x && fin.y === o.y) { S.render(); return; }
      E.commit('Resize', () => Object.assign(el, fin), { refresh: 'stage thumb inspector' });
    });
  }

  function startRotate(e) {
    const el = E.one();
    if (!el) return;
    const c = { x: el.x + el.w / 2, y: el.y + el.h / 2 };
    const r0 = el.rot;
    const body = nodeOf(el.id).querySelector('.pz-body');
    drag(e, (ev) => {
      const p = toLogical(ev);
      let a = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
      if (ev.shiftKey) a = Math.round(a / 15) * 15;
      else for (const t of [0, 90, 180, 270, 360, -90]) if (Math.abs(a - t) < 3) a = t;
      a = Math.round(((a % 360) + 540) % 360 - 180);
      el.rot = a;
      body.style.transform = a ? `rotate(${a}deg)` : '';
      S.renderOverlay();
    }, () => {
      const fin = el.rot;
      el.rot = r0;
      if (fin !== r0) E.commit('Rotate', () => { el.rot = fin; }, { refresh: 'stage thumb inspector' });
    });
  }

  function startMarquee(e) {
    const p0 = toLogical(e);
    const base = E.sel.slice();
    let box = null;
    drag(e, (ev) => {
      const p = toLogical(ev);
      const x = Math.min(p.x, p0.x), y = Math.min(p.y, p0.y), w = Math.abs(p.x - p0.x), hh = Math.abs(p.y - p0.y);
      if (!box) { if (w * k < 4 && hh * k < 4) return; box = h('div', { class: 'ed-marquee' }); }
      const hit = E.slide().els.filter((o) => !o.locked && o.x < x + w && o.x + o.w > x && o.y < y + hh && o.y + o.h > y).map((o) => o.id);
      E.sel = Array.from(new Set(base.concat(hit)));
      S.renderOverlay();
      Object.assign(box.style, { left: x * k + 'px', top: y * k + 'px', width: w * k + 'px', height: hh * k + 'px' });
      overlay.appendChild(box);
    }, () => { if (box) box.remove(); E.refresh('overlay inspector'); });
  }

  function onDbl(e) {
    if (e.target.closest('.ed-crop-bar')) return;
    if (e.target.closest('.ed-crop')) { S.endCrop(); return; }
    const node = e.target.closest('.pz-el');
    const el = node && E.find(node.dataset.id);
    if (!el) {
      const p = toLogical(e);
      const d = E.doc;
      E.insertText({ x: Math.round(p.x - d.w * 0.15), y: Math.round(p.y - 30), w: Math.round(d.w * 0.3) });
      return;
    }
    if (el.locked) return;
    if (el.type === 'text' || el.type === 'shape') S.startEdit(el.id, false, e);
    else if (el.type === 'image' && el.src) S.startCrop(el.id);
    else if (el.type === 'image') replaceImage(el);
    else if (el.type === 'icon') PZ.edDialogs.icons({ onPick: (svg, name) => E.update('Replace icon', () => { el.svg = svg; el.name = name; }) });
  }

  function replaceImage(el) {
    PZ.edDialogs.image({ title: t('Replace image'), initial: el.src, onPick: (ref) => E.update('Replace image', () => { el.src = ref; }, { refresh: 'stage thumb inspector' }) });
  }

  function onContext(e) {
    e.preventDefault();
    const node = e.target.closest('.pz-el');
    const el = node && E.find(node.dataset.id);
    if (el && !E.sel.includes(el.id)) E.select([el.id]);
    const at = { x: e.clientX, y: e.clientY };
    const has = E.sel.length > 0;
    const one = E.one();
    PZ.ui.menu(stage, [
      has ? { label: t('Cut'), icon: 'x', kbd: 'Ctrl+X', run: () => E.cutSel() } : null,
      has ? { label: t('Copy'), icon: 'copy', kbd: 'Ctrl+C', run: () => E.copySel() } : null,
      { label: t('Paste'), icon: 'file-text', kbd: 'Ctrl+V', run: () => E.paste() },
      has ? { label: t('Duplicate'), icon: 'copy', kbd: 'Ctrl+D', run: () => E.duplicateSel() } : null,
      has ? '-' : null,
      has ? { label: t('Bring to front'), icon: 'bring-front', kbd: t('Ctrl+Shift+]'), run: () => E.zorder('front') } : null,
      has ? { label: t('Bring forward'), icon: 'chevron-up', kbd: 'Ctrl+]', run: () => E.zorder('forward') } : null,
      has ? { label: t('Send backward'), icon: 'chevron-down', kbd: 'Ctrl+[', run: () => E.zorder('backward') } : null,
      has ? { label: t('Send to back'), icon: 'send-back', kbd: t('Ctrl+Shift+['), run: () => E.zorder('back') } : null,
      one ? '-' : null,
      one ? { label: one.locked ? t('Unlock') : t('Lock'), icon: one.locked ? 'unlock' : 'lock', run: () => E.commit(one.locked ? 'Unlock' : 'Lock', () => { one.locked = !one.locked; }) } : null,
      one && (one.type === 'text' || one.type === 'shape') ? { label: t('Edit text'), icon: 'type', kbd: t('Enter'), run: () => S.startEdit(one.id, true) } : null,
      one && one.type === 'image' && one.src && !one.locked ? { label: crop ? t('Done cropping') : t('Crop picture'), icon: 'crop', kbd: t('Enter'), run: () => (crop ? S.endCrop() : S.startCrop(one.id)) } : null,
      one && one.type === 'image' && !one.locked ? { label: t('Replace image…'), icon: 'image', run: () => replaceImage(one) } : null,
      has ? '-' : null,
      has ? { label: t('Delete'), icon: 'trash', kbd: t('Del'), danger: true, run: () => E.deleteSel() } : null,
      !has ? '-' : null,
      !has ? { label: t('Add text here'), icon: 'type', run: () => { const p = toLogical(e); E.insertText({ x: Math.round(p.x), y: Math.round(p.y) }); } } : null,
      !has ? { label: t('Slide background…'), icon: 'image', run: () => PZ.edInspector.render() } : null,
    ], { at });
  }

  async function onDrop(e) {
    e.preventDefault();
    canvas.classList.remove('ed-drop');
    const p = toLogical(e);
    const files = Array.from(e.dataTransfer.files || []);
    const pdf = files.find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (pdf) { PZ.edPdf.open(pdf); return; }
    const pres = files.find((f) => /\.(html?|json)$/i.test(f.name));
    if (pres) {
      try {
        const doc = await PZ.parseFileText(await pres.text());
        if (!doc) return;
        if (await PZ.ui.confirm(t('Open presentation'), t('Open “{title}” from {file}? The current presentation stays in your browser library.', { title: doc.title, file: pres.name }), t('Open'))) E.load(doc);
      } catch (err) { PZ.toast(t('Cannot open this file: {msg}', { msg: err.message }), { type: 'error' }); }
      return;
    }
    const imgs = files.filter((f) => /^image\//.test(f.type));
    for (const f of imgs) E.insertImage(PZ.addAsset(E.doc, await PZ.imageFileToDataUrl(f)), p);
    if (!imgs.length) {
      const url = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').trim();
      if (/^https?:\/\//.test(url)) E.insertImage(url, p);
    }
  }

  // ---------------------------------------------------------------- crop mode (pictures)
  // While cropping, the frame is exactly the kept part of the picture (fill / fit layouts are converted on entry,
  // which looks the same), so the whole picture's rectangle follows from the frame and the crop percentages:
  // dragging the frame's handles crops, dragging the picture moves it, its round corner handles zoom it.
  let crop = null; // { id, src, nw, nh, img }: the picture being cropped, its natural size, the dimmed copy

  const frameOf = (el) => ({ x: el.x, y: el.y, w: el.w, h: el.h, bw: el.bw, rot: el.rot });
  const minKept = (size) => Math.max(8, (size * (100 - PZ.CROP_MAX)) / 100);

  /** In the element's own axes, relative to its content box (inside the border): the content size and the picture P. */
  function cropGeo(el) {
    const c = el.crop || { t: 0, r: 0, b: 0, l: 0 };
    const W = el.w - 2 * el.bw, H = el.h - 2 * el.bw;
    const pw = (W * 100) / (100 - c.l - c.r), ph = (H * 100) / (100 - c.t - c.b);
    return { W, H, P: { x: (-c.l * pw) / 100, y: (-c.t * ph) / 100, w: pw, h: ph } };
  }

  /** Where the kept part V and the picture P are drawn now (fill / fit / focus), in content box coordinates. */
  function shownGeo(el, nw, nh) {
    const c = el.crop || { t: 0, r: 0, b: 0, l: 0 };
    const W = el.w - 2 * el.bw, H = el.h - 2 * el.bw;
    const RW = (nw * (100 - c.l - c.r)) / 100, RH = (nh * (100 - c.t - c.b)) / 100;
    const s = (el.fit === 'cover' ? Math.max : Math.min)(W / RW, H / RH);
    const [px, py] = (el.pos || '50% 50%').split(' ').map((v) => parseFloat(v) / 100);
    const dw = RW * s, dh = RH * s, ox = (W - dw) * px, oy = (H - dh) * py;
    const P = { x: ox - (c.l / 100) * nw * s, y: oy - (c.t / 100) * nh * s, w: nw * s, h: nh * s };
    const V = el.fit === 'cover' ? { x: 0, y: 0, w: W, h: H } : { x: ox, y: oy, w: dw, h: dh };
    return { V, P, off: Math.max(Math.abs(dw - W), Math.abs(dh - H)) };
  }
  /** True when the kept part does not fill the frame exactly (then crop mode first converts the layout). */
  function cropMismatch(el, nw, nh) { return el.fit !== 'fill' && shownGeo(el, nw, nh).off > 1.5; }

  /** Frame = kept part V, crop = V within the picture P (both in the content box axes of frame o, before the change). */
  function applyCrop(el, o, V, P) {
    const bw = o.bw;
    const w = Math.max(2 * bw + 1, Math.round(V.w + 2 * bw)), hh = Math.max(2 * bw + 1, Math.round(V.h + 2 * bw));
    const vw = Math.min(w - 2 * bw, P.w), vh = Math.min(hh - 2 * bw, P.h);
    const vx = PZ.clamp(V.x + (V.w - vw) / 2, P.x, P.x + P.w - vw), vy = PZ.clamp(V.y + (V.h - vh) / 2, P.y, P.y + P.h - vh);
    const th = (o.rot * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
    const dx = bw + vx + vw / 2 - o.w / 2, dy = bw + vy + vh / 2 - o.h / 2; // new centre, from the old one, in the element's axes
    const cx = o.x + o.w / 2 + dx * cos - dy * sin, cy = o.y + o.h / 2 + dx * sin + dy * cos;
    el.w = w; el.h = hh; el.x = Math.round(cx - w / 2); el.y = Math.round(cy - hh / 2);
    el.crop = PZ.normCrop({ l: ((vx - P.x) / P.w) * 100, r: ((P.x + P.w - vx - vw) / P.w) * 100, t: ((vy - P.y) / P.h) * 100, b: ((P.y + P.h - vy - vh) / P.h) * 100 });
  }

  S.cropping = () => (crop ? crop.id : null);

  S.startCrop = async function (id) {
    let el = E.find(id);
    if (!el || el.type !== 'image' || !el.src || el.locked) return;
    if (E.editing) S.endEdit();
    if (crop && crop.id === id) return;
    const src = el.src;
    const size = await PZ.imageSize(src, E.doc);
    el = E.find(id);
    if (!el || el.src !== src) return;
    if (!size || !size.w || !size.h) { PZ.toast(t('The picture could not be loaded.'), { type: 'warn' }); return; }
    if (cropMismatch(el, size.w, size.h)) {
      const g = shownGeo(el, size.w, size.h), o = frameOf(el);
      E.commit('Crop', () => applyCrop(el, o, g.V, g.P), { refresh: 'stage thumb inspector' });
    }
    const img = h('img', { alt: '', draggable: 'false' });
    PZ.setImgSrc(img, src, E.doc);
    crop = { id, src, nw: size.w, nh: size.h, img };
    E.select([id]);
  };

  S.endCrop = function () {
    if (!crop) return;
    crop = null;
    E.refresh('overlay inspector');
  };

  function drawCrop(el) {
    const { W, H, P } = cropGeo(el), bw = el.bw, px = (v) => v * k + 'px';
    const box = h('div', { class: 'ed-crop', style: { left: px(el.x), top: px(el.y), width: px(el.w), height: px(el.h), transform: el.rot ? `rotate(${el.rot}deg)` : null } });
    // the whole picture, dimmed, with a hole where the element shows the kept part
    const ghost = h('div', { class: 'ed-crop-ghost', dataset: { crop: 'pan' } }, crop.img);
    const a = ((-bw - P.x) / P.w) * 100, b = ((-bw - P.y) / P.h) * 100, c = ((W + bw - P.x) / P.w) * 100, d = ((H + bw - P.y) / P.h) * 100; // the frame, border included
    ghost.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${a}% ${b}%, ${c}% ${b}%, ${c}% ${d}%, ${a}% ${d}%, ${a}% ${b}%)`;
    crop.img.style.transform = el.flip ? 'scaleX(-1)' : '';
    crop.img.style.filter = PZ.imageFilters(el.filters);
    const pic = h('div', { class: 'ed-crop-pic', style: { left: px(bw + P.x), top: px(bw + P.y), width: px(P.w), height: px(P.h) } }, ghost);
    for (const hd of ['nw', 'ne', 'se', 'sw']) pic.appendChild(h('div', { class: 'ed-h ed-zh ed-h-' + hd, dataset: { crop: 'z-' + hd }, title: t('Zoom the picture') }));
    const kept = h('div', { class: 'ed-crop-box', dataset: { crop: 'pan' }, style: { left: px(bw), top: px(bw), width: px(W), height: px(H) } });
    for (const hd of HANDLES) kept.appendChild(h('div', { class: 'ed-h ed-ch ed-h-' + hd, dataset: { crop: 'e-' + hd } }));
    const c0 = el.crop || { t: 0, r: 0, b: 0, l: 0 };
    kept.appendChild(h('div', { class: 'ed-size-tag', text: `${Math.round(el.w)} × ${Math.round(el.h)} · ${t('Crop')} ${[c0.t, c0.r, c0.b, c0.l].map((v) => Math.round(v)).join(' / ')} %` }));
    box.append(pic, kept);
    overlay.appendChild(box);
    overlay.appendChild(h('div', { class: 'ed-crop-bar' },
      PZ.icon('crop'),
      h('span', { text: t('Drag the edges to crop, the picture to move it, its round handles to zoom.') }),
      h('button', { class: 'ui-btn ui-small ui-primary', text: t('Done'), onClick: () => S.endCrop() })));
  }

  /** what: 'pan' (move the picture), 'e-<dir>' (an edge or corner of the kept part), 'z-<corner>' (zoom the picture). */
  function startCropDrag(e, what) {
    const el = E.one();
    if (!el || !crop) return;
    const o = frameOf(el), start = { x: el.x, y: el.y, w: el.w, h: el.h, crop: el.crop };
    const g = cropGeo(el), P0 = g.P, V0 = { x: 0, y: 0, w: g.W, h: g.H };
    const th = (el.rot * Math.PI) / 180, cos = Math.cos(th), sin = Math.sin(th);
    const p0 = toLogical(e);
    let node = nodeOf(el.id), moved = false;
    drag(e, (ev) => {
      const p = toLogical(ev);
      const ddx = p.x - p0.x, ddy = p.y - p0.y;
      if (!moved && Math.hypot(ddx, ddy) * k < 2) return;
      moved = true;
      const lx = ddx * cos + ddy * sin, ly = -ddx * sin + ddy * cos; // pointer delta in the element's own axes
      const V = Object.assign({}, V0), P = Object.assign({}, P0);
      if (what === 'pan') {
        P.x = PZ.clamp(P0.x + lx, V.x + V.w - P.w, V.x);
        P.y = PZ.clamp(P0.y + ly, V.y + V.h - P.h, V.y);
      } else if (what.startsWith('e-')) {
        const [sx, sy] = DIRS[what.slice(2)];
        const mw = minKept(P.w), mh = minKept(P.h);
        if (sx < 0) { const x0 = PZ.clamp(V0.x + lx, P.x, V0.x + V0.w - mw); V.w = V0.x + V0.w - x0; V.x = x0; }
        if (sx > 0) V.w = PZ.clamp(V0.w + lx, mw, P.x + P.w - V0.x);
        if (sy < 0) { const y0 = PZ.clamp(V0.y + ly, P.y, V0.y + V0.h - mh); V.h = V0.y + V0.h - y0; V.y = y0; }
        if (sy > 0) V.h = PZ.clamp(V0.h + ly, mh, P.y + P.h - V0.y);
      } else {
        const [sx, sy] = DIRS[what.slice(2)];
        const ax = sx > 0 ? P0.x : P0.x + P0.w, ay = sy > 0 ? P0.y : P0.y + P0.h; // the opposite corner stays put
        const f0 = Math.max((P0.w + sx * lx) / P0.w, (P0.h + sy * ly) / P0.h);
        const fmin = Math.max(sx > 0 ? (V.x + V.w - ax) / P0.w : (ax - V.x) / P0.w, sy > 0 ? (V.y + V.h - ay) / P0.h : (ay - V.y) / P0.h);
        const fmax = Math.min((V.w * 100) / (P0.w * (100 - PZ.CROP_MAX)), (V.h * 100) / (P0.h * (100 - PZ.CROP_MAX)));
        const f = PZ.clamp(f0, fmin, Math.max(fmin, fmax));
        P.w = P0.w * f; P.h = P0.h * f;
        P.x = sx > 0 ? ax : ax - P.w; P.y = sy > 0 ? ay : ay - P.h;
      }
      applyCrop(el, o, V, P);
      const fresh = PZ.renderElement(E.doc, el, 'edit');
      node.replaceWith(fresh); node = fresh;
      S.renderOverlay();
    }, () => {
      if (!moved) return;
      const fin = { x: el.x, y: el.y, w: el.w, h: el.h, crop: el.crop };
      Object.assign(el, start);
      if (JSON.stringify(fin) === JSON.stringify(start)) { S.render(); return; }
      E.commit('Crop', () => Object.assign(el, fin), { refresh: 'stage thumb inspector' });
    });
  }

  // ---------------------------------------------------------------- text editing
  S.startEdit = function (id, selectAll, ev) {
    const el = E.find(id);
    if (!el || el.locked || (el.type !== 'text' && el.type !== 'shape')) return;
    if (E.editing) S.endEdit();
    E.sel = [id];
    const wrap = nodeOf(id);
    const node = wrap && wrap.querySelector('.pz-text');
    if (!node) return;
    node.contentEditable = 'true';
    node.classList.remove('pz-empty');
    wrap.classList.add('ed-editing-el');
    E.editing = { id, node, wrap, range: null };
    node.focus();
    const sel = window.getSelection();
    let range = null;
    if (!selectAll && ev && document.caretRangeFromPoint) range = document.caretRangeFromPoint(ev.clientX, ev.clientY);
    if (!range || !node.contains(range.startContainer)) { range = document.createRange(); range.selectNodeContents(node); if (!selectAll) range.collapse(false); }
    sel.removeAllRanges();
    sel.addRange(range);
    node.addEventListener('input', onInput);
    node.addEventListener('keydown', onEditKey);
    node.addEventListener('paste', onEditPaste);
    S.renderOverlay();
    PZ.edInspector.render();
  };

  function onInput() {
    const ed = E.editing;
    if (!ed) return;
    const el = E.find(ed.id);
    if (el && fitText(el, ed.wrap)) S.renderOverlay();
  }
  function onEditKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); S.endEdit(); return; }
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopPropagation(); S.indentText(e.shiftKey); return; }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[zy]$/i.test(e.key) && undoMove(/y/i.test(e.key) || e.shiftKey)) { e.preventDefault(); e.stopPropagation(); return; }
    if (((e.ctrlKey || e.metaKey) && /^[sop]$/i.test(e.key)) || e.key === 'F5') return; // save / open / print / present still work
    e.stopPropagation(); // keep the other editor shortcuts out of the text
  }
  function onEditPaste(e) { // paste as plain text, keeping line breaks
    e.preventDefault();
    e.stopPropagation();
    const t = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    document.execCommand('insertText', false, t);
  }

  S.endEdit = function () {
    const ed = E.editing;
    if (!ed) return;
    E.editing = null;
    ed.node.removeEventListener('input', onInput);
    ed.node.removeEventListener('keydown', onEditKey);
    ed.node.removeEventListener('paste', onEditPaste);
    ed.node.contentEditable = 'false';
    const el = E.find(ed.id);
    dropEchoedStyle(ed.node);
    let html = PZ.sanitizeHtml(ed.node.innerHTML).replace(/^(<br>)+$/, '');
    if (!PZ.htmlToText(html).trim() && !/<li/.test(html)) html = '';
    const sel = window.getSelection();
    if (sel.rangeCount && ed.node.contains(sel.anchorNode)) sel.removeAllRanges();
    if (!el) { S.render(); return; }
    if (el.type === 'text' && !html) { E.commit('Delete empty text', (d, s) => { s.els = s.els.filter((x) => x.id !== el.id); }); E.sel = []; return; }
    if (html !== el.html || el.h !== Math.round(el.h)) E.commit('Edit text', () => { el.html = html; }, { refresh: 'stage thumb inspector' });
    else E.refresh('stage inspector');
  };

  /** Rich-text command on the text being edited (bold, colour of the selection…). Returns false when not editing. */
  S.execText = function (cmd, value) {
    const ed = E.editing;
    if (!ed) return false;
    ed.node.focus();
    const sel = window.getSelection();
    if (ed.range) { sel.removeAllRanges(); sel.addRange(ed.range); }
    document.execCommand('styleWithCSS', false, true);
    if (cmd === 'fontSizePx') {
      document.execCommand('fontSize', false, '7');
      PZ.$$('span, font', ed.node).forEach((n) => {
        if (n.getAttribute('size') === '7' || /xxx-large/.test(n.style.fontSize)) { n.removeAttribute('size'); n.style.fontSize = value + 'px'; }
      });
    } else document.execCommand(cmd, false, value);
    onInput();
    return true;
  };
  /**
   * Indent (or outdent) the paragraphs and list items of the selection in the text being edited. List items
   * nest one level (a list inside the list, as browsers do it); outdenting moves them one level up, and a
   * top-level item becomes a plain paragraph. Paragraphs move right in a <blockquote> (sized in player.css);
   * text at the left edge stays.
   */
  S.indentText = function (outdent) {
    const ed = E.editing;
    if (!ed) return false;
    const sel = window.getSelection();
    if (!sel.rangeCount || !ed.node.contains(sel.anchorNode)) {
      if (!ed.range) return false;
      ed.node.focus();
      sel.removeAllRanges();
      sel.addRange(ed.range);
    }
    if (!moveItems(ed, sel.getRangeAt(0), outdent)) {
      document.execCommand('styleWithCSS', false, false); // Firefox then makes a <blockquote>, not an inline margin the sanitizer drops
      document.execCommand(outdent ? 'outdent' : 'indent');
      document.execCommand('styleWithCSS', false, true);
    }
    onInput();
    return true;
  };

  // List items are moved by hand: the browsers' list commands drop the blank lines inside an item, copy styles
  // onto the moved words and, after a few presses, build lists they can no longer outdent.
  const isList = (n) => !!n && (n.nodeName === 'UL' || n.nodeName === 'OL');
  const pathOf = (root, n) => { const p = []; for (; n !== root; n = n.parentNode) p.unshift(Array.prototype.indexOf.call(n.parentNode.childNodes, n)); return p; };
  const nodeAt = (root, p) => p.reduce((n, i) => n.childNodes[i], root);

  /** The list items the range touches, outermost only (an item moves with the items nested in it). */
  function itemsIn(root, range) {
    const found = new Set();
    const add = (n) => { const li = (n.nodeType === 1 ? n : n.parentNode).closest('li'); if (li && root.contains(li)) found.add(li); };
    add(range.startContainer);
    if (!range.collapsed) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if ((n.nodeType === 3 || n.nodeName === 'BR') && range.intersectsNode(n)) add(n);
    }
    const all = [...found];
    return all.filter((li) => !all.some((o) => o !== li && o.contains(li)));
  }

  function indentItem(li) {
    const list = li.parentNode;
    if (!isList(list)) return;
    const prev = li.previousElementSibling;
    let sub = isList(prev) ? prev : prev && isList(prev.lastElementChild) ? prev.lastElementChild : null;
    if (!sub) { sub = document.createElement(list.nodeName); list.insertBefore(sub, li); }
    sub.appendChild(li);
    const next = sub.nextElementSibling; // a nested list right after joins it, as in "two items at the same level"
    if (isList(next) && next.nodeName === sub.nodeName) { sub.append(...next.childNodes); next.remove(); }
  }

  /** Returns the paragraph a top-level item became, if it did. */
  function outdentItem(li) {
    const list = li.parentNode;
    if (!isList(list)) return null;
    const outer = list.parentNode;
    const rest = [];
    for (let n = li.nextSibling; n; n = n.nextSibling) rest.push(n);
    let tail = null; // the items after this one keep their level
    if (rest.some((n) => n.nodeType === 1 || n.nodeValue.trim())) { tail = document.createElement(list.nodeName); tail.append(...rest); }
    let made = null;
    if (isList(outer)) { // <ul><ul><li>
      outer.insertBefore(li, list.nextSibling);
      if (tail) li.after(tail);
    } else if (outer.nodeName === 'LI') { // <li>…<ul><li>
      outer.after(li);
      if (tail) li.appendChild(tail);
    } else { // top level: a plain paragraph
      made = document.createElement('div');
      made.append(...li.childNodes);
      list.after(made);
      if (tail) made.after(tail);
      li.remove();
    }
    if (!list.firstElementChild && !list.textContent.trim()) list.remove();
    return made;
  }

  /**
   * Move the list items of the range one level in or out; false when the range has no list item. The move is
   * done on a copy that then takes the place of the text, so undo can put the original nodes back: the
   * browser's own undo history (the typing before) refers to them.
   */
  function moveItems(ed, range, outdent) {
    const root = ed.node;
    const items = itemsIn(root, range);
    if (!items.length) return false;
    const copy = root.cloneNode(true);
    const twin = (n) => nodeAt(copy, pathOf(root, n));
    let sc = twin(range.startContainer), ec = twin(range.endContainer);
    const so = range.startOffset, eo = range.endOffset;
    for (const li of items.map(twin)) {
      if (!outdent) { indentItem(li); continue; }
      const para = outdentItem(li);
      if (para && sc === li) sc = para;
      if (para && ec === li) ec = para;
    }
    const step = { before: [...root.childNodes], beforeHtml: root.innerHTML, selBefore: [range.startContainer, so, range.endContainer, eo] };
    root.replaceChildren(...copy.childNodes);
    step.after = [...root.childNodes];
    step.afterHtml = root.innerHTML;
    step.selAfter = [sc, so, ec, eo];
    if (step.afterHtml === step.beforeHtml) { root.replaceChildren(...step.before); select(step.selBefore); return true; }
    (ed.undo = ed.undo || []).push(step);
    ed.redo = [];
    select(step.selAfter);
    return true;
  }
  function select([sc, so, ec, eo]) {
    const r = document.createRange();
    try { r.setStart(sc, so); r.setEnd(ec, eo); } catch (err) { return; }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
  /** Undo / redo of an item move, while the text is still as the move left it; false lets the browser undo. */
  function undoMove(redo) {
    const ed = E.editing;
    const from = redo ? ed.redo : ed.undo, to = redo ? ed.undo : ed.redo;
    const step = from && from[from.length - 1];
    if (!step || ed.node.innerHTML !== (redo ? step.beforeHtml : step.afterHtml)) return false;
    from.pop();
    to.push(step);
    ed.node.replaceChildren(...(redo ? step.after : step.before));
    select(redo ? step.selAfter : step.selBefore);
    onInput();
    return true;
  }

  /**
   * Chrome's editing commands wrap moved text in elements repeating the box's own spacing (letter-spacing: 0px)
   * and the editor's caret colour, which would pin it when the box setting changes later. Spacing is only ever
   * set on the whole box, so a value equal to what the element inherits anyway is dropped (and a span, once it
   * has no style left).
   */
  function dropEchoedStyle(root) {
    for (const n of root.querySelectorAll('[style]')) {
      const own = n.style, cs = getComputedStyle(n), up = getComputedStyle(n.parentNode);
      own.removeProperty('caret-color');
      for (const p of ['letter-spacing', 'line-height']) if (own.getPropertyValue(p) && cs.getPropertyValue(p) === up.getPropertyValue(p)) own.removeProperty(p);
      if (own.length) continue;
      if (n.nodeName === 'SPAN') n.replaceWith(...n.childNodes);
      else n.removeAttribute('style');
    }
  }
  S.hasTextSelection = function () {
    const ed = E.editing;
    return !!(ed && ed.range && !ed.range.collapsed);
  };

  /** Preview an element animation on the stage. */
  S.previewAnim = function (el) {
    S.previewEffect([el], el.anim && el.anim.effect);
  };

  let running = [];
  /**
   * Play an effect on elements without changing the doc (hover preview in the inspector). Several
   * elements play one after the other, like "Animate together". A falsy effect just stops the preview.
   */
  S.previewEffect = function (els, effect) {
    running.forEach((a) => a.cancel());
    running = [];
    if (!effect) return;
    const fx = PZ.getEffect(E.doc, effect);
    if (!fx) return;
    let at = 0;
    for (const el of els) {
      const node = nodeOf(el.id);
      if (!node) continue;
      const anim = Object.assign({ delay: 0, easing: '' }, el.anim && el.anim.effect === effect ? el.anim : { duration: fx.duration || 600 }, { effect });
      const a = PZ.animateElement(node, anim, E.doc, { delay: at + (anim.delay || 0) });
      if (!a) continue;
      at += (anim.delay || 0) + (anim.duration || 600);
      running.push(a);
      a.finished.catch(() => {}).then(() => { a.cancel(); running = running.filter((x) => x !== a); });
    }
  };

  let fontPreview = null; // {id, name}: kept so a re-render (e.g. when the hovered web font finishes loading) shows it again
  /** Show a text element in another font without changing the doc; null puts its own font back. */
  S.previewFont = function (el, name) {
    fontPreview = name ? { id: el.id, name } : null;
    if (name) PZ.loadFont(name);
    applyFontPreview(el);
  };
  function applyFontPreview(el) {
    const node = nodeOf(el.id);
    const tx = node && node.querySelector('.pz-text');
    if (tx) tx.style.fontFamily = PZ.fontStack(fontPreview && fontPreview.id === el.id ? fontPreview.name : el.style.font);
  }
})(window.PZ = window.PZ || {});
