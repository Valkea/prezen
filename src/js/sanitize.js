/* PrezEn · sanitize: every piece of markup that comes from a document (shared links, opened files, online
 * icons) goes through these allow-lists before reaching the page. A link can carry a whole presentation,
 * so a crafted one must never be able to run script. */
(function (PZ) {
  'use strict';

  const TEXT_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUB', 'SUP', 'BR', 'DIV', 'P', 'SPAN',
    'FONT', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'CODE', 'MARK', 'H1', 'H2', 'H3', 'SMALL']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TITLE', 'SVG', 'MATH',
    'HEAD', 'LINK', 'META', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA']);
  const STYLE_PROPS = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line',
    'font-size', 'font-family', 'text-align', 'line-height', 'letter-spacing', 'text-transform', 'vertical-align'];
  const BAD_VALUE = /url\s*\(|expression|javascript:|@import|[<>]/i;

  /** Link targets allowed in text and on elements: web, mail, phone, or a slide (#3). */
  PZ.safeLink = function (href) {
    if (typeof href !== 'string') return '';
    const v = href.trim();
    if (/^#\d{1,4}$/.test(v)) return v;
    if (/^(https?:|mailto:|tel:)/i.test(v) && !/[\s<>"]/.test(v)) return v;
    return '';
  };

  let parser = null;
  const getParser = () => parser || (parser = new DOMParser());

  const cache = new Map();
  function cached(kind, input, fn) {
    const key = kind + input;
    if (cache.has(key)) return cache.get(key);
    const out = fn(input);
    if (cache.size > 800) cache.clear();
    cache.set(key, out);
    return out;
  }

  function copyStyle(src, dst) {
    const st = src.style;
    if (!st) return;
    for (const p of STYLE_PROPS) {
      const v = st.getPropertyValue(p);
      if (v && v.length < 200 && !BAD_VALUE.test(v)) dst.style.setProperty(p, v);
    }
  }

  function cleanHtml(html) {
    const doc = getParser().parseFromString('<!doctype html><body>' + html, 'text/html');
    const out = doc.createElement('div');
    (function walk(src, dst) {
      for (const n of Array.from(src.childNodes)) {
        if (n.nodeType === 3) { dst.appendChild(doc.createTextNode(n.nodeValue)); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName.toUpperCase();
        if (DROP.has(tag)) continue;
        if (!TEXT_TAGS.has(tag)) { walk(n, dst); continue; } // unknown wrapper: keep its content only
        const c = doc.createElement(tag === 'FONT' ? 'span' : tag.toLowerCase());
        copyStyle(n, c);
        if (tag === 'FONT') {
          const color = n.getAttribute('color');
          if (color && PZ.isColor(color)) c.style.color = color;
          const face = n.getAttribute('face');
          if (face && /^[\w\s,'"-]{1,80}$/.test(face)) c.style.fontFamily = face;
        }
        if (tag === 'A') {
          const href = PZ.safeLink(n.getAttribute('href'));
          if (href) {
            c.setAttribute('href', href);
            if (href[0] !== '#') { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener noreferrer'); }
          }
        }
        walk(n, c);
        dst.appendChild(c);
      }
    })(doc.body, out);
    return out.innerHTML;
  }

  /** Rich text of text boxes: formatting tags and a few style properties, nothing else. */
  PZ.sanitizeHtml = (html) => cached('h:', String(html == null ? '' : html), cleanHtml);

  /** Plain text version of rich text (titles in lists, notes…). */
  PZ.htmlToText = function (html) {
    const doc = getParser().parseFromString('<!doctype html><body>' + PZ.sanitizeHtml(html).replace(/<(br|\/div|\/p|\/li|\/blockquote)>/gi, '\n$&'), 'text/html');
    return doc.body.textContent.replace(/\n{2,}/g, '\n').trim();
  };

  const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs',
    'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'title', 'desc']);
  const SVG_ATTRS = new Set(['viewbox', 'xmlns', 'width', 'height', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1',
    'x2', 'y2', 'points', 'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap',
    'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity',
    'transform', 'id', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'fx', 'fy',
    'clip-path', 'mask', 'preserveaspectratio', 'style', 'pathlength', 'vector-effect', 'maskunits', 'clippathunits']);
  const SVG_STYLE = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'stop-color', 'stop-opacity'];

  function cleanSvg(markup) {
    const doc = getParser().parseFromString(markup, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) return '';
    (function walk(el) {
      for (const a of Array.from(el.attributes)) {
        const name = a.name.toLowerCase();
        let ok = SVG_ATTRS.has(name) && !/javascript:|data:|<|&#/i.test(a.value);
        if (ok && /url\s*\(/i.test(a.value)) ok = /^\s*url\(\s*#[\w-]+\s*\)\s*$/.test(a.value);
        if (ok && name === 'style') {
          const parts = a.value.split(';').map((s) => s.trim()).filter((s) => {
            const p = s.split(':')[0].trim().toLowerCase();
            return SVG_STYLE.includes(p) && !/url\s*\(|expression/i.test(s);
          });
          el.setAttribute('style', parts.join(';'));
          continue;
        }
        if (!ok) el.removeAttribute(a.name);
      }
      for (const c of Array.from(el.children)) {
        if (!SVG_TAGS.has(c.nodeName.toLowerCase())) c.remove();
        else walk(c);
      }
    })(root);
    return new XMLSerializer().serializeToString(root);
  }

  /** Icons: shapes and gradients only; no scripts, links, foreignObject, external references or events. */
  PZ.sanitizeSvg = (markup) => cached('s:', String(markup == null ? '' : markup).slice(0, 200000), cleanSvg);
})(window.PZ = window.PZ || {});
