/* PrezEn · print: PDF export through the browser's own print engine (vector text, no library).
 * Every slide becomes one page of the slide's proportions, in its final state (all animations shown). */
(function (PZ) {
  'use strict';
  const h = PZ.h;

  function waitImages(root, ms) {
    const imgs = PZ.$$('img', root).filter((i) => i.src && !i.complete);
    const all = Promise.all(imgs.map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); })));
    return Promise.race([all, new Promise((r) => setTimeout(r, ms))]);
  }

  /** opts.notes: add the speaker notes under each slide (A4 portrait handout). */
  PZ.printDoc = async function (doc, opts) {
    opts = opts || {};
    PZ.$$('#pz-print, #pz-print-style').forEach((n) => n.remove());
    const pageH = 7.5; // inches (PowerPoint's 16:9 page is 13.333 × 7.5 in)
    const pageW = PZ.round((pageH * doc.w) / doc.h, 3);
    const pxW = opts.notes ? 680 : pageW * 96, k = pxW / doc.w; // notes: fits an A4 portrait page with margins
    const root = h('div', { id: 'pz-print' });
    const useZoom = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('zoom', '0.5');
    const slides = doc.slides.filter((s) => !s.hidden || opts.includeHidden);
    for (const s of slides) {
      const slideEl = PZ.renderSlide(doc, s, 'print');
      // zoom scales the layout itself (print engines handle it better than transforms); transform as fallback
      if (useZoom) slideEl.style.zoom = String(k); else slideEl.style.transform = `scale(${k})`;
      const frame = h('div', { class: 'pz-print-frame', style: { width: pxW + 'px', height: doc.h * k + 'px' } }, slideEl);
      if (opts.notes) {
        root.appendChild(h('section', { class: 'pz-print-page pz-print-handout' }, frame,
          h('div', { class: 'pz-print-notes', text: s.notes || '' })));
      } else root.appendChild(h('section', { class: 'pz-print-page' }, frame));
    }
    const page = opts.notes ? 'A4 portrait; margin: 14mm' : `${pageW}in ${pageH}in; margin: 0`;
    const style = h('style', { id: 'pz-print-style' });
    style.textContent = `@page { size: ${page}; }
      @media print {
        html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; height: auto !important; overflow: visible !important; }
        body > *:not(#pz-print) { display: none !important; }
        #pz-print { display: block !important; position: static !important; }
      }`;
    document.head.appendChild(style);
    document.body.appendChild(root);
    PZ.loadFonts(doc);
    const t = PZ.toast(PZ.t('Preparing PDF… In the print dialog choose “Save as PDF”.'), { timeout: 6000 });
    await waitImages(root, 10000);
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 3000))]); } catch (e) { /* ignore */ }
    const cleanup = () => { root.remove(); style.remove(); window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    t.remove();
    window.print();
    setTimeout(() => { if (!window.matchMedia('print').matches) cleanup(); }, 60000);
  };
})(window.PZ = window.PZ || {});
