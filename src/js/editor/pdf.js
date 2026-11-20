/* PrezEn · editor/pdf: import the pages of a PDF as new slides, either
 *   editable: text boxes, images, and the rest of the page (shapes, backgrounds) as the slide's background picture
 *   pictures: each page as one picture behind its slide (slide background, "Fit"): exact, but not editable
 *
 * Rendering uses pdf.js (Mozilla, Apache-2.0). `npm run build:pdfjs`, or the "Include the PDF reader" export option for
 * an editable file, puts it into the app as inert <script type="text/plain" data-pz="pdfjs-lib|pdfjs-worker"> nodes:
 * import then works offline. Otherwise it is fetched from jsDelivr the first time a PDF is imported, and the browser
 * checks the files against the hashes below (Subresource Integrity). */
(function (PZ) {
  'use strict';
  const h = PZ.h, E = PZ.ed, ui = PZ.ui, t = PZ.t, tn = PZ.tn;

  // build.mjs reads these two constants to bundle the very same files: keep them on one line each.
  const PDFJS_VERSION = '3.11.174';
  const PDFJS_FILES = { lib: ['pdf.min.js', 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e'], worker: ['pdf.worker.min.js', 'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2'] };
  const CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VERSION + '/';

  const P = (PZ.edPdf = {});
  const bundled = (kind) => document.querySelector('script[data-pz="pdfjs-' + kind + '"]');
  P.bundled = () => !!bundled('lib');

  async function source(kind) {
    const node = bundled(kind);
    if (node) return node.textContent;
    const [file, integrity] = PDFJS_FILES[kind];
    let res = null;
    try { res = await fetch(CDN + 'build/' + file, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', integrity }); } catch (e) { /* offline, blocked, or the hash does not match */ }
    if (!res || !res.ok) throw new Error(t('Could not download the PDF reader (pdf.js, from cdn.jsdelivr.net). Check the connection and try again.'));
    return res.text();
  }

  /** pdf.js as app sources (see PZ.appSources), for an editable file that imports PDFs offline: taken from this
   *  page when it carries it, else downloaded (onDownload() is called first). */
  P.sources = async function (onDownload) {
    if (!P.bundled() && onDownload) onDownload();
    const texts = await Promise.all([source('lib'), source('worker')]);
    // inside a <script> node, "<" + "!--" would change how the HTML parser finds its end (the hashed files have none)
    const unsafe = new RegExp('<' + '/script|<' + '!--', 'i'); // spelled in pieces: this file is inlined in a <script> too
    if (texts.some((x) => unsafe.test(x))) throw new Error(t('The PDF reader did not start.'));
    return texts.map((text, i) => ({ kind: 'js', name: 'pdfjs-' + ['lib', 'worker'][i], player: false, type: 'text/plain', text }));
  };

  function runScript(text) {
    const s = document.createElement('script');
    s.textContent = text;
    document.head.appendChild(s);
    s.remove();
  }

  let loading = null;
  /** pdf.js (window.pdfjsLib), loaded once. */
  P.load = function () {
    if (!loading) {
      loading = (async () => {
        const [lib, worker] = await Promise.all([source('lib'), source('worker')]);
        if (!window.pdfjsLib) runScript(lib);
        const L = window.pdfjsLib;
        if (!L || !L.getDocument) throw new Error(t('The PDF reader did not start.'));
        // A worker from a blob URL (a single-file app has no worker file to point at). Where workers are not
        // allowed, the worker code runs on the page instead: pdf.js finds window.pdfjsWorker and uses it.
        try { L.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(new Blob([worker], { type: 'text/javascript' }))); } catch (e) { runScript(worker); }
        return L;
      })();
      loading.catch(() => { loading = null; });
    }
    return loading;
  };

  /** Open a PDF file. askPassword(wrong) resolves to the password, or null to give up (the promise then rejects). */
  async function openPdf(file, askPassword) {
    const L = await P.load();
    const opts = { data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, fontExtraProperties: true, verbosity: L.VerbosityLevel.ERRORS }; // no eval: PDFs are untrusted
    if (!P.bundled()) Object.assign(opts, { cMapUrl: CDN + 'cmaps/', cMapPacked: true, standardFontDataUrl: CDN + 'standard_fonts/' });
    const task = L.getDocument(opts);
    task.onPassword = (update, reason) => {
      askPassword(reason === L.PasswordResponses.INCORRECT_PASSWORD).then((pw) => { if (pw == null) task.destroy(); else update(pw); });
    };
    return task.promise;
  }

  // ---------------------------------------------------------------- rendering

  /** The page drawn on a white canvas at viewport vp. */
  async function draw(page, vp) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(vp.width));
    c.height = Math.max(1, Math.round(vp.height));
    // alpha: true even though the page is opaque: an opaque canvas gets LCD (sub-pixel) text antialiasing, whose
    // coloured fringes would be baked into the picture and skew the measured text colours
    const ctx = c.getContext('2d', { alpha: true, willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return c;
  }
  const free = (...cs) => cs.forEach((c) => { if (c) c.width = c.height = 0; }); // release bitmaps now, not at the next GC

  /** The slide background for a rendered page: a plain colour when the page is uniform, else its picture. */
  function background(c, box) {
    const ctx = c.getContext('2d');
    const plain = uniformColor(ctx, c.width, c.height);
    if (plain) return { color: plain };
    return { src: encode(c), edge: edgeColor(ctx, c.width, c.height, c.width / c.height < box.w / box.h) };
  }

  /** Picture mode: page n as one picture fitting box {w, h}. Returns {bg: {src, edge}, notes, images: [], texts: []}. */
  async function renderPage(pdf, n, box, withText) {
    const page = await pdf.getPage(n);
    try {
      const v1 = page.getViewport({ scale: 1 });
      const c = await draw(page, page.getViewport({ scale: Math.min(box.w / v1.width, box.h / v1.height) }));
      const ctx = c.getContext('2d');
      const out = { bg: { src: encode(c), edge: edgeColor(ctx, c.width, c.height, c.width / c.height < box.w / box.h) }, notes: '', images: [], texts: [] };
      if (withText) out.notes = pageText(await page.getTextContent());
      free(c);
      return out;
    } finally { page.cleanup(); }
  }

  /** WebP (JPEG where the browser cannot write WebP), or PNG when it is not much bigger: sharper text on plain pages.
   *  alpha: keep transparency (PNG instead of JPEG). */
  function encode(c, alpha) {
    let lossy = c.toDataURL('image/webp', 0.9);
    if (!lossy.startsWith('data:image/webp')) lossy = alpha ? '' : c.toDataURL('image/jpeg', 0.9);
    const png = c.toDataURL('image/png');
    return !lossy || png.length <= lossy.length * 1.2 ? png : lossy;
  }

  const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  /** The colour of a page with nothing on it (sampled on a grid), or '' when something is drawn. */
  function uniformColor(ctx, w, hh) {
    const d = ctx.getImageData(0, 0, w, hh).data;
    const step = Math.max(1, Math.floor(Math.min(w, hh) / 120));
    const r = d[0], g = d[1], b = d[2];
    for (let y = 0; y < hh; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        if (Math.abs(d[i] - r) + Math.abs(d[i + 1] - g) + Math.abs(d[i + 2] - b) > 6) return '';
      }
    }
    return hex(r, g, b);
  }

  // ---------------------------------------------------------------- editable mode
  /* A page as PrezEn elements: its text as text boxes, its pictures as images, and everything else (shapes,
   * gradients, decorations) as the slide's background picture. pdf.js cannot render a page without its text, but
   * once a page is rendered it keeps the page's drawing operations (its operator list) and replays them for the
   * next render: turning the text and picture operations into no-ops gives that background. Renders with and
   * without the text also give each text's colour (the pixels it changed) and tell hidden text (the invisible layer
   * of scanned documents) from visible text. This uses pdf.js internals (page._intentStates), fine with the exact
   * version pinned above; a page where it fails is imported in picture mode. */

  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];

  /** Indexes of the text drawing operations, and the pictures with their transform (device pixels). */
  function scanOps(O, ops, vp) {
    const text = [], images = [], stack = [];
    let ctm = vp.transform.slice(), annot = 0;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === O.save) stack.push(ctm);
      else if (fn === O.restore || fn === O.paintFormXObjectEnd || fn === O.endGroup) ctm = stack.pop() || ctm;
      else if (fn === O.transform) ctm = mul(ctm, a);
      else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); if (a[0] && a[0].length === 6) ctm = mul(ctm, a[0]); }
      else if (fn === O.beginGroup) { stack.push(ctm); if (a[0] && a[0].matrix) ctm = mul(ctm, a[0].matrix); }
      else if (fn === O.beginAnnotation) { stack.push(ctm); annot++; } // form fields, stamps…: left in the picture
      else if (fn === O.endAnnotation) { ctm = stack.pop() || ctm; annot--; }
      else if (annot) continue;
      else if (fn === O.showText || fn === O.showSpacedText || fn === O.nextLineShowText || fn === O.nextLineSetSpacingShowText) text.push(i);
      else if (fn === O.paintImageXObject) images.push({ i, ref: a[0], m: ctm });
      else if (fn === O.paintInlineImageXObject) images.push({ i, data: a[0], m: ctm });
    }
    return { text, images };
  }

  // ---- fonts
  // A text keeps its PDF font when this computer has it (decks are often imported by whoever made them). The PDF
  // base fonts and TeX fonts become their metric twins (Linux maps these names to the Liberation fonts), fonts PrezEn
  // knows keep their name (Google fonts load online), anything else becomes System Sans / Serif / Mono.
  const FONT_TWINS = [
    [/^(helvetica|arial|nimbussans|liberationsans|arimo|freesans|cmss|lmsans)/, 'Arial'],
    [/^(times|nimbusroman|liberationserif|tinos|freeserif|cmr\d|cmbx|cmti|cmmi|cmsy|cmex|lmroman|lmmath)/, 'Times New Roman'],
    [/^(courier|nimbusmono|liberationmono|cousine|freemono|cmtt|lmmono)/, 'Courier New'],
  ];
  const squash = (s) => s.replace(/[\s_-]/g, '').toLowerCase();
  let probeCtx = null;
  const probe = () => probeCtx || (probeCtx = document.createElement('canvas').getContext('2d'));
  const installed = new Map();
  /** Is this font on this computer? (it changes the width of a sample compared with each generic family) */
  function hasFont(name) {
    if (!installed.has(name)) {
      const w = (f) => { probe().font = '40px ' + f; return probe().measureText('mmmmmmmmmmlliWWwi0O@#%&').width; };
      installed.set(name, ['monospace', 'serif', 'sans-serif'].some((g) => Math.abs(w(`'${name}', ${g}`) - w(g)) > 0.5));
    }
    return installed.get(name);
  }
  /** Family names a PostScript font name may stand for: "DejaVuSans-Bold" → "Deja Vu Sans", "DejaVu Sans", … */
  function familyNames(raw) {
    const base = raw.split(/[-,]/)[0].replace(/(PSMT|MT|PS|Std|Pro|LT|OT)$/, '').replace(/_/g, ' ');
    const words = base.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/\s+/).filter(Boolean).slice(0, 5);
    const out = [];
    for (let mask = 0; mask < 1 << Math.max(0, words.length - 1); mask++) { // each gap: a space or not
      out.push(words.reduce((acc, wd, i) => (i ? acc + ((mask >> (i - 1)) & 1 ? '' : ' ') + wd : wd), ''));
    }
    return out.filter((n) => /^[\w \-]{1,60}$/.test(n));
  }
  function mapFont(f, style) {
    const raw = String((f && f.name) || '').replace(/^[A-Z]{6}\+/, '');
    const key = squash(raw.split(/[-,]/)[0]);
    const mono = (f && f.isMonospace) || (style && style.fontFamily === 'monospace');
    const serif = (f && f.isSerifFont) || (style && style.fontFamily === 'serif');
    const known = key && PZ.FONTS.find((x) => x.google != null && squash(x.name) === key.replace(/(mt|ps|std|pro)$/, ''));
    const twin = key && FONT_TWINS.find(([re]) => re.test(key));
    let font = known ? known.name : twin && hasFont(twin[1]) ? twin[1] : twin ? '' : familyNames(raw).find(hasFont) || '';
    if (!font) font = mono ? 'System Mono' : serif ? 'System Serif' : 'System Sans';
    return {
      font,
      bold: !!(f && (f.bold || f.black)) || /bold|black|heavy|semibold|demibold|cmbx/i.test(raw),
      italic: !!(f && f.italic) || /italic|oblique|cmti|cmmi/i.test(raw),
    };
  }
  /** Wait (a little) for the Google fonts a page uses, so that measuring uses them. */
  async function fontsReady(names) {
    const web = Array.from(new Set(names)).filter((n) => PZ.googleFontUrl(n));
    if (!web.length) return;
    web.forEach((n) => PZ.loadFont(n));
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    await Promise.race([wait(3000), Promise.all(web.map(async (n) => {
      const link = document.querySelector(`link[data-pz-font="${CSS.escape(n)}"]`);
      if (link && !link.sheet) await new Promise((res) => { link.addEventListener('load', res, { once: true }); link.addEventListener('error', res, { once: true }); });
      await Promise.all(['400', '700'].map((wgt) => document.fonts.load(`${wgt} 40px '${n}'`).catch(() => null)));
    }))]);
  }
  /** How much wider than in the PDF the line comes out in its PrezEn font (1 = same width). */
  function widthRatio(l, q) {
    let w = 0;
    for (const r of l.runs) {
      probe().font = `${r.italic ? 'italic ' : ''}${r.bold ? 700 : 400} ${r.size * q}px ${PZ.fontStack(r.font)}`;
      w += probe().measureText(r.str).width;
    }
    const last = l.runs[l.runs.length - 1], orig = (last.x + last.len - l.runs[0].x) * q;
    return orig > 1 ? w / orig : 1;
  }

  /** Visible text pieces of the page, in device pixels, with their font, colour and baseline. */
  function textRuns(page, tc, vp, withText, noText) {
    const W = withText.width, H = withText.height;
    const A = withText.getContext('2d').getImageData(0, 0, W, H).data, B = noText.getContext('2d').getImageData(0, 0, W, H).data;
    const fonts = new Map();
    const runs = [];
    let chars = 0, bad = 0;
    for (const it of tc.items) {
      if (!it.str || !it.transform || !it.str.trim()) continue; // marked content, and spaces (gaps give them back)
      const st = tc.styles[it.fontName] || {};
      const m = mul(vp.transform, it.transform);
      const size = Math.hypot(m[2], m[3]);
      if (size < 2) continue;
      const angle = Math.atan2(m[1], m[0]), cos = Math.cos(angle), sin = Math.sin(angle);
      const len = (st.vertical ? it.height : it.width) * vp.scale;
      const asc = st.ascent > 0 && st.ascent < 1.5 ? st.ascent : 0.8, desc = st.descent < 0 && st.descent > -1 ? -st.descent : 0.2;
      const pts = [[0, -asc], [len / size, -asc], [0, desc], [len / size, desc]].map(([u, v]) => [m[4] + (u * cos - v * sin) * size, m[5] + (u * sin + v * cos) * size]);
      const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])))), x1 = Math.min(W, Math.ceil(Math.max(...pts.map((p) => p[0]))));
      const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])))), y1 = Math.min(H, Math.ceil(Math.max(...pts.map((p) => p[1]))));
      if (x1 <= x0 || y1 <= y0) continue; // off the page
      // colour: the pixels the text changed the most (the cores of the strokes, not their blended edges)
      let max = 0;
      for (let y = y0; y < y1; y++) for (let x = x0, i = (y * W + x0) * 4; x < x1; x++, i += 4) {
        const dd = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
        if (dd > max) max = dd;
      }
      if (max < 40) continue; // invisible (OCR layer, hidden under a picture, white on white)
      const core = [[], [], []];
      for (let y = y0; y < y1; y++) for (let x = x0, i = (y * W + x0) * 4; x < x1; x++, i += 4) {
        const dd = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
        if (dd >= max * 0.85) { core[0].push(A[i]); core[1].push(A[i + 1]); core[2].push(A[i + 2]); }
      }
      const [r, g, b] = core.map((c) => c.sort((u, v) => u - v)[c.length >> 1]);
      if (!fonts.has(it.fontName)) { let f = null; try { f = page.commonObjs.get(it.fontName); } catch (e) { /* not loaded */ } fonts.set(it.fontName, mapFont(f, st)); }
      const fi = fonts.get(it.fontName);
      chars += it.str.length;
      bad += (it.str.match(/[-�\u0000-\u0008\u000E-\u001F]/g) || []).length;
      runs.push({ str: it.str, x: m[4], y: m[5], len, size, angle, color: hex(r, g, b), font: fi.font, bold: fi.bold, italic: fi.italic });
    }
    return { runs, garbled: chars > 0 && bad / chars > 0.1 };
  }

  const colorDist = (a, b) => { const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16); return Math.abs((p >> 16) - (q >> 16)) + Math.abs(((p >> 8) & 255) - ((q >> 8) & 255)) + Math.abs((p & 255) - (q & 255)); };
  const sameLook = (a, b) => a.font === b.font && a.bold === b.bold && a.italic === b.italic && colorDist(a.color, b.color) < 40 && Math.abs(a.size - b.size) < 0.12 * Math.max(a.size, b.size);
  /** The style most of the characters have. */
  function dominant(runs) {
    const score = new Map();
    let best = runs[0], top = -1;
    for (const r of runs) {
      const k = [r.font, r.bold, r.italic, r.color, Math.round(r.size)].join('|');
      const v = (score.get(k) || 0) + r.str.length;
      score.set(k, v);
      if (v > top) { top = v; best = r; }
    }
    return best;
  }

  /** Horizontal runs → lines: same baseline (bands), sorted left to right, split where the gap is wide (columns). */
  function buildLines(runs) {
    const sorted = runs.slice().sort((a, b) => a.y - b.y);
    const bands = [];
    for (const r of sorted) {
      const band = bands[bands.length - 1];
      if (band && Math.abs(r.y - band.y) < 0.35 * Math.min(band.size, r.size)) band.runs.push(r);
      else bands.push({ y: r.y, size: r.size, runs: [r] });
    }
    const lines = [];
    for (const band of bands) {
      let line = null;
      for (let r of band.runs.sort((a, b) => a.x - b.x)) {
        const gap = line ? r.x - line.x1 : 0;
        if (line && Math.abs(r.x - line.last.x) < 0.3 * r.size && r.str === line.last.str) continue; // drawn twice (fake bold, shadow)
        if (!line || gap > 1.6 * Math.max(r.size, line.last.size)) {
          line = { x0: r.x, x1: r.x + r.len, runs: [], last: r };
          lines.push(line);
        } else if (gap > 0.15 * r.size && !/\s$/.test(line.last.str) && !/^\s/.test(r.str)) r = Object.assign({}, r, { str: ' ' + r.str });
        line.runs.push(r);
        line.last = r;
        line.x1 = Math.max(line.x1, r.x + r.len);
      }
    }
    for (const l of lines) {
      const d = dominant(l.runs);
      Object.assign(l, { y: d.y, size: d.size, style: d, cx: (l.x0 + l.x1) / 2 });
      delete l.last;
    }
    return lines.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  }

  /** Lines → text blocks: consecutive lines of one look, regular spacing, and one alignment (left, centre, right). */
  function buildBlocks(lines) {
    const blocks = [];
    for (const l of lines) {
      let into = null;
      for (let k = blocks.length - 1; k >= 0 && k >= blocks.length - 6; k--) {
        const b = blocks[k], prev = b.lines[b.lines.length - 1];
        const gap = l.y - prev.y, tol = 0.5 * l.size;
        if (!sameLook(b.style, l.style) || gap < 0.8 * l.size || gap > 1.9 * l.size) continue;
        if (b.gap && Math.abs(gap - b.gap) > 0.25 * b.gap) continue;
        if (l.x0 > b.x1 || l.x1 < b.x0) continue;
        const fits = { left: Math.abs(l.x0 - b.x0) < tol, center: Math.abs(l.cx - (b.x0 + b.x1) / 2) < tol, right: Math.abs(l.x1 - b.x1) < tol };
        const align = b.align ? (fits[b.align] ? b.align : '') : ['left', 'center', 'right'].find((a) => fits[a]);
        if (!align) continue;
        into = b; b.align = align; b.gap = b.gap || gap;
        break;
      }
      if (into) { into.lines.push(l); into.x0 = Math.min(into.x0, l.x0); into.x1 = Math.max(into.x1, l.x1); } else blocks.push({ lines: [l], x0: l.x0, x1: l.x1, style: l.style, align: '', gap: 0 });
    }
    return blocks;
  }

  /** Rich text of a block: runs that differ from its style get a span; wrapped paragraph lines are joined. */
  function blockHtml(b, q, k) {
    const S = b.style;
    const css = (r) => [
      r.bold !== S.bold ? 'font-weight:' + (r.bold ? 700 : 400) : '',
      r.italic !== S.italic ? 'font-style:' + (r.italic ? 'italic' : 'normal') : '',
      colorDist(r.color, S.color) >= 40 ? 'color:' + r.color : '',
      r.font !== S.font ? 'font-family:' + PZ.fontStack(r.font).replace(/"/g, "'") : '',
      Math.abs(r.size - S.size) >= 0.12 * S.size ? 'font-size:' + PZ.round(r.size * q * k, 1) + 'px' : '',
    ].filter(Boolean).join(';');
    let html = '';
    b.lines.forEach((l, i) => {
      let cur = null, buf = '';
      const flush = () => { if (buf) html += cur ? `<span style="${cur}">${PZ.escapeHtml(buf)}</span>` : PZ.escapeHtml(buf); buf = ''; };
      for (const r of l.runs) { const c = css(r); if (c !== cur) { flush(); cur = c; } buf += r.str; }
      flush();
      const next = b.lines[i + 1];
      if (!next) return;
      // a full-width line followed by more of the paragraph (not a new bullet) was wrapped by the PDF: let it reflow
      const end = l.runs[l.runs.length - 1].str, start = next.runs[0].str.trimStart();
      const wrapped = (b.align || 'left') === 'left' && l.x1 - l.x0 >= 0.8 * (b.x1 - b.x0) && !/^[•·▪‣◦●○■□➢►✓\-–*]|^\d+[.)]\s/.test(start);
      html += !wrapped ? '<br>' : /[-‐]$/.test(end) ? '' : ' ';
    });
    return html;
  }

  /** Where a picture of the page goes on the slide, or null to leave it in the background picture: turned or
   *  upside down, cut by the page edge, tiny, or covering (almost) the whole page. */
  function pictureBox(m, W, H, q, ox, oy) {
    if (Math.abs(m[1]) > 0.01 * Math.abs(m[0]) || Math.abs(m[2]) > 0.01 * Math.abs(m[3]) || m[3] >= 0) return null;
    const w = Math.abs(m[0]), hh = -m[3];
    const x = m[0] > 0 ? m[4] : m[4] + m[0], y = m[5] + m[3];
    if (x < -1 || y < -1 || x + w > W + 1 || y + hh > H + 1) return null;
    if (w * q < 16 || hh * q < 16 || w * hh > 0.85 * W * H) return null;
    return { x: ox + x * q, y: oy + y * q, w: w * q, h: hh * q, flip: m[0] < 0, dev: Math.max(w, hh) };
  }

  /** A pdf.js image object (ImageBitmap, or raw pixels) as a data URL, at most maxDim pixels on its long side. */
  function pictureData(img, maxDim) {
    if (!img || !(img.width > 0) || !(img.height > 0)) return '';
    let src = img.bitmap;
    if (!src) {
      if (!img.data) return '';
      src = document.createElement('canvas');
      src.width = img.width; src.height = img.height;
      const sctx = src.getContext('2d');
      const out = sctx.createImageData(img.width, img.height), o = out.data, s = img.data;
      if (img.kind === 3) o.set(s.subarray(0, o.length));
      else if (img.kind === 2) for (let p = 0, k = 0; k < o.length; p += 3, k += 4) { o[k] = s[p]; o[k + 1] = s[p + 1]; o[k + 2] = s[p + 2]; o[k + 3] = 255; }
      else if (img.kind === 1) {
        const row = (img.width + 7) >> 3;
        for (let y = 0, k = 0; y < img.height; y++) for (let x = 0; x < img.width; x++, k += 4) { const v = (s[y * row + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0; o[k] = o[k + 1] = o[k + 2] = v; o[k + 3] = 255; }
      } else return '';
      sctx.putImageData(out, 0, 0);
    }
    const k = Math.min(1, maxDim / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const a = ctx.getImageData(0, 0, c.width, c.height).data;
    let alpha = false;
    for (let i = 3; i < a.length; i += 4) if (a[i] < 255) { alpha = true; break; }
    const url = encode(c, alpha);
    free(c, src instanceof HTMLCanvasElement ? src : null);
    return url;
  }

  /** Font size factor and box width factor for text that comes out wider than in the PDF (another font): shrink
   *  it a little (down to 85%), then widen the box for the rest, so lines break where they do in the PDF. */
  function fitting(ratio) {
    const k = ratio > 1.02 ? Math.max(0.85, 1 / ratio) : 1;
    return { k, wide: Math.max(1, ratio * k) };
  }

  /** Text box (slide coordinates) for a block of horizontal lines. */
  function textBox(b, q, ox, oy, pageW) {
    const S = b.style;
    const { k, wide } = fitting(Math.max(...b.lines.map((l) => widthRatio(l, q))));
    const size = S.size * q * k;
    const lh = b.lines.length > 1 ? PZ.clamp(b.gap / S.size / k, 0.5, 4) : 1.2;
    let align = b.align || 'left';
    if (b.lines.length === 1 && Math.abs((b.x0 + b.x1) / 2 - pageW / 2) < 0.015 * pageW && b.x1 - b.x0 < 0.9 * pageW) align = 'center';
    const L = lh * size;
    const base = (L - 1.15 * size) / 2 + 0.93 * size; // baseline below the top of the first line, for usual fonts
    let x = ox + b.x0 * q, w = (b.x1 - b.x0) * q * wide;
    const extra = Math.max(0.04 * w, 0.3 * size); // measuring is not exact to the pixel
    const grow = w + extra - (b.x1 - b.x0) * q;
    if (align === 'center') x -= grow / 2; else if (align === 'right') x -= grow;
    w += extra;
    return {
      x: Math.round(x), y: Math.round(oy + b.lines[0].y * q - base), w: Math.round(w), h: Math.round(b.lines.length * L), rot: 0,
      html: blockHtml(b, q, k),
      style: { font: S.font, size: PZ.round(size, 1), color: S.color, bold: S.bold, italic: S.italic, align, lh: PZ.round(lh, 2) },
    };
  }

  /** Text box for one turned run: rotated around its centre so that its baseline lands where the PDF has it. */
  function turnedBox(r, q, ox, oy) {
    const { k, wide } = fitting(widthRatio({ runs: [r] }, q));
    const size = r.size * q * k, L = 1.2 * size, w = r.len * q * wide + 0.3 * size;
    const base = (L - 1.15 * size) / 2 + 0.93 * size;
    const cos = Math.cos(r.angle), sin = Math.sin(r.angle);
    const u = -w / 2, v = base - L / 2; // baseline start, relative to the box centre, before turning
    const cx = ox + r.x * q - (u * cos - v * sin), cy = oy + r.y * q - (u * sin + v * cos);
    return {
      x: Math.round(cx - w / 2), y: Math.round(cy - L / 2), w: Math.round(w), h: Math.round(L), rot: PZ.round((r.angle * 180) / Math.PI, 1),
      html: PZ.escapeHtml(r.str),
      style: { font: r.font, size: PZ.round(size, 1), color: r.color, bold: r.bold, italic: r.italic, align: 'left', lh: 1.2 },
    };
  }

  /** Editable mode: page n as {bg, images, texts, notes} (slide coordinates for a slide of size slide {w, h}). */
  async function extractPage(L, pdf, n, box, withNotes, slide) {
    const page = await pdf.getPage(n);
    let ops = null;
    const muted = [];
    const mute = (i) => { muted.push([i, ops.fnArray[i], ops.argsArray[i]]); ops.fnArray[i] = L.OPS.dependency; ops.argsArray[i] = []; };
    const canvases = [];
    try {
      const v1 = page.getViewport({ scale: 1 });
      const r = Math.min(box.w / v1.width, box.h / v1.height), vp = page.getViewport({ scale: r });
      const full = await draw(page, vp);
      canvases.push(full);
      const st = page._intentStates && Array.from(page._intentStates.values()).find((s) => s.operatorList && s.operatorList.lastChunk && s.operatorList.fnArray.length);
      if (!st) throw new Error('No operator list');
      ops = st.operatorList;
      const scan = scanOps(L.OPS, ops, vp);
      const tc = await page.getTextContent();
      const s = Math.min(slide.w / v1.width, slide.h / v1.height), q = s / r; // device pixels → slide units
      const ox = (slide.w - v1.width * s) / 2, oy = (slide.h - v1.height * s) / 2;
      const out = { notes: withNotes ? pageText(tc) : '', images: [], texts: [] };

      // text: render without it, compare, keep the visible pieces as text boxes
      if (scan.text.length) {
        scan.text.forEach(mute);
        const noText = await draw(page, vp);
        canvases.push(noText);
        const { runs, garbled } = textRuns(page, tc, vp, full, noText);
        if (garbled) { // no usable Unicode in this PDF's fonts: keep its text in the picture
          for (const [i, f, a] of muted.splice(0)) { ops.fnArray[i] = f; ops.argsArray[i] = a; }
        } else {
          await fontsReady(runs.map((x) => x.font));
          const flat = runs.filter((x) => Math.abs(x.angle) < 0.02), turned = runs.filter((x) => Math.abs(x.angle) >= 0.02);
          for (const b of buildBlocks(buildLines(flat))) out.texts.push(textBox(b, q, ox, oy, full.width));
          for (const x of turned) out.texts.push(turnedBox(x, q, ox, oy));
        }
      }

      // pictures
      for (const im of scan.images) {
        const at = pictureBox(im.m, full.width, full.height, q, ox, oy);
        if (!at) continue;
        let obj = im.data;
        if (!obj) { try { obj = (im.ref.startsWith('g_') ? page.commonObjs : page.objs).get(im.ref); } catch (e) { obj = null; } }
        const src = pictureData(obj, Math.min(2400, Math.max(512, Math.ceil(at.dev * 1.5))));
        if (!src) continue;
        out.images.push({ src, x: Math.round(at.x), y: Math.round(at.y), w: Math.round(at.w), h: Math.round(at.h), flip: at.flip });
        mute(im.i);
      }

      // what is left: the background
      const rest = muted.length ? await draw(page, vp) : full;
      canvases.push(rest);
      out.bg = background(rest, box);
      return out;
    } finally {
      if (ops) for (const [i, f, a] of muted) { ops.fnArray[i] = f; ops.argsArray[i] = a; }
      free(...canvases);
      page.cleanup();
    }
  }

  /** Main colour along the edges facing the bars (left and right ones when the page is narrower than the slide):
   *  the slide's background colour, so a page of another shape blends in. */
  function edgeColor(ctx, w, hh, sides) {
    const strips = sides ? [[0, 0, 1, hh], [w - 1, 0, 1, hh]] : [[0, 0, w, 1], [0, hh - 1, w, 1]];
    const buckets = new Map();
    let best = null;
    for (const [x, y, sw, sh] of strips) {
      const d = ctx.getImageData(x, y, sw, sh).data;
      for (let i = 0; i < d.length; i += 4) {
        const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
        let b = buckets.get(k);
        if (!b) buckets.set(k, (b = [0, 0, 0, 0]));
        b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++;
        if (!best || b[3] > best[3]) best = b;
      }
    }
    if (!best) return '#ffffff';
    return '#' + [0, 1, 2].map((i) => Math.round(best[i] / best[3]).toString(16).padStart(2, '0')).join('');
  }

  function pageText(tc) {
    let s = '';
    for (const it of tc.items) if (typeof it.str === 'string') s += it.str + (it.hasEOL ? '\n' : '');
    return s.replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000);
  }

  const ratio = (w, hh) => {
    const known = [[16, 9], [16, 10], [4, 3], [3, 2], [1, 1], [21, 9], [3, 4], [9, 16]].find(([a, b]) => Math.abs(w / hh - a / b) < 0.02);
    if (known) return known.join(':');
    if (Math.abs(w / hh - 297 / 210) < 0.02) return t('A4 landscape');
    if (Math.abs(w / hh - 210 / 297) < 0.02) return t('A4 portrait');
    return (w / hh).toFixed(2) + ':1';
  };

  // ---------------------------------------------------------------- dialog

  P.internals = { buildLines, buildBlocks, blockHtml, familyNames, pictureBox, scanOps }; // for tests

  /** Choose a PDF file, then import it at slide index `at` (default: after the current slide). */
  P.pick = function (at) {
    const input = h('input', { type: 'file', accept: 'application/pdf,.pdf', style: 'display:none' });
    input.addEventListener('change', () => { const f = input.files[0]; input.remove(); if (f) P.open(f, at); });
    input.addEventListener('cancel', () => input.remove());
    document.body.appendChild(input);
    input.click();
  };

  /** Import dialog for a PDF file: pages, resolution, notes; inserts the slides at index `at`. */
  P.open = async function (file, at) {
    if (E.editing) PZ.edStage.endEdit();
    if (at == null) at = E.cur + 1;
    const d = E.doc;
    let pdf = null, closed = false, busy = false, primaryRun = null, unlock = null;
    const status = h('p', { class: 'dlg-status', text: P.bundled() || window.pdfjsLib ? t('Opening the PDF…') : t('Loading the PDF reader…') });
    const body = h('div', { class: 'dlg-pdf' }, status);
    const m = ui.modal({
      title: t('Import PDF'), content: body,
      onClose: () => { closed = true; if (unlock) unlock(null); if (pdf) pdf.destroy(); },
      buttons: [{ label: t('Cancel'), run: (c) => c() }, { label: t('Import'), primary: true, run: () => { if (primaryRun) primaryRun(); } }],
    });
    const okBtn = m.foot.querySelector('.ui-primary');
    okBtn.disabled = true;
    const fail = (msg) => { body.replaceChildren(h('p', { class: 'ed-warn', text: msg })); okBtn.disabled = true; };

    const askPassword = (wrong) => new Promise((resolve) => {
      const input = h('input', { class: 'ui-input', type: 'password', autocomplete: 'off', 'aria-label': t('Password') });
      unlock = (v) => { unlock = null; primaryRun = null; okBtn.disabled = true; resolve(v); };
      primaryRun = () => unlock(input.value);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); primaryRun(); } });
      body.replaceChildren(h('p', { text: wrong ? t('Wrong password. Try again.') : t('This PDF is protected by a password.') }), input);
      okBtn.textContent = t('Unlock');
      okBtn.disabled = false;
      setTimeout(() => input.focus(), 30);
    });

    try {
      pdf = await openPdf(file, askPassword);
    } catch (e) {
      if (closed) return;
      if (e && e.name === 'PasswordException') { m.close(); return; }
      fail(e && e.name === 'InvalidPDFException' ? t('{name} is not a PDF file, or it is damaged.', { name: file.name }) : (e && e.message) || String(e));
      return;
    }
    if (closed) { pdf.destroy(); return; }

    // ---- options
    const total = pdf.numPages;
    const first = await pdf.getPage(1);
    const v1 = first.getViewport({ scale: 1 });
    first.cleanup();
    if (closed) return;
    let mode = 'edit';
    try { if (localStorage.getItem('prezen:pdf-mode') === 'picture') mode = 'picture'; } catch (e) { /* default */ }
    const opt = { from: 1, to: total, sharp: false, notes: false, mode };
    const base = Math.max(1, 1920 / Math.max(d.w, d.h)); // small custom slide sizes still get a sharp picture
    const boxFor = (sharp) => { const k = base * (sharp ? 2 : 1); return { w: Math.min(4096, Math.round(d.w * k)), h: Math.min(4096, Math.round(d.h * k)) }; };
    const count = () => Math.max(0, opt.to - opt.from + 1);
    const sync = () => {
      okBtn.textContent = tn('Import {n} slide', 'Import {n} slides', count());
      okBtn.disabled = count() < 1;
    };

    const preview = h('div', { class: 'dlg-pdf-prev' });
    let prevToken = 0;
    const showPreview = PZ.debounce(async () => {
      const token = ++prevToken;
      try {
        const page = await pdf.getPage(opt.from);
        const vp0 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: Math.min(240 / vp0.width, 160 / vp0.height) * (window.devicePixelRatio || 1) });
        const c = h('canvas', { width: Math.round(vp.width), height: Math.round(vp.height), 'aria-label': t('Page {n}', { n: opt.from }) });
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        page.cleanup();
        if (token === prevToken && !closed) preview.replaceChildren(c);
      } catch (e) { /* preview only */ }
    }, 200);

    const num = (key) => ui.number(opt[key], (v, done) => {
      opt[key] = PZ.clamp(Math.round(v), 1, total);
      if (key === 'from' && opt.to < opt.from) opt.to = opt.from;
      if (key === 'to' && opt.from > opt.to) opt.from = opt.to;
      if (done) { fromIn.querySelector('input').value = opt.from; toIn.querySelector('input').value = opt.to; }
      sync();
      if (key === 'from' || opt.from === opt.to) showPreview();
    }, { min: 1, max: total, decimals: 0 });
    const fromIn = num('from'), toIn = num('to');

    const modeHint = h('p', { class: 'ed-hint' });
    const explain = () => {
      modeHint.textContent = opt.mode === 'edit'
        ? t('Text becomes text boxes you can edit and pictures become images you can move. Shapes and backgrounds stay as a picture behind the slide. Fonts missing on this computer are replaced by similar ones: check the layout.')
        : t('Each page becomes a picture behind a new slide: exactly like the PDF, but its text cannot be edited. Add text, shapes or animations on top.');
    };
    const pageRatio = v1.width / v1.height, slideRatio = d.w / d.h;
    const sizeInfo = (sharp) => { const b = boxFor(sharp), k = Math.min(b.w / v1.width, b.h / v1.height); return Math.round(v1.width * k) + ' × ' + Math.round(v1.height * k); };
    body.replaceChildren(...[ // (replaceChildren would write "null" for the rows left out)
      h('div', { class: 'dlg-pdf-head' }, preview,
        h('div', { class: 'dlg-pdf-file' }, h('b', { text: file.name }), h('span', { class: 'ed-hint', text: tn('{n} page', '{n} pages', total) + ' · ' + ratio(v1.width, v1.height) }))),
      total > 1 ? ui.row(t('Pages'), h('div', { class: 'dlg-pdf-range' }, fromIn, h('span', { text: t('to') }), toIn)) : null,
      ui.row(t('Import as'), ui.seg(opt.mode, [{ value: 'edit', label: t('Editable') }, { value: 'picture', label: t('Pictures') }], (v) => {
        opt.mode = v;
        try { localStorage.setItem('prezen:pdf-mode', v); } catch (e) { /* this time only */ }
        explain();
      })),
      ui.row(t('Resolution'), ui.select('std', [{ value: 'std', label: t('Standard ({size})', { size: sizeInfo(false) }) }, { value: 'sharp', label: t('Sharp ({size}), bigger file', { size: sizeInfo(true) }) }], (v) => { opt.sharp = v === 'sharp'; })),
      ui.toggle(false, (v) => { opt.notes = v; }, t('Copy the text of each page into the speaker notes')),
      Math.abs(pageRatio - slideRatio) > 0.02
        ? h('p', { class: 'ed-hint', text: t('The pages ({page}) are not the shape of the slides ({slide}): each page is centred and the rest of the slide takes the colour of its edges.', { page: ratio(v1.width, v1.height), slide: ratio(d.w, d.h) }) })
        : null,
      modeHint].filter(Boolean));
    explain();
    sync();
    showPreview();

    // ---- import
    primaryRun = async () => {
      if (busy || count() < 1) return;
      busy = true;
      okBtn.disabled = true;
      const box = boxFor(opt.sharp);
      const pages = Array.from({ length: count() }, (_, i) => opt.from + i);
      const bar = h('progress', { class: 'dlg-progress', max: pages.length, value: 0 });
      const line = h('p', { class: 'dlg-status' });
      body.replaceChildren(line, bar);
      const made = [], failed = [];
      for (let i = 0; i < pages.length; i++) {
        line.textContent = t('Page {i} of {n}…', { i: i + 1, n: pages.length });
        bar.value = i;
        try {
          let p = null;
          if (opt.mode === 'edit') { try { p = await extractPage(window.pdfjsLib, pdf, pages[i], box, opt.notes, d); } catch (e) { if (closed) return; console.warn('PDF page ' + pages[i] + ' imported as a picture:', e); } }
          made.push(p || (await renderPage(pdf, pages[i], box, opt.notes)));
        } catch (e) { if (closed) return; failed.push(pages[i]); }
        if (closed) return;
      }
      pdf.destroy(); pdf = null;
      m.close();
      if (!made.length) { PZ.toast(t('No page of this PDF could be read.'), { type: 'error' }); return; }
      const near = E.doc.slides[at - 1] || E.slide();
      const transition = PZ.clone(near.transition);
      E.commit('Import PDF', (doc) => {
        const slides = made.map((p) => {
          const s = PZ.newSlide(doc, 'blank');
          s.bg = { type: p.bg.src ? 'image' : 'color', color: p.bg.edge || p.bg.color, color2: '#5b5bf0', angle: 135, radial: false,
            src: p.bg.src ? PZ.addAsset(doc, p.bg.src) : '', fit: 'contain', overlay: '#000000', overlayOpacity: 0, page: !!p.bg.src };
          s.els = p.images.map((im) => PZ.make.image(doc, { x: im.x, y: im.y, w: im.w, h: im.h, src: PZ.addAsset(doc, im.src), fit: 'fill', flip: im.flip }))
            .concat(p.texts.map((x) => PZ.make.text(doc, { x: x.x, y: x.y, w: x.w, h: x.h, rot: x.rot, html: x.html, autoH: true, style: x.style })));
          s.transition = PZ.clone(transition);
          s.notes = p.notes;
          return s;
        });
        doc.slides.splice(at, 0, ...slides);
      });
      PZ.loadFonts(E.doc);
      E.goSlide(at);
      E.refresh('slides');
      PZ.toast(tn('Imported {n} slide from {name}.', 'Imported {n} slides from {name}.', made.length, { name: file.name }));
      if (failed.length) PZ.toast(t('These pages could not be read: {list}.', { list: failed.join(', ') }), { type: 'warn', timeout: 8000 });
    };
  };
})(window.PZ = window.PZ || {});
