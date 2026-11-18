/* PrezEn · editor/dialogs: images, icons, share link, export, library, page setup, help. */
(function (PZ) {
  'use strict';
  const h = PZ.h, E = PZ.ed, ui = PZ.ui, t = PZ.t;
  const D = (PZ.edDialogs = {});

  // ---------------------------------------------------------------- image picker
  D.image = function (o) {
    o = o || {};
    let m;
    const pick = (ref) => { m.close(); o.onPick(ref); };

    const upload = () => {
      const opt = { optimize: true };
      const input = h('input', { type: 'file', accept: 'image/*', multiple: false, style: 'display:none' });
      const drop = h('div', { class: 'dlg-drop', tabindex: '0', onClick: () => input.click(), onKeydown: (e) => { if (e.key === 'Enter') input.click(); } },
        PZ.icon('upload'), h('b', { text: t('Drop a picture here or click to browse') }), h('small', { text: t('Stored inside the presentation: works offline and in exported files.') }));
      const take = async (f) => {
        if (!f) return;
        try { pick(PZ.addAsset(E.doc, await PZ.imageFileToDataUrl(f, opt))); } catch (e) { PZ.toast(e.message, { type: 'error' }); }
      };
      input.addEventListener('change', () => take(input.files[0]));
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('on'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('on'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); take(Array.from(e.dataTransfer.files).find((f) => /^image\//.test(f.type))); });
      return [drop, input, ui.toggle(true, (v) => { opt.optimize = v; }, t('Shrink large photos (max 2400 px) to keep files light'))];
    };

    const link = (kind) => {
      const help = {
        url: ['https://example.com/photo.jpg', t('Any public image address. Shown when the viewer is online.')],
        drive: ['https://drive.google.com/file/d/…/view?usp=sharing', t('In Google Drive: Share → General access → “Anyone with the link”, then copy the link here.')],
        s3: ['s3://my-bucket/folder/photo.jpg', t('A public object (s3://bucket/key or its https URL), or a pre-signed URL. Pre-signed URLs expire. Dropbox and Google Cloud Storage (gs://) links work too.')],
        local: ['images/photo.jpg', t('A path relative to the presentation file. Put the pictures next to the .html file (for example on the flashdrive). Works when the file is opened from that folder, not in the online app.')],
      }[kind];
      const input = h('input', { class: 'ui-input ui-mono', placeholder: help[0], value: o.initial && PZ.srcKind(o.initial) !== 'embedded' ? o.initial : '', autofocus: true });
      const badge = h('span', { class: 'ed-src-badge' });
      const prev = h('div', { class: 'dlg-preview' });
      const status = h('small', { class: 'dlg-status' });
      const check = PZ.debounce(() => {
        const ref = input.value.trim();
        prev.textContent = ''; status.textContent = '';
        badge.textContent = ref ? t(PZ.SRC_LABELS[PZ.srcKind(ref)]) : '';
        if (!ref) return;
        if (PZ.srcKind(ref) === 'invalid') { status.textContent = t('This kind of address is not supported.'); return; }
        const img = h('img', { alt: '' });
        status.textContent = t('Loading preview…');
        img.onload = () => { status.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`; };
        PZ.setImgSrc(img, ref, E.doc, () => { status.textContent = kind === 'local' ? t('Not found from here (normal in the online app): it will load when the file sits next to the picture.') : t('Could not load this picture. Is it public?'); });
        prev.appendChild(img);
      }, 350);
      input.addEventListener('input', check);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) pick(input.value.trim()); });
      if (input.value) check();
      return [h('p', { class: 'ed-hint', text: help[1] }), h('div', { class: 'dlg-url-row' }, input, badge),
        h('div', { class: 'ui-btn-row' }, h('button', { class: 'ui-btn ui-primary', text: t('Use this picture'), onClick: () => { const v = input.value.trim(); if (v && PZ.srcKind(v) !== 'invalid') pick(v); } })), status, prev];
    };

    const tabs = ui.tabs([
      { id: 'upload', label: t('Upload'), icon: 'upload', render: upload },
      { id: 'url', label: t('Web link'), icon: 'link', render: () => link('url') },
      { id: 'drive', label: 'Google Drive', icon: 'cloud', render: () => link('drive') },
      { id: 's3', label: t('S3 / cloud'), icon: 'database', render: () => link('s3') },
      { id: 'local', label: t('Local path'), icon: 'folder', render: () => link('local') },
    ], o.initial ? { drive: 'drive', s3: 's3', gcs: 's3', dropbox: 's3', relative: 'local', url: 'url' }[PZ.srcKind(o.initial)] || 'upload' : 'upload');
    m = ui.modal({ title: o.title || t('Add an image'), content: tabs.el, wide: true });
  };

  /** Several icons of one set from Iconify's JSON API (CORS-enabled) in a single request.
   *  Resolves to { name: sanitized svg markup }, following one level of alias. One request per
   *  icon set (instead of one per icon) keeps us under Iconify's rate limit. */
  async function iconifySet(prefix, names) {
    const res = await fetch(`https://api.iconify.design/${prefix}.json?icons=${names.map(encodeURIComponent).join(',')}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const out = {};
    for (const name of names) {
      let ic = data.icons && data.icons[name];
      const alias = !ic && data.aliases && data.aliases[name];
      if (alias && data.icons) ic = Object.assign({}, data.icons[alias.parent], alias);
      if (!ic || typeof ic.body !== 'string') continue;
      const w = ic.width || data.width || 16, hh = ic.height || data.height || 16;
      const svg = PZ.sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${+ic.left || 0} ${+ic.top || 0} ${+w} ${+hh}">${ic.body}</svg>`);
      if (svg) out[name] = svg;
    }
    return out;
  }

  // ---------------------------------------------------------------- icons (built-in + Iconify search)
  D.icons = function (o) {
    let m;
    const grid = h('div', { class: 'dlg-icon-grid' });
    const search = h('input', { class: 'ui-input', placeholder: t('Search icons (e.g. rocket, team, chart)…'), autofocus: true });
    const status = h('small', { class: 'dlg-status' });
    const online = h('button', { class: 'ui-btn ui-small', text: t('Search 200,000+ icons online'), title: t('Uses the free Iconify API (api.iconify.design). Picked icons are stored in the presentation.') });
    const showBuiltin = (q) => {
      grid.textContent = '';
      for (const [cat, icons] of Object.entries(PZ.ICON_SET)) {
        const names = Object.keys(icons).filter((n) => !q || n.includes(q) || cat.toLowerCase().includes(q) || t(cat).toLowerCase().includes(q));
        if (!names.length) continue;
        grid.appendChild(h('div', { class: 'dlg-icon-cat', text: t(cat) }));
        names.forEach((n) => {
          const b = h('button', { class: 'dlg-icon', title: n, onClick: () => { m.close(); o.onPick(PZ.iconSvg(n), n); } });
          b.innerHTML = PZ.iconSvg(n);
          grid.appendChild(b);
        });
      }
      if (!grid.children.length) grid.appendChild(h('p', { class: 'ed-hint', text: t('No built-in icon matches. Try the online search.') }));
    };
    const searchOnline = async () => {
      const q = search.value.trim();
      if (!q) { status.textContent = t('Type a word first.'); return; }
      status.textContent = t('Searching…');
      try {
        const res = await fetch('https://api.iconify.design/search?limit=96&query=' + encodeURIComponent(q));
        const data = await res.json();
        grid.textContent = '';
        status.textContent = t('{n} icons from Iconify (check each icon set’s license for commercial use).', { n: (data.icons || []).length });
        const bySet = new Map();
        for (const full of data.icons || []) {
          if (!/^[\w-]+:[\w-]+$/.test(full)) continue;
          const [prefix, name] = full.split(':');
          const b = h('button', { class: 'dlg-icon', title: full, disabled: true });
          grid.appendChild(b);
          if (!bySet.has(prefix)) bySet.set(prefix, []);
          bySet.get(prefix).push({ name, full, b });
        }
        await Promise.all([...bySet].map(async ([prefix, items]) => {
          let svgs = {};
          try { svgs = await iconifySet(prefix, items.map((it) => it.name)); } catch (e) { /* leave buttons empty */ }
          for (const { name, full, b } of items) {
            const svg = svgs[name];
            if (!svg) { b.remove(); continue; }
            b.innerHTML = svg;
            b.disabled = false;
            b.addEventListener('click', () => { m.close(); o.onPick(svg, full); });
          }
        }));
        if (!grid.querySelector('.dlg-icon')) status.textContent = t('Online search unavailable (offline?).');
      } catch (e) { status.textContent = t('Online search unavailable (offline?).'); }
    };
    search.addEventListener('input', () => showBuiltin(search.value.trim().toLowerCase()));
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchOnline(); });
    online.addEventListener('click', searchOnline);
    showBuiltin('');
    m = ui.modal({ title: t('Icons'), wide: true, content: [h('div', { class: 'dlg-url-row' }, search, online), status, grid] });
  };

  // ---------------------------------------------------------------- password
  /** Password field bound to doc.password. onChange runs after the password was set or removed. */
  function passwordField(onChange) {
    const input = h('input', { class: 'ui-input', type: 'password', value: E.doc.password || '', maxlength: '128', placeholder: t('None: anyone with the link or file can open it'), autocomplete: 'new-password', spellcheck: 'false' });
    const apply = () => {
      const v = input.value;
      if (v === (E.doc.password || '')) return;
      E.commit('Password', (d) => { if (v) d.password = v; else delete d.password; });
      if (onChange) onChange();
    };
    input.addEventListener('change', apply);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    const eye = ui.iconBtn('eye', t('Show / hide the password'), () => { input.type = input.type === 'password' ? 'text' : 'password'; });
    return h('div', { class: 'dlg-password' },
      h('label', { class: 'ui-label', text: t('Password to open the presentation (optional)') }),
      h('div', { class: 'dlg-url-row' }, input, eye),
      h('p', { class: 'ed-hint', text: t('Share links and exported files (HTML, JSON) are then encrypted with it and ask for it before opening. The copy in this browser stays unencrypted. Anyone who knows the password can open, copy and share the presentation, and links shared earlier keep working without it.') }));
  }

  D.password = function () {
    ui.modal({ title: t('Password protection'), content: passwordField(() => PZ.toast(E.doc.password ? t('Password set') : t('Password removed'))) });
  };

  // ---------------------------------------------------------------- share link
  D.share = function () {
    const out = h('textarea', { class: 'ui-textarea ui-mono dlg-link', rows: 4, readonly: true });
    const info = h('div', { class: 'dlg-status' });
    let playMode = false, noAssets = false;
    const regen = async () => {
      info.textContent = t('Packing…');
      try {
        const packed = await PZ.encodeDoc(E.doc, { withoutAssets: noAssets });
        const url = PZ.appUrl() + '#p=' + packed + (playMode ? '&play' : '');
        out.value = url;
        const n = url.length;
        info.textContent = '';
        info.append(h('b', { text: t('{n} characters.', { n: n.toLocaleString(PZ.lang) }) + ' ' }),
          n > 2000000 ? h('span', { class: 'ed-warn', text: t('Too long for a link: export a file instead, or leave out embedded images.') })
            : n > 30000 ? h('span', { class: 'ed-warn', text: t('Long link: fine in a browser or a document, but some chat apps cut long messages. Leaving out embedded images or using linked images (URL / Drive / S3) makes it shorter.') })
              : h('span', { text: t('Short enough for chats and email.') }));
      } catch (e) { info.textContent = e.message; }
    };
    const m = ui.modal({
      title: t('Share with a link'), wide: true,
      content: [
        h('p', { class: 'ed-hint', text: t('The whole presentation is compressed into the link itself, after the # sign. Browsers never send that part to a server: nothing is uploaded, no account is needed. Anyone with the link can open (and copy) the presentation.') }),
        passwordField(() => regen()),
        ui.toggle(false, (v) => { playMode = v; regen(); }, t('Open directly as a slideshow')),
        ui.toggle(false, (v) => { noAssets = v; regen(); }, t('Leave out uploaded (embedded) images')),
        out, info,
        PZ.isFileProtocol() ? h('p', { class: 'ed-hint', text: t('You are running PrezEn from a file: the link points to the online app ({url}).', { url: PZ.PUBLIC_URL }) }) : null,
      ],
      buttons: [
        { label: t('Open in a new tab'), run: () => window.open(out.value, '_blank', 'noopener') },
        { label: t('Copy link'), primary: true, run: async () => { if (await ui.copy(out.value)) PZ.toast(t('Link copied')); } },
      ],
    });
    out.addEventListener('focus', () => out.select());
    regen();
    return m;
  };

  // ---------------------------------------------------------------- export
  D.exportDlg = function () {
    const opts = { embedImages: true, embedFonts: false };
    const status = h('div', { class: 'dlg-status' });
    const run = (fn) => async () => {
      if (E.editing) PZ.edStage.endEdit();
      status.textContent = t('Building…');
      try { await fn(); } catch (e) { status.textContent = ''; PZ.toast(e.message, { type: 'error', timeout: 9000 }); }
    };
    const html = (mode) => run(async () => {
      const r = await PZ.buildHtml(E.doc, Object.assign({ mode, onProgress: (i, n) => { status.textContent = t('Embedding images {i}/{n}…', { i, n }); } }, opts));
      const name = PZ.safeFileName(E.doc.title + (mode === 'player' ? ' ' + t('(slideshow)') : ''), '.html');
      const handle = await PZ.files.saveAs(new Blob([r.html], { type: 'text/html' }), name, 'html');
      status.textContent = handle === 'cancel' ? '' : t('Done: {size}.', { size: PZ.fmtBytes(r.size) });
      if (r.report.failedImages.length) {
        status.appendChild(h('div', { class: 'ed-warn', text: t('{n} linked image(s) could not be embedded (the host does not allow it) and stay as links: {list}', { n: r.report.failedImages.length, list: r.report.failedImages.slice(0, 3).join(', ') }) }));
      }
    });
    const card = (icon, title, text, action, primary) => h('div', { class: 'dlg-card' }, PZ.icon(icon), h('div', { class: 'dlg-card-text' }, h('b', { text: title }), h('small', { text })),
      h('button', { class: 'ui-btn' + (primary ? ' ui-primary' : ''), text: t('Export'), onClick: action }));
    ui.modal({
      title: t('Export'), wide: true,
      content: [
        card('play', t('Slideshow (HTML)'), t('One light file with the presentation and the player: double-click it on any computer, tablet or phone. Not editable.'), html('player'), true),
        card('file-text', t('Editable presentation (HTML)'), t('The same file with the editor inside: copy it to a flashdrive, open it anywhere, edit and save it back. Works offline.'), html('editor')),
        card('pdf', 'PDF', t('One page per slide, in their final state (vector text). Choose “Save as PDF” in the print dialog.'), () => PZ.printDoc(E.doc)),
        card('notes', t('PDF with speaker notes'), t('A4 handout: each slide with its notes below.'), () => PZ.printDoc(E.doc, { notes: true })),
        card('download', t('Data (JSON)'), t('Raw data, to keep in version control or reopen later.'), run(async () => { await E.saveAs('json'); status.textContent = ''; })),
        h('div', { class: 'dlg-opts' },
          ui.toggle(opts.embedImages, (v) => { opts.embedImages = v; }, t('Embed linked images (Drive, S3, URLs…) so the file works offline')),
          ui.toggle(opts.embedFonts, (v) => { opts.embedFonts = v; }, t('Embed Google Fonts (bigger file, perfect offline typography)'))),
        passwordField(),
        h('p', { class: 'ed-hint', text: t('Exported files open in the current language ({lang}).', { lang: PZ.LANGS[PZ.lang] }) }),
        status,
      ],
    });
  };

  // ---------------------------------------------------------------- library
  D.library = async function () {
    const grid = h('div', { class: 'dlg-lib' });
    const m = ui.modal({ title: t('My presentations'), wide: true, content: [
      h('p', { class: 'ed-hint', text: t('Saved automatically in this browser on this device only. Clearing browsing data deletes them: export important work to a file.') }),
      h('div', { class: 'ui-btn-row' }, h('button', { class: 'ui-btn ui-primary', onClick: () => { m.close(); D.newDoc(); } }, PZ.icon('plus'), h('span', { text: t('New presentation') })),
        h('button', { class: 'ui-btn', onClick: () => { m.close(); E.openFile(); } }, PZ.icon('folder-open'), h('span', { text: t('Open a file…') }))),
      grid] });
    const fill = async () => {
      grid.textContent = '';
      const items = await PZ.store.list();
      if (!items.length) grid.appendChild(h('p', { class: 'ed-hint', text: t('Nothing saved yet.') }));
      for (const it of items) {
        let doc;
        try { doc = PZ.normalizeDoc(it.doc); } catch (e) { continue; }
        const cur = doc.id === E.doc.id;
        grid.appendChild(h('div', { class: 'dlg-lib-item' + (cur ? ' on' : '') },
          h('button', { class: 'dlg-lib-open', title: t('Open'), onClick: () => { m.close(); if (!cur) E.load(doc); } }, PZ.renderThumb(doc, doc.slides[0], 220)),
          h('div', { class: 'dlg-lib-meta' }, h('b', { text: doc.title }), h('small', { text: `${PZ.tn('{n} slide', '{n} slides', doc.slides.length)} · ${new Date(it.updated).toLocaleString(PZ.lang)}${cur ? ' · ' + t('open now') : ''}` })),
          h('div', { class: 'dlg-lib-actions' },
            ui.iconBtn('copy', t('Duplicate'), async () => { const c = PZ.clone(doc); c.id = PZ.uid('d'); c.title += ' ' + t('(copy)'); c.updated = Date.now(); await PZ.store.put(c); fill(); }),
            cur ? null : ui.iconBtn('trash', t('Delete'), async () => { if (await ui.confirm(t('Delete'), t('Delete “{title}” from this browser? This cannot be undone.', { title: doc.title }), t('Delete'), true)) { await PZ.store.del(doc.id); fill(); } }))));
      }
    };
    fill();
  };

  /**
   * Page size picker: a preset list plus W/H fields kept in sync. Picking a preset fills the fields;
   * typing a size selects the matching preset, or 'Custom'. get() returns the chosen { w, h }.
   */
  const sizePicker = function (w0, h0) {
    let w = w0, hh = h0;
    const match = () => (PZ.ASPECTS.find((a) => a.w === w && a.h === hh) || {}).id || 'custom';
    const opts = PZ.ASPECTS.map((a) => ({ value: a.id, label: `${t(a.name)} (${a.w}×${a.h})` })).concat([{ value: 'custom', label: t('Custom (below)') }]);
    const sel = ui.select(match(), opts, (v) => {
      const a = PZ.ASPECTS.find((x) => x.id === v);
      if (a) { w = a.w; hh = a.h; wIn.value = w; hIn.value = hh; } else wIn.focus();
    });
    const fields = h('div', { class: 'ed-grid2' },
      ui.number(w, (v) => { w = Math.round(v); sel.value = match(); }, { label: t('W'), min: 100, max: 8000, decimals: 0 }),
      ui.number(hh, (v) => { hh = Math.round(v); sel.value = match(); }, { label: t('H'), min: 100, max: 8000, decimals: 0 }));
    const [wIn, hIn] = fields.querySelectorAll('input');
    return { el: [h('label', { class: 'ui-label', text: t('Page size') }), sel, fields], get: () => ({ w, h: hh }) };
  };

  D.newDoc = function () {
    const a0 = PZ.ASPECTS[0];
    const size = sizePicker(a0.w, a0.h);
    ui.modal({ title: t('New presentation'), content: [
      ...size.el,
      h('p', { class: 'ed-hint', text: t('The current presentation stays in your browser library.') })],
    buttons: [{ label: t('Cancel'), run: (c) => c() }, { label: t('Create'), primary: true, run: (c) => { c(); E.newDoc(size.get()); } }] });
  };

  D.pageSetup = function () {
    const d = E.doc;
    const size = sizePicker(d.w, d.h);
    let scale = true;
    const th = PZ.clone(d.theme);
    ui.modal({ title: t('Page size & theme'), content: [
      ...size.el,
      ui.toggle(true, (v) => { scale = v; }, t('Scale the content to the new size')),
      h('label', { class: 'ui-label', text: t('Theme (used for new elements)') }),
      ui.row(t('Font'), ui.select(th.font, PZ.FONTS.map((f) => ({ value: f.name, label: t(f.name) })), (v) => { th.font = v; })),
      ui.row(t('Text'), ui.color(th.color, (v) => { th.color = v || th.color; })),
      ui.row(t('Accent'), ui.color(th.accent, (v) => { th.accent = v || th.accent; }), ui.color(th.accent2, (v) => { th.accent2 = v || th.accent2; })),
      ui.row(t('Background'), ui.color(th.bg, (v) => { th.bg = v || th.bg; })),
    ], buttons: [{ label: t('Cancel'), run: (c) => c() }, { label: t('Apply'), primary: true, run: (c) => {
      c();
      E.commit('Page setup', (doc) => {
        const { w: nw, h: nh } = size.get();
        if (scale && (nw !== doc.w || nh !== doc.h)) {
          const kx = nw / doc.w, ky = nh / doc.h, kf = Math.min(kx, ky);
          PZ.eachEl(doc, (el) => { el.x = Math.round(el.x * kx); el.y = Math.round(el.y * ky); el.w = Math.round(el.w * kx); el.h = Math.round(el.h * ky); if (el.style) el.style.size = Math.round(el.style.size * kf); });
        }
        doc.w = nw; doc.h = nh; doc.theme = th;
      });
      PZ.loadFonts(E.doc);
    } }] });
  };

  D.shortcuts = function () {
    const mod = PZ.isMac ? '⌘' : 'Ctrl', sh = t('Shift');
    const rows = [ // both columns go through t() when shown
      ['Editor', ''], [mod + ' S', 'Save (to the opened file, or as a new file)'], [mod + ' O', 'Open a file'], [mod + ' Z / ' + mod + ' ' + sh + ' Z', 'Undo / redo'],
      [mod + ' C / X / V', 'Copy / cut / paste (also images and text from other apps)'], [mod + ' D', 'Duplicate'], [mod + ' A', 'Select all'],
      ['Del', 'Delete'], ['Arrows (Shift)', 'Nudge 1 px (10 px)'], ['Enter / double-click', 'Edit text'], ['Enter / double-click', 'Crop the selected picture'], ['Esc', 'Stop editing / deselect'],
      [mod + ' ] / [', 'Forward / backward (Shift: front / back)'], ['T · I · R · E', 'Add text · image · rectangle · ellipse'], ['N', 'New slide'],
      ['Page ↑ / ↓', 'Previous / next slide'], ['Alt drag', 'Move without snapping'], ['Shift drag', 'Keep proportions / straight lines / 15° steps'], [mod + ' ' + t('wheel'), 'Zoom'],
      ['F5 / Shift F5', 'Present from start / from this slide'],
      ['Presenting', ''], ['→ ↓ Space PgDn', 'Next'], ['← ↑ PgUp', 'Previous'], ['Home / End', 'First / last slide'], ['3 Enter', 'Go to slide 3'], ['O', 'Overview'],
      ['S', 'Presenter view (notes, next slide, timer)'], ['B / W', 'Black / white screen'], ['F', 'Full screen'], ['Esc', 'Exit'],
    ];
    ui.modal({ title: t('Keyboard shortcuts'), content: h('table', { class: 'dlg-keys' }, rows.map(([k, v]) => v ? h('tr', null, h('td', null, h('kbd', { text: t(k) })), h('td', { text: t(v) })) : h('tr', null, h('th', { colspan: '2', text: t(k) })))) });
  };

  D.about = function () {
    ui.modal({ title: t('About PrezEn'), content: [
      h('div', { class: 'dlg-about-logo', 'aria-hidden': 'true', html: PZ.LOGO_SVG }),
      h('p', { class: 'dlg-about-link' }, h('a', { href: PZ.PUBLIC_URL, target: '_blank', rel: 'noopener', text: PZ.PUBLIC_URL.replace(/^https?:\/\//, '').replace(/\/$/, '') })),
      h('p', { text: t('PrezEn {version} builds presentations entirely in your browser. No account, no server, no tracking.', { version: PZ.VERSION }) }),
      h('ul', { class: 'dlg-list' },
        h('li', { text: t('Your work is saved in this browser (IndexedDB) and in the files you export.') }),
        h('li', { text: t('Share links carry the whole presentation after the #: it is never sent to a server.') }),
        h('li', { text: t('Only these requests leave your device: images you link to, Google Fonts when a slide uses one, and the online icon search (Iconify) when you use it.') }),
        h('li', { text: t('Exported files contain everything they need and run offline from any folder or flashdrive.') }),
        h('li', { text: t('The interface language is remembered in this browser and saved inside exported files.') })),
      h('p', { class: 'dlg-dedication', text: t('Made with love for my son Enki and his friends.') }),
    ] });
  };
})(window.PZ = window.PZ || {});
