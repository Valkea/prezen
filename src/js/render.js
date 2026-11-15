/* PrezEn · render: slide + element → DOM. Shared by the editor, the player, thumbnails and PDF printing.
 * Built with DOM APIs; the only markup inserted is rich text and icons, both sanitized. */
(function (PZ) {
  'use strict';
  const h = PZ.h;

  /** Apply a text style object to the text node (fonts, colours, alignment…). */
  PZ.applyTextStyle = function (node, st) {
    const s = node.style;
    s.fontFamily = PZ.fontStack(st.font);
    s.fontSize = st.size + 'px';
    s.color = PZ.color(st.color, '#000');
    s.fontWeight = st.bold ? '700' : '400';
    s.fontStyle = st.italic ? 'italic' : 'normal';
    s.textDecoration = st.underline ? 'underline' : 'none';
    s.textAlign = st.align || 'left';
    s.lineHeight = String(st.lh || 1.25);
    s.letterSpacing = (st.ls || 0) + 'px';
    s.textShadow = st.tshadow && PZ.SHADOWS[st.tshadow] && PZ.SHADOWS[st.tshadow].text ? PZ.SHADOWS[st.tshadow].text : '';
  };

  /** .pz-textbox (padding, box colour, vertical alignment) > .pz-text (the rich text; editable in the editor). */
  function textBox(html, st, mode, placeholder) {
    const box = h('div', { class: 'pz-textbox' });
    box.style.padding = (st.pad || 0) + 'px';
    box.style.justifyContent = st.valign === 'middle' ? 'center' : st.valign === 'bottom' ? 'flex-end' : 'flex-start';
    const t = h('div', { class: 'pz-text', spellcheck: 'false' });
    t.innerHTML = PZ.sanitizeHtml(html);
    PZ.applyTextStyle(t, st);
    if (mode === 'edit' && placeholder && !html) t.classList.add('pz-empty');
    box.appendChild(t);
    return box;
  }

  function filters(f) {
    if (!f) return '';
    const parts = [];
    if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
    if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
    if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
    if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`);
    if (f.blur) parts.push(`blur(${f.blur}px)`);
    return parts.join(' ');
  }

  function missing(body, label, mode) {
    body.classList.add('pz-missing');
    body.appendChild(h('div', { class: 'pz-missing-in' }, PZ.icon('image'), mode === 'edit' ? h('span', { text: label }) : null));
  }

  const iconCache = new Map();
  function iconMarkup(el) {
    const key = el.svg;
    if (!iconCache.has(key)) { if (iconCache.size > 300) iconCache.clear(); iconCache.set(key, PZ.sanitizeSvg(el.svg)); }
    return iconCache.get(key);
  }

  /** One element: .pz-el (box, animated) > .pz-body (rotation, opacity, content). */
  PZ.renderElement = function (doc, el, mode) {
    const wrap = h('div', { class: 'pz-el pz-' + el.type, dataset: { id: el.id } });
    PZ.placeElement(wrap, el);
    const body = h('div', { class: 'pz-body' });
    if (el.rot) body.style.transform = `rotate(${el.rot}deg)`;
    if (el.opacity !== 1) body.style.opacity = String(el.opacity);
    const sh = PZ.SHADOWS[el.shadow];
    if (el.link) { wrap.dataset.link = el.link; if (mode === 'play') wrap.classList.add('pz-link'); }

    if (el.type === 'text') {
      const t = textBox(el.html, el.style, mode, true);
      if (el.style.bg) { t.style.background = el.style.bg; t.style.borderRadius = (el.style.radius || 0) + 'px'; }
      if (sh && sh.box && el.style.bg) t.style.boxShadow = sh.box; else if (sh && sh.drop) body.style.filter = sh.drop;
      body.appendChild(t);
    } else if (el.type === 'image') {
      const box = h('div', { class: 'pz-img-box' });
      box.style.borderRadius = el.radius + 'px';
      if (el.bw) box.style.border = `${el.bw}px solid ${PZ.color(el.bc, '#fff')}`;
      if (sh && sh.box) box.style.boxShadow = sh.box;
      if (!el.src) missing(box, 'Double-click to add a picture', mode);
      else {
        const img = h('img', { alt: el.alt || '', draggable: 'false' });
        img.style.objectFit = el.fit;
        img.style.objectPosition = el.pos || '50% 50%';
        if (el.flip) img.style.transform = 'scaleX(-1)';
        const fl = filters(el.filters);
        if (fl) img.style.filter = fl;
        PZ.setImgSrc(img, el.src, doc, (ref) => { img.remove(); missing(box, 'Image not found: ' + ref.slice(0, 80), mode); });
        box.appendChild(img);
      }
      body.appendChild(box);
    } else if (el.type === 'shape') {
      body.appendChild(PZ.shapeSvg(el));
      if (sh && sh.drop) body.style.filter = sh.drop;
      if (el.html || mode === 'edit') body.appendChild(textBox(el.html, el.style, mode, false));
    } else if (el.type === 'icon') {
      const ic = h('div', { class: 'pz-icon-box' });
      ic.style.color = PZ.color(el.color, '#000');
      ic.innerHTML = iconMarkup(el);
      const svg = ic.firstElementChild;
      if (svg) {
        svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
        if (el.sw && svg.getAttribute('stroke')) svg.setAttribute('stroke-width', String(el.sw));
      }
      if (sh && sh.drop) body.style.filter = sh.drop;
      body.appendChild(ic);
    }
    wrap.appendChild(body);
    return wrap;
  };

  PZ.placeElement = function (wrap, el) {
    const s = wrap.style;
    s.left = el.x + 'px'; s.top = el.y + 'px'; s.width = el.w + 'px'; s.height = el.h + 'px';
  };

  PZ.applyBackground = function (node, bg, doc, mode) {
    node.style.background = '';
    PZ.$$(':scope > .pz-bg', node).forEach((n) => n.remove());
    bg = bg || { type: 'color', color: '#ffffff' };
    node.style.backgroundColor = PZ.color(bg.color, '#ffffff');
    if (bg.type === 'gradient') {
      const c1 = PZ.color(bg.color, '#ffffff'), c2 = PZ.color(bg.color2, '#5b5bf0');
      node.style.backgroundImage = bg.radial ? `radial-gradient(circle at 50% 40%, ${c1}, ${c2})` : `linear-gradient(${PZ.num(bg.angle, 135)}deg, ${c1}, ${c2})`;
    } else if (bg.type === 'image' && bg.src) {
      const layer = h('div', { class: 'pz-bg' });
      const img = h('img', { alt: '', draggable: 'false' });
      img.style.objectFit = bg.fit || 'cover';
      PZ.setImgSrc(img, bg.src, doc, () => img.remove());
      layer.appendChild(img);
      if (bg.overlayOpacity) layer.appendChild(h('div', { class: 'pz-bg-over', style: { background: PZ.color(bg.overlay, '#000'), opacity: String(bg.overlayOpacity) } }));
      node.insertBefore(layer, node.firstChild);
    }
  };

  /** A full slide at its logical size (doc.w × doc.h). mode: 'edit' | 'play' | 'print' | 'thumb'. */
  PZ.renderSlide = function (doc, slide, mode) {
    const root = h('div', { class: 'pz-slide pz-mode-' + (mode || 'play'), dataset: { slide: slide.id } });
    root.style.width = doc.w + 'px';
    root.style.height = doc.h + 'px';
    PZ.applyBackground(root, slide.bg, doc, mode);
    for (const el of slide.els) root.appendChild(PZ.renderElement(doc, el, mode));
    return root;
  };

  /** A slide scaled into a box of the given width (thumbnails, overview, library). */
  PZ.renderThumb = function (doc, slide, width) {
    const k = width / doc.w;
    const box = h('div', { class: 'pz-thumb', style: { width: width + 'px', height: Math.round(doc.h * k) + 'px' } });
    const s = PZ.renderSlide(doc, slide, 'thumb');
    s.style.transform = `scale(${k})`;
    box.appendChild(s);
    return box;
  };
})(window.PZ = window.PZ || {});
