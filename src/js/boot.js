/* PrezEn · boot: decide what to open.
 *   1. a share link (#p=…)            → editor (or slideshow with &play)
 *   2. data embedded in this file      → slideshow (player export) or editor (editable export)
 *   3. the last presentation edited in this browser, or the welcome deck
 * The interface language is chosen first (see i18n.js): this browser's choice, else the one stored in the file. */
(function (PZ) {
  'use strict';

  /** Raw JSON embedded in an exported file: {j} or {error}, or null when there is none. */
  function embeddedRaw() {
    const node = document.getElementById('pz-data');
    if (!node) return null;
    try { return { j: JSON.parse(node.textContent) }; } catch (e) { return { error: e }; }
  }

  function embedded(raw) {
    if (!raw) return null;
    try {
      if (raw.error) throw raw.error;
      return { mode: raw.j.mode === 'editor' ? 'editor' : 'player', doc: PZ.normalizeDoc(raw.j.doc) };
    } catch (e) {
      console.error(e);
      PZ.toast(PZ.t('The presentation inside this file is damaged: {msg}', { msg: e.message }), { type: 'error', timeout: 0 });
      return null;
    }
  }

  function slideFromHash() {
    const m = /[#&]slide=(\d+)/.exec(location.hash);
    return m ? parseInt(m[1], 10) - 1 : 0;
  }

  function fail(msg) {
    document.body.appendChild(PZ.h('div', { class: 'pz-fatal' }, PZ.h('h1', { text: 'PrezEn' }), PZ.h('p', { text: msg })));
  }

  function slideshow(doc, opts) {
    document.body.classList.add('pz-player-body');
    document.title = doc.title;
    return new PZ.Player(doc, Object.assign({ allowPrint: true, hash: true, langSwitch: true, start: slideFromHash() }, opts));
  }

  async function boot() {
    const hasEditor = !!(PZ.ed && PZ.ed.start);
    const raw = embeddedRaw();
    PZ.initLang(raw && raw.j && raw.j.lang);
    const emb = embedded(raw);
    let linkDoc = null;
    const packed = PZ.readHash();
    if (packed) {
      try { linkDoc = await PZ.decodeDoc(packed); } catch (e) { PZ.toast(PZ.t('This link is damaged or incomplete ({msg}).', { msg: e.message }), { type: 'error', timeout: 0 }); }
    }

    if (!hasEditor) {
      const doc = linkDoc || (emb && emb.doc);
      if (doc) slideshow(doc);
      else fail(PZ.t('No presentation found in this file.'));
      return;
    }

    if (linkDoc) {
      const play = PZ.hashFlag('play');
      history.replaceState(null, '', location.pathname + location.search); // later refreshes open the browser copy, with your edits
      if (play) {
        slideshow(linkDoc, { hash: false, start: 0, onExit: () => { document.body.classList.remove('pz-player-body'); PZ.ed.start(linkDoc); } });
        return;
      }
      PZ.ed.start(linkDoc);
      PZ.toast(PZ.t('Opened from a link. It is now saved in this browser (My presentations).'), { timeout: 6000 });
      return;
    }

    if (emb && emb.mode === 'player') { slideshow(emb.doc); return; }
    if (emb) {
      PZ.ed.start(emb.doc, { mode: 'file' });
      if (/[#&]play\b/.test(location.hash)) PZ.ed.present(false);
      PZ.toast(PZ.t('{mod}+S saves your changes back into a file (pick this same file to replace it).', { mod: PZ.isMac ? '⌘' : 'Ctrl' }), { timeout: 8000 });
      return;
    }

    let doc = null;
    const last = PZ.store.lastId();
    if (last) { try { const raw = await PZ.store.get(last); if (raw) doc = PZ.normalizeDoc(raw); } catch (e) { console.warn(e); } }
    PZ.ed.start(doc || PZ.sampleDoc(), { noSave: !doc, sample: !doc });
  }

  // a share link pasted into an open tab only changes the hash: reload to open it
  window.addEventListener('hashchange', () => { if (PZ.readHash()) location.reload(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.PZ = window.PZ || {});
