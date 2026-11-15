/* PrezEn · editor: app shell, state, undo/redo, commands, keyboard shortcuts, saving. */
(function (PZ) {
  'use strict';
  const h = PZ.h, ui = PZ.ui;
  const MOD = PZ.isMac ? '⌘' : 'Ctrl+';

  const E = (PZ.ed = {
    doc: null, cur: 0, sel: [], undoStack: [], redoStack: [], editing: null, clipboard: null,
    fileHandle: null, fileName: '', mode: 'browser', dirty: false, zoom: 'fit', saveState: '',
  });

  // ---------------------------------------------------------------- state helpers
  E.slide = () => E.doc.slides[E.cur];
  E.find = (id) => E.slide().els.find((e) => e.id === id);
  E.selected = () => E.sel.map(E.find).filter(Boolean);
  E.one = () => (E.sel.length === 1 ? E.find(E.sel[0]) : null);

  function snap() { return JSON.stringify(E.doc, function (k, v) { return k === 'assets' && this === E.doc ? undefined : v; }); }
  function restore(s) { const assets = E.doc.assets; E.doc = JSON.parse(s); E.doc.assets = assets; }

  /** Change the doc. opts.merge groups quick successive edits (typing, sliders) into one undo step. */
  E.commit = function (label, fn, opts) {
    opts = opts || {};
    const before = snap();
    fn(E.doc, E.slide());
    const last = E.undoStack[E.undoStack.length - 1];
    const now = Date.now();
    if (opts.merge && last && last.label === label && now - last.t < 1500) last.t = now;
    else E.undoStack.push({ label, before, cur: E.cur, sel: E.sel.slice(), t: now });
    if (E.undoStack.length > 300) E.undoStack.shift();
    E.redoStack = [];
    E.changed(opts.refresh);
  };

  /** Same as commit, but leaves text editing first (element-level changes). */
  E.update = function (label, fn, opts) {
    if (E.editing) PZ.edStage.endEdit();
    E.commit(label, fn, opts);
  };

  E.changed = function (parts) {
    E.doc.updated = Date.now();
    E.cur = PZ.clamp(E.cur, 0, E.doc.slides.length - 1);
    E.sel = E.sel.filter((id) => E.find(id));
    E.setDirty(true);
    E.refresh(parts);
    E.autosave();
  };

  E.undo = function () {
    if (E.editing) PZ.edStage.endEdit();
    const u = E.undoStack.pop();
    if (!u) return;
    E.redoStack.push({ label: u.label, before: snap(), cur: E.cur, sel: E.sel.slice() });
    restore(u.before);
    E.cur = u.cur; E.sel = u.sel;
    E.changed();
    PZ.toast('Undo: ' + u.label, { timeout: 1200 });
  };
  E.redo = function () {
    const r = E.redoStack.pop();
    if (!r) return;
    E.undoStack.push({ label: r.label, before: snap(), cur: E.cur, sel: E.sel.slice(), t: 0 });
    restore(r.before);
    E.cur = r.cur; E.sel = r.sel;
    E.changed();
  };

  let pending = new Set(), raf = 0;
  /** Re-render parts of the UI: 'stage', 'slides' (all thumbnails), 'thumb' (current one), 'inspector', 'status'. */
  E.refresh = function (parts) {
    (parts || 'stage slides inspector status').split(/\s+/).forEach((p) => pending.add(p));
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const p = pending; pending = new Set();
      if (p.has('stage')) PZ.edStage.render();
      if (p.has('slides')) PZ.edSlides.render(); else if (p.has('thumb')) PZ.edSlides.renderThumb(E.cur);
      if (p.has('inspector')) PZ.edInspector.render();
      if (p.has('stage') || p.has('overlay')) PZ.edStage.renderOverlay();
      renderStatus();
    });
  };

  E.select = function (ids, o) {
    if (E.editing && !(o && o.keepEditing)) PZ.edStage.endEdit();
    E.sel = ids.filter((id) => E.find(id));
    E.refresh('overlay inspector');
  };
  E.goSlide = function (i) {
    if (E.editing) PZ.edStage.endEdit();
    if (i < 0 || i >= E.doc.slides.length) return;
    E.cur = i; E.sel = [];
    E.refresh('stage inspector status');
    PZ.edSlides.markCurrent();
  };

  // ---------------------------------------------------------------- saving
  E.setDirty = function (v) {
    E.dirty = v;
    E.saveState = v ? (E.mode === 'file' ? 'Unsaved changes' : 'Saving…') : (E.mode === 'file' ? 'Saved to file' : 'Saved in this browser');
    renderStatus();
  };
  const autosave = PZ.debounce(async () => {
    try {
      await PZ.store.put(E.doc);
      if (E.mode !== 'file') E.setDirty(false);
    } catch (e) { E.saveState = 'Not saved: browser storage unavailable'; renderStatus(); }
  }, 700);
  E.autosave = autosave;

  async function fileBlob(name) {
    if (/\.json$/i.test(name)) return new Blob([PZ.buildJson(E.doc)], { type: 'application/json' });
    const r = await PZ.buildHtml(E.doc, { mode: 'editor' });
    return new Blob([r.html], { type: 'text/html' });
  }

  /** Ctrl+S: write back to the opened file when possible, otherwise "save as". */
  E.save = async function () {
    if (E.editing) PZ.edStage.endEdit();
    if (E.fileHandle) {
      try {
        await PZ.files.write(E.fileHandle, await fileBlob(E.fileHandle.name));
        E.mode = 'file'; E.setDirty(false);
        PZ.toast('Saved to ' + E.fileHandle.name, { timeout: 1600 });
        return;
      } catch (e) { PZ.toast('Could not write the file: ' + e.message, { type: 'error' }); }
    }
    return E.saveAs();
  };
  E.saveAs = async function (kind) {
    if (E.editing) PZ.edStage.endEdit();
    try {
      const name = PZ.safeFileName(E.doc.title, kind === 'json' ? '.json' : '.html');
      const handle = await PZ.files.saveAs(await fileBlob(name), name, kind === 'json' ? 'json' : 'html');
      if (handle === 'cancel') return;
      if (handle) { E.fileHandle = handle; E.fileName = handle.name; E.mode = 'file'; E.setDirty(false); PZ.toast('Saved. Next saves (' + MOD + 'S) update this file.'); }
      else PZ.toast(kind === 'json' ? 'Data file downloaded.' : 'Downloaded an editable copy: open it in any browser to present or edit it.');
    } catch (e) { PZ.toast(e.message, { type: 'error', timeout: 8000 }); }
  };

  E.openFile = async function () {
    try {
      const r = await PZ.files.open();
      if (!r) return;
      E.load(r.doc, { mode: r.handle ? 'file' : 'browser', handle: r.handle, name: r.name });
      PZ.toast('Opened ' + r.name);
    } catch (e) { PZ.toast('Cannot open this file: ' + e.message, { type: 'error', timeout: 7000 }); }
  };

  E.load = function (doc, o) {
    o = o || {};
    if (E.editing) PZ.edStage.endEdit();
    E.doc = doc; E.cur = 0; E.sel = []; E.undoStack = []; E.redoStack = [];
    E.fileHandle = o.handle || null; E.fileName = o.name || ''; E.mode = o.mode || 'browser';
    PZ.loadFonts(doc);
    document.title = doc.title + ' · PrezEn';
    E.setDirty(false);
    E.refresh();
    if (!o.noSave) PZ.store.put(doc).catch(() => {});
  };

  // ---------------------------------------------------------------- commands
  const center = (w, hh) => ({ x: Math.round((E.doc.w - w) / 2), y: Math.round((E.doc.h - hh) / 2), w: Math.round(w), h: Math.round(hh) });
  function insert(el, label) {
    if (E.editing) PZ.edStage.endEdit();
    E.commit(label || 'Insert', (d, s) => s.els.push(el));
    E.select([el.id]);
    return el;
  }
  E.insertText = function (o) {
    const d = E.doc;
    const el = PZ.make.text(d, Object.assign(center(d.w * 0.5, d.h * 0.1), { html: 'Your text', style: { size: Math.round(d.h * 0.045) } }, o));
    insert(el, 'Add text');
    setTimeout(() => PZ.edStage.startEdit(el.id, true), 30);
  };
  E.insertShape = function (kind) {
    const d = E.doc, def = PZ.SHAPES[kind] || PZ.SHAPES.rect;
    const s = Math.round(d.h * 0.28);
    const el = def.line ? PZ.make.shape(d, Object.assign(center(d.w * 0.25, 60), { shape: kind, fill: '', stroke: d.theme.color, sw: 8 }))
      : PZ.make.shape(d, Object.assign(center(kind === 'arrow-block' || kind === 'chevron' || kind === 'parallelogram' ? s * 1.6 : s, s), { shape: kind }));
    insert(el, 'Add shape');
  };
  E.insertIcon = function (svg, name) {
    const s = Math.round(E.doc.h * 0.15);
    insert(PZ.make.icon(E.doc, Object.assign(center(s, s), { svg, name, color: E.doc.theme.accent })), 'Add icon');
  };
  E.insertImage = async function (ref, at) {
    const d = E.doc;
    const size = await PZ.imageSize(ref, d);
    let w = d.w * 0.4, hh = d.h * 0.4;
    if (size) { const k = Math.min((d.w * 0.6) / size.w, (d.h * 0.6) / size.h); w = size.w * k; hh = size.h * k; }
    const box = center(w, hh);
    if (at) { box.x = Math.round(at.x - w / 2); box.y = Math.round(at.y - hh / 2); }
    insert(PZ.make.image(d, Object.assign(box, { src: ref })), 'Add image');
  };

  E.addSlide = function (layout, after) {
    const s = PZ.newSlide(E.doc, layout || 'title-content');
    const prev = E.slide();
    if (prev) { s.bg = PZ.clone(prev.bg); s.transition = PZ.clone(prev.transition); }
    const at = (after == null ? E.cur : after) + 1;
    E.commit('Add slide', (d) => d.slides.splice(at, 0, s));
    E.goSlide(at);
    E.refresh('slides');
  };
  E.duplicateSlide = function (i) {
    i = i == null ? E.cur : i;
    const copy = PZ.reId(E.doc.slides[i]);
    E.commit('Duplicate slide', (d) => d.slides.splice(i + 1, 0, copy));
    E.goSlide(i + 1);
    E.refresh('slides');
  };
  E.deleteSlide = function (i) {
    i = i == null ? E.cur : i;
    if (E.doc.slides.length < 2) { PZ.toast('A presentation needs at least one slide.'); return; }
    E.commit('Delete slide', (d) => d.slides.splice(i, 1));
    E.goSlide(Math.min(i, E.doc.slides.length - 1));
    E.refresh('slides');
  };
  E.moveSlide = function (from, to) {
    if (from === to || to < 0 || to >= E.doc.slides.length) return;
    E.commit('Move slide', (d) => { const [s] = d.slides.splice(from, 1); d.slides.splice(to, 0, s); });
    E.goSlide(to);
    E.refresh('slides');
  };

  E.deleteSel = function () {
    const ids = new Set(E.selected().filter((e) => !e.locked).map((e) => e.id));
    if (!ids.size) return;
    E.commit('Delete', (d, s) => { s.els = s.els.filter((e) => !ids.has(e.id)); });
    E.select([]);
  };
  E.duplicateSel = function () {
    const els = E.selected();
    if (!els.length) return;
    const copies = els.map((e) => Object.assign(PZ.reId(e), { x: e.x + 30, y: e.y + 30, locked: false }));
    E.commit('Duplicate', (d, s) => s.els.push(...copies));
    E.select(copies.map((c) => c.id));
  };
  E.copySel = function () {
    const els = E.selected();
    if (!els.length) return false;
    E.clipboard = { els: PZ.clone(els), assets: {} };
    els.forEach((e) => { if (e.src && e.src.startsWith('asset:')) E.clipboard.assets[e.src.slice(6)] = E.doc.assets[e.src.slice(6)]; });
    try { localStorage.setItem('prezen:clip', JSON.stringify(E.clipboard)); } catch (e) { /* large images: memory only */ }
    return true;
  };
  E.cutSel = function () { if (E.copySel()) E.deleteSel(); };
  E.paste = function () {
    let clip = E.clipboard;
    try { const s = localStorage.getItem('prezen:clip'); if (s) clip = JSON.parse(s); } catch (e) { /* ignore */ }
    if (!clip || !clip.els) return false;
    const same = clip.els.every((c) => E.find(c.id));
    const copies = clip.els.map((c) => PZ.normalizeEl(Object.assign(PZ.reId(c), same ? { x: c.x + 30, y: c.y + 30 } : {}), E.doc.theme)).filter(Boolean);
    E.commit('Paste', (d, s) => { Object.assign(d.assets, clip.assets || {}); s.els.push(...copies); });
    E.select(copies.map((c) => c.id));
    return true;
  };

  E.zorder = function (how) {
    const ids = new Set(E.sel);
    if (!ids.size) return;
    E.update('Arrange', (d, s) => {
      const picked = s.els.filter((e) => ids.has(e.id)), rest = s.els.filter((e) => !ids.has(e.id));
      if (how === 'front') s.els = rest.concat(picked);
      else if (how === 'back') s.els = picked.concat(rest);
      else {
        const arr = s.els.slice();
        const idx = arr.map((e, i) => (ids.has(e.id) ? i : -1)).filter((i) => i >= 0);
        if (how === 'forward') for (let k = idx.length - 1; k >= 0; k--) { const i = idx[k]; if (i < arr.length - 1 && !ids.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
        if (how === 'backward') for (const i of idx) if (i > 0 && !ids.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        s.els = arr;
      }
    });
  };

  /** Align selection: to the slide when one element, to the selection box otherwise. */
  E.align = function (how) {
    const els = E.selected().filter((e) => !e.locked);
    if (!els.length) return;
    const box = els.length === 1 ? { x: 0, y: 0, w: E.doc.w, h: E.doc.h } : bbox(els);
    E.update('Align', () => {
      for (const e of els) {
        if (how === 'left') e.x = box.x;
        if (how === 'hcenter') e.x = Math.round(box.x + (box.w - e.w) / 2);
        if (how === 'right') e.x = box.x + box.w - e.w;
        if (how === 'top') e.y = box.y;
        if (how === 'vcenter') e.y = Math.round(box.y + (box.h - e.h) / 2);
        if (how === 'bottom') e.y = box.y + box.h - e.h;
      }
      if (how === 'hdist' && els.length > 2) {
        const s = els.slice().sort((a, b) => a.x - b.x), total = s.reduce((t, e) => t + e.w, 0);
        const gap = (box.w - total) / (s.length - 1); let x = box.x;
        s.forEach((e) => { e.x = Math.round(x); x += e.w + gap; });
      }
      if (how === 'vdist' && els.length > 2) {
        const s = els.slice().sort((a, b) => a.y - b.y), total = s.reduce((t, e) => t + e.h, 0);
        const gap = (box.h - total) / (s.length - 1); let y = box.y;
        s.forEach((e) => { e.y = Math.round(y); y += e.h + gap; });
      }
    }, { refresh: 'stage thumb inspector' });
  };
  function bbox(els) {
    const x = Math.min(...els.map((e) => e.x)), y = Math.min(...els.map((e) => e.y));
    return { x, y, w: Math.max(...els.map((e) => e.x + e.w)) - x, h: Math.max(...els.map((e) => e.y + e.h)) - y };
  }
  E.bbox = bbox;

  E.present = function (fromCurrent) {
    if (E.editing) PZ.edStage.endEdit();
    try { document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* not allowed */ }
    E.player = new PZ.Player(E.doc, {
      start: fromCurrent ? E.cur : 0, fullscreenTarget: document.documentElement, allowPrint: false, exitWithFullscreen: true,
      onExit: (i) => { E.player = null; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); E.goSlide(i); },
    });
  };

  E.setTitle = function (t) {
    t = String(t || '').trim().slice(0, 200) || 'Untitled presentation';
    if (t === E.doc.title) return;
    E.commit('Rename', (d) => { d.title = t; }, { refresh: 'status' });
    document.title = t + ' · PrezEn';
  };

  E.newDoc = function (aspect) {
    const doc = PZ.newDoc({ aspect });
    E.load(doc);
    history.replaceState(null, '', location.pathname + location.search);
  };

  // ---------------------------------------------------------------- layout
  let statusEl, titleInput, undoBtn, redoBtn;
  function renderStatus() {
    if (!statusEl) return;
    statusEl.textContent = '';
    statusEl.append(...[
      h('span', { text: `Slide ${E.cur + 1} of ${E.doc.slides.length}` }),
      h('span', { class: 'ed-st-sep' }),
      h('span', { text: `${E.doc.w}×${E.doc.h}` }),
      h('span', { class: 'ed-grow' }),
      E.fileName ? h('span', { class: 'ed-st-file', title: 'Ctrl+S writes to this file', text: E.fileName }) : null,
      h('span', { class: 'ed-st-save' + (E.dirty && E.mode === 'file' ? ' ed-warn' : ''), text: E.saveState }),
      PZ.edStage.zoomControl(),
    ].filter(Boolean));
    if (titleInput && document.activeElement !== titleInput) titleInput.value = E.doc.title;
    if (undoBtn) { undoBtn.disabled = !E.undoStack.length; redoBtn.disabled = !E.redoStack.length; }
  }
  E.renderStatus = renderStatus;

  function fileMenu(anchor) {
    ui.menu(anchor, [
      { label: 'New presentation…', icon: 'file-plus', run: () => PZ.edDialogs.newDoc() },
      { label: 'Open file…', icon: 'folder-open', kbd: MOD + 'O', run: () => E.openFile() },
      { label: 'My presentations (this browser)', icon: 'library', run: () => PZ.edDialogs.library() },
      '-',
      { label: E.fileHandle ? 'Save to ' + E.fileHandle.name : 'Save as editable file…', icon: 'save', kbd: MOD + 'S', run: () => E.save() },
      { label: 'Save a copy as…', icon: 'copy', run: () => E.saveAs() },
      { label: 'Save data only (.json)', icon: 'download', run: () => E.saveAs('json') },
      '-',
      { label: 'Export…', icon: 'upload', run: () => PZ.edDialogs.exportDlg() },
      { label: 'Print / PDF', icon: 'pdf', kbd: MOD + 'P', run: () => PZ.printDoc(E.doc) },
      { label: 'Share link…', icon: 'link', run: () => PZ.edDialogs.share() },
      '-',
      { label: 'Page size & theme…', icon: 'sliders', run: () => PZ.edDialogs.pageSetup() },
      { label: 'Keyboard shortcuts', icon: 'keyboard', kbd: '?', run: () => PZ.edDialogs.shortcuts() },
      { label: 'About PrezEn & privacy', icon: 'info', run: () => PZ.edDialogs.about() },
    ]);
  }

  function shapesMenu(anchor) {
    const grid = h('div', { class: 'ed-shape-grid' });
    for (const [kind, def] of Object.entries(PZ.SHAPES)) {
      const prev = PZ.shapeSvg({ id: 'p' + kind, shape: kind, w: 44, h: def.line ? 20 : 34, fill: '#7c8cff', stroke: def.line ? '#7c8cff' : '', sw: def.line ? 3 : 0, radius: 6 });
      grid.appendChild(h('button', { class: 'ed-shape-btn', title: def.name, onClick: () => { pop.close(); E.insertShape(kind); } }, prev));
    }
    const pop = ui.popover(anchor, h('div', { class: 'ed-pop-pad' }, h('div', { class: 'ui-menu-head', text: 'Shapes' }), grid));
  }

  function build(root) {
    const tb = (icon, label, run, o) => h('button', { class: 'ed-tb' + (o && o.cls ? ' ' + o.cls : ''), title: (o && o.title) || label, onClick: (e) => run(e.currentTarget) }, PZ.icon(icon), label ? h('span', { class: 'ed-tb-label', text: label }) : null);
    titleInput = h('input', { class: 'ed-title', value: E.doc.title, 'aria-label': 'Presentation title', spellcheck: 'false',
      onChange: () => E.setTitle(titleInput.value), onKeydown: (e) => { if (e.key === 'Enter') titleInput.blur(); } });
    undoBtn = tb('undo', '', () => E.undo(), { title: 'Undo (' + MOD + 'Z)' });
    redoBtn = tb('redo', '', () => E.redo(), { title: 'Redo (' + MOD + 'Shift+Z)' });
    const top = h('header', { class: 'ed-top' },
      h('button', { class: 'ed-brand', title: 'Menu', onClick: (e) => fileMenu(e.currentTarget) }, h('span', { class: 'ed-logo' }, 'P'), h('span', { class: 'ed-brand-name', text: 'PrezEn' }), PZ.icon('chevron-down')),
      titleInput,
      h('div', { class: 'ed-tb-group' }, undoBtn, redoBtn),
      h('div', { class: 'ed-tb-group' },
        tb('type', 'Text', () => E.insertText(), { title: 'Add text (T)' }),
        tb('image', 'Image', () => PZ.edDialogs.image({ onPick: (ref) => E.insertImage(ref) }), { title: 'Add image (I)' }),
        tb('shapes', 'Shapes', (a) => shapesMenu(a)),
        tb('star', 'Icons', () => PZ.edDialogs.icons({ onPick: (svg, name) => E.insertIcon(svg, name) })),
        tb('sparkles', 'Transitions', () => PZ.edStudio.open(), { title: 'Transition & animation studio' })),
      h('div', { class: 'ed-grow' }),
      h('div', { class: 'ed-tb-group' },
        tb('library', '', () => PZ.edDialogs.library(), { title: 'My presentations' }),
        tb('share', 'Share', () => PZ.edDialogs.share()),
        tb('download', 'Export', () => PZ.edDialogs.exportDlg()),
        h('button', { class: 'ed-present', title: 'Present from the start (F5) · Shift: from this slide', onClick: (e) => E.present(e.shiftKey) }, PZ.icon('play'), h('span', { text: 'Present' })),
        h('button', { class: 'ed-present-more', title: 'Present options', onClick: (e) => ui.menu(e.currentTarget, [
          { label: 'From the beginning', icon: 'play', kbd: 'F5', run: () => E.present(false) },
          { label: 'From this slide', icon: 'play', kbd: 'Shift+F5', run: () => E.present(true) },
        ], { align: 'right' }) }, PZ.icon('chevron-down'))));
    const slidesPane = h('aside', { class: 'ed-slides', 'aria-label': 'Slides' });
    const canvas = h('main', { class: 'ed-canvas', 'aria-label': 'Slide editor' });
    const insp = h('aside', { class: 'ed-inspector', 'aria-label': 'Properties' });
    statusEl = h('footer', { class: 'ed-status' });
    root.append(top, h('div', { class: 'ed-main' }, slidesPane, canvas, insp), statusEl);
    PZ.edSlides.mount(slidesPane);
    PZ.edStage.mount(canvas);
    PZ.edInspector.mount(insp);
  }

  // ---------------------------------------------------------------- keyboard
  function onKey(e) {
    if (E.player || document.querySelector('.ui-backdrop')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const inField = e.target.closest('input, textarea, select');
    const inText = e.target.closest('[contenteditable="true"]');
    if (mod && (k === 's' || k === 'S')) { e.preventDefault(); E.save(); return; }
    if (mod && (k === 'o' || k === 'O')) { e.preventDefault(); E.openFile(); return; }
    if (mod && (k === 'p' || k === 'P')) { e.preventDefault(); PZ.printDoc(E.doc); return; }
    if (k === 'F5') { e.preventDefault(); E.present(e.shiftKey); return; }
    if (inField || inText) return;
    if (mod && !e.shiftKey && (k === 'z' || k === 'Z')) { e.preventDefault(); E.undo(); return; }
    if (mod && ((e.shiftKey && (k === 'z' || k === 'Z')) || k === 'y' || k === 'Y')) { e.preventDefault(); E.redo(); return; }
    if (mod && (k === 'a' || k === 'A')) { e.preventDefault(); E.select(E.slide().els.filter((x) => !x.locked).map((x) => x.id)); return; }
    if (mod && (k === 'd' || k === 'D')) { e.preventDefault(); if (E.sel.length) E.duplicateSel(); else E.duplicateSlide(); return; }
    if (mod && /^[cxv]$/i.test(k)) return; // handled by the copy / cut / paste events (they can carry images and text)
    if (mod && k === ']') { e.preventDefault(); E.zorder(e.shiftKey ? 'front' : 'forward'); return; }
    if (mod && k === '[') { e.preventDefault(); E.zorder(e.shiftKey ? 'back' : 'backward'); return; }
    if (k === 'Delete' || k === 'Backspace') {
      if (E.sel.length) { e.preventDefault(); E.deleteSel(); } else if (e.target.closest('.ed-slides')) { e.preventDefault(); E.deleteSlide(); }
      return;
    }
    if (k === 'Escape') { E.select([]); return; }
    if (k.startsWith('Arrow') && E.sel.length) {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1;
      const dx = k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0, dy = k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0;
      E.commit('Move', () => E.selected().forEach((x) => { if (!x.locked) { x.x += dx; x.y += dy; } }), { merge: true, refresh: 'stage thumb inspector' });
      return;
    }
    if ((k === 'PageDown' || (k === 'ArrowDown' && !E.sel.length)) && E.cur < E.doc.slides.length - 1) { e.preventDefault(); E.goSlide(E.cur + 1); return; }
    if ((k === 'PageUp' || (k === 'ArrowUp' && !E.sel.length)) && E.cur > 0) { e.preventDefault(); E.goSlide(E.cur - 1); return; }
    if (k === 'Enter' && E.sel.length === 1) { const el = E.one(); if (el.type === 'text' || el.type === 'shape') { e.preventDefault(); PZ.edStage.startEdit(el.id); } return; }
    if (mod || e.altKey) return;
    if (k === 't' || k === 'T') { e.preventDefault(); E.insertText(); }
    else if (k === 'i' || k === 'I') { e.preventDefault(); PZ.edDialogs.image({ onPick: (ref) => E.insertImage(ref) }); }
    else if (k === 'r' || k === 'R') E.insertShape('rect');
    else if (k === 'e' || k === 'E') E.insertShape('ellipse');
    else if (k === 'n' || k === 'N') E.addSlide();
    else if (k === '?') PZ.edDialogs.shortcuts();
  }

  /** Paste: our own elements, an image from the clipboard, an image URL, or plain text. */
  async function onPaste(e) {
    if (E.player || document.querySelector('.ui-backdrop') || e.target.closest('input, textarea, [contenteditable="true"]')) return;
    const dt = e.clipboardData;
    const file = dt && Array.from(dt.files || []).find((f) => /^image\//.test(f.type));
    if (file) { e.preventDefault(); E.insertImage(PZ.addAsset(E.doc, await PZ.imageFileToDataUrl(file))); return; }
    const text = dt ? dt.getData('text/plain') : '';
    let clip = E.clipboard;
    try { clip = JSON.parse(localStorage.getItem('prezen:clip') || 'null') || clip; } catch (err) { /* ignore */ }
    if (clip && clip.text && text === clip.text) { e.preventDefault(); E.paste(); return; }
    if (!text) { if (E.paste()) e.preventDefault(); return; }
    e.preventDefault();
    const t = text.trim();
    if (/^(https?:\/\/\S+\.(png|jpe?g|gif|webp|svg|avif)(\?\S*)?|https?:\/\/drive\.google\.com\/\S+|s3:\/\/\S+)$/i.test(t)) E.insertImage(t);
    else E.insertText({ html: PZ.escapeHtml(t).replace(/\n/g, '<br>') });
  }

  /** Start the editor in a root element with a doc. */
  E.start = function (doc, opts) {
    opts = opts || {};
    E.doc = doc;
    E.mode = opts.mode || 'browser';
    const root = h('div', { class: 'ed' });
    document.body.appendChild(root);
    document.body.classList.add('pz-editor-body');
    build(root);
    E.load(doc, { mode: E.mode, noSave: opts.noSave });
    window.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
    // copy / cut put a marker in the system clipboard, so paste can tell our elements from text copied elsewhere
    const onCopy = (cut) => (e) => {
      if (E.player || document.querySelector('.ui-backdrop') || e.target.closest('input, textarea, [contenteditable="true"]') || !E.sel.length) return;
      E.copySel();
      E.clipboard.text = 'prezen:' + Date.now();
      try { localStorage.setItem('prezen:clip', JSON.stringify(E.clipboard)); } catch (err) { /* large images: memory only */ }
      if (e.clipboardData) e.clipboardData.setData('text/plain', E.clipboard.text);
      e.preventDefault();
      if (cut) E.deleteSel();
    };
    document.addEventListener('copy', onCopy(false));
    document.addEventListener('cut', onCopy(true));
    window.addEventListener('beforeunload', (e) => { if (E.dirty && E.mode === 'file') { e.preventDefault(); e.returnValue = ''; } else autosave.flush(); });
    if (PZ.storageFallback) PZ.toast('Browser storage is unavailable here: save your work to a file.', { type: 'warn', timeout: 8000 });
  };
})(window.PZ = window.PZ || {});
