/* PrezEn · core: namespace, DOM helpers and small utilities shared by every part of the app.
 * Every file is a classic script (not an ES module) so the app also runs from file:// (flashdrive). */
(function (PZ) {
  'use strict';

  PZ.VERSION = '0.1.0';
  PZ.APP = 'PrezEn';
  // Where the hosted app lives. Share links point here when the app runs from a local file.
  PZ.PUBLIC_URL = 'https://valkea.github.io/Prezen/';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  PZ.SVG_NS = SVG_NS;

  PZ.uid = function (prefix) {
    return (prefix || '') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  };
  PZ.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  PZ.round = (v, d) => { const m = Math.pow(10, d == null ? 2 : d); return Math.round(v * m) / m; };
  PZ.num = (v, def) => (typeof v === 'number' && isFinite(v) ? v : def);
  PZ.str = (v, def, max) => (typeof v === 'string' ? (max ? v.slice(0, max) : v) : def);
  PZ.clone = (o) => JSON.parse(JSON.stringify(o));

  const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'indeterminate', 'multiple', 'readOnly', 'tabIndex', 'type']);

  /** Tiny hyperscript: h('div', {class, style:{}, onClick, dataset:{}}, ...children). Never pass user content to `html`. */
  PZ.h = function h(tag, props) {
    const isSvg = tag.startsWith('svg:');
    const el = isSvg ? document.createElementNS(SVG_NS, tag.slice(4)) : document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.setAttribute('class', v);
        else if (k === 'style') {
          if (typeof v === 'string') el.style.cssText = v;
          else for (const s in v) if (v[s] != null) el.style.setProperty(s.startsWith('--') ? s : s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v[s]);
        } else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'html') el.innerHTML = v; // trusted, internal markup only
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (PROPS.has(k) && !isSvg) el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach((x) => append(el, x));
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }

  PZ.$ = (sel, root) => (root || document).querySelector(sel);
  PZ.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  PZ.debounce = function (fn, ms) {
    let t = 0, pending = false;
    const d = function () { const a = arguments, self = this; clearTimeout(t); pending = true; t = setTimeout(() => { pending = false; fn.apply(self, a); }, ms); };
    d.cancel = () => { clearTimeout(t); pending = false; };
    d.flush = function () { clearTimeout(t); if (pending) { pending = false; fn(); } };
    return d;
  };

  PZ.escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  PZ.fmtBytes = function (n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  };

  PZ.download = function (name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = PZ.h('a', { href: url, download: name, style: 'display:none' });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
  };

  PZ.readFile = function (file, as) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      if (as === 'dataURL') r.readAsDataURL(file); else r.readAsText(file);
    });
  };

  PZ.blobToDataUrl = (blob) => PZ.readFile(blob, 'dataURL');

  /** Valid CSS colour? (guards everything that ends up in a style). */
  PZ.isColor = function (v) {
    if (typeof v !== 'string' || !v || v.length > 64) return false;
    if (typeof CSS !== 'undefined' && CSS.supports) return CSS.supports('color', v);
    return /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%deg]+\))$/i.test(v);
  };
  PZ.color = (v, def) => (PZ.isColor(v) ? v : def);

  /** Small toast notifications (used by the player and the editor). */
  PZ.toast = function (msg, opts) {
    opts = opts || {};
    let box = document.getElementById('pz-toasts');
    if (!box) { box = PZ.h('div', { id: 'pz-toasts', class: 'pz-toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(box); }
    const t = PZ.h('div', { class: 'pz-toast' + (opts.type ? ' pz-toast-' + opts.type : '') }, PZ.h('span', { text: msg }));
    if (opts.action) t.appendChild(PZ.h('button', { class: 'pz-toast-act', text: opts.action.label, onClick: () => { opts.action.run(); t.remove(); } }));
    t.appendChild(PZ.h('button', { class: 'pz-toast-x', 'aria-label': 'Close', text: '×', onClick: () => t.remove() }));
    box.appendChild(t);
    const ms = opts.timeout == null ? 3800 : opts.timeout;
    if (ms) setTimeout(() => t.remove(), ms);
    return t;
  };

  /** Read a style/script source that is either inline (built single file) or linked (dev server). */
  PZ.sourceText = async function (node) {
    const url = node.getAttribute('src') || node.getAttribute('href');
    if (!url) return node.textContent;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Cannot read ' + url);
    return res.text();
  };

  /** All the app CSS as text (for the presenter window). Works inline, and for linked same-origin sheets. */
  PZ.cssText = function () {
    return PZ.$$('style[data-pz], link[data-pz]').map((n) => {
      if (n.tagName === 'STYLE') return n.textContent;
      try { return Array.from(n.sheet.cssRules).map((r) => r.cssText).join('\n'); } catch (e) { return ''; }
    }).join('\n');
  };

  PZ.isFileProtocol = () => location.protocol === 'file:';
  PZ.isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
})(window.PZ = window.PZ || {});
