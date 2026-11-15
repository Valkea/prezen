/* PrezEn · editor/stage: the slide canvas. Select, move (with snapping), resize, rotate, edit text in place. */
(function (PZ) {
  'use strict';
  const h = PZ.h, E = PZ.ed;
  const S = (PZ.edStage = {});
  let canvas, stage, host, overlay, k = 0.5;
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
    new ResizeObserver(() => { if (E.zoom === 'fit') layout(); }).observe(canvas);
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
    const pct = h('button', { class: 'ed-zoom-pct', title: 'Fit to window', text: (E.zoom === 'fit' ? 'Fit · ' : '') + Math.round(k * 100) + '%', onClick: () => S.setZoom('fit') });
    return h('span', { class: 'ed-zoom' },
      h('button', { class: 'ed-zoom-btn', title: 'Zoom out (Ctrl+wheel)', text: '−', onClick: () => S.setZoom(PZ.clamp(k / 1.25, 0.1, 4)) }), pct,
      h('button', { class: 'ed-zoom-btn', title: 'Zoom in (Ctrl+wheel)', text: '+', onClick: () => S.setZoom(PZ.clamp(k * 1.25, 0.1, 4)) }));
  };

  /** Re-render the current slide. */
  S.render = function () {
    if (E.editing) return; // never destroy the text being typed; endEdit re-renders
    host.textContent = '';
    host.appendChild(PZ.renderSlide(E.doc, E.slide(), 'edit'));
    layout();
    fitTexts();
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
        f.appendChild(h('div', { class: 'ed-rot', dataset: { handle: 'rot' }, title: 'Rotate (Shift: 15° steps)' }));
        f.appendChild(h('div', { class: 'ed-size-tag', text: `${Math.round(el.w)} × ${Math.round(el.h)}${el.rot ? ' · ' + Math.round(el.rot) + '°' : ''}` }));
      }
      if (el.locked) f.appendChild(h('div', { class: 'ed-lock-tag' }, PZ.icon('lock')));
      if (el.anim) f.appendChild(h('div', { class: 'ed-anim-tag', title: 'Animated' }, PZ.icon('sparkles')));
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
    else if (el.type === 'image') PZ.edDialogs.image({ title: 'Replace image', onPick: (ref) => E.update('Replace image', () => { el.src = ref; }) });
    else if (el.type === 'icon') PZ.edDialogs.icons({ onPick: (svg, name) => E.update('Replace icon', () => { el.svg = svg; el.name = name; }) });
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
      has ? { label: 'Cut', icon: 'x', kbd: 'Ctrl+X', run: () => E.cutSel() } : null,
      has ? { label: 'Copy', icon: 'copy', kbd: 'Ctrl+C', run: () => E.copySel() } : null,
      { label: 'Paste', icon: 'file-text', kbd: 'Ctrl+V', run: () => E.paste() },
      has ? { label: 'Duplicate', icon: 'copy', kbd: 'Ctrl+D', run: () => E.duplicateSel() } : null,
      has ? '-' : null,
      has ? { label: 'Bring to front', icon: 'bring-front', kbd: 'Ctrl+Shift+]', run: () => E.zorder('front') } : null,
      has ? { label: 'Bring forward', icon: 'chevron-up', kbd: 'Ctrl+]', run: () => E.zorder('forward') } : null,
      has ? { label: 'Send backward', icon: 'chevron-down', kbd: 'Ctrl+[', run: () => E.zorder('backward') } : null,
      has ? { label: 'Send to back', icon: 'send-back', kbd: 'Ctrl+Shift+[', run: () => E.zorder('back') } : null,
      one ? '-' : null,
      one ? { label: one.locked ? 'Unlock' : 'Lock', icon: one.locked ? 'unlock' : 'lock', run: () => E.commit(one.locked ? 'Unlock' : 'Lock', () => { one.locked = !one.locked; }) } : null,
      one && (one.type === 'text' || one.type === 'shape') ? { label: 'Edit text', icon: 'type', kbd: 'Enter', run: () => S.startEdit(one.id, true) } : null,
      has ? '-' : null,
      has ? { label: 'Delete', icon: 'trash', kbd: 'Del', danger: true, run: () => E.deleteSel() } : null,
      !has ? '-' : null,
      !has ? { label: 'Add text here', icon: 'type', run: () => { const p = toLogical(e); E.insertText({ x: Math.round(p.x), y: Math.round(p.y) }); } } : null,
      !has ? { label: 'Slide background…', icon: 'image', run: () => PZ.edInspector.render() } : null,
    ], { at });
  }

  async function onDrop(e) {
    e.preventDefault();
    canvas.classList.remove('ed-drop');
    const p = toLogical(e);
    const files = Array.from(e.dataTransfer.files || []);
    const pres = files.find((f) => /\.(html?|json)$/i.test(f.name));
    if (pres) {
      try {
        const doc = PZ.parseFileText(await pres.text());
        if (await PZ.ui.confirm('Open presentation', `Open “${doc.title}” from ${pres.name}? The current presentation stays in your browser library.`, 'Open')) E.load(doc);
      } catch (err) { PZ.toast('Cannot open this file: ' + err.message, { type: 'error' }); }
      return;
    }
    const imgs = files.filter((f) => /^image\//.test(f.type));
    for (const f of imgs) E.insertImage(PZ.addAsset(E.doc, await PZ.imageFileToDataUrl(f)), p);
    if (!imgs.length) {
      const url = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').trim();
      if (/^https?:\/\//.test(url)) E.insertImage(url, p);
    }
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
  S.hasTextSelection = function () {
    const ed = E.editing;
    return !!(ed && ed.range && !ed.range.collapsed);
  };

  /** Preview an element animation on the stage. */
  S.previewAnim = function (el) {
    const node = nodeOf(el.id);
    if (!node || !el.anim) return;
    const a = PZ.animateElement(node, el.anim, E.doc, {});
    if (a) a.finished.catch(() => {}).then(() => a.cancel());
  };
})(window.PZ = window.PZ || {});
