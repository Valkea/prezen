/* PrezEn · boot: decide what to open.
 *   1. a share link (#p=…)            → editor (or slideshow with &play)
 *   2. data embedded in this file      → slideshow (player export) or editor (editable export)
 *   3. the last presentation edited in this browser, or the welcome deck */
(function (PZ) {
  'use strict';

  function embedded() {
    const node = document.getElementById('pz-data');
    if (!node) return null;
    try {
      const j = JSON.parse(node.textContent);
      return { mode: j.mode === 'editor' ? 'editor' : 'player', doc: PZ.normalizeDoc(j.doc) };
    } catch (e) {
      console.error(e);
      PZ.toast('The presentation inside this file is damaged: ' + e.message, { type: 'error', timeout: 0 });
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
    return new PZ.Player(doc, Object.assign({ allowPrint: true, hash: true, start: slideFromHash() }, opts));
  }

  async function boot() {
    const hasEditor = !!(PZ.ed && PZ.ed.start);
    const emb = embedded();
    let linkDoc = null;
    const packed = PZ.readHash();
    if (packed) {
      try { linkDoc = await PZ.decodeDoc(packed); } catch (e) { PZ.toast('This link is damaged or incomplete (' + e.message + ').', { type: 'error', timeout: 0 }); }
    }

    if (!hasEditor) {
      const doc = linkDoc || (emb && emb.doc);
      if (doc) slideshow(doc);
      else fail('No presentation found in this file.');
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
      PZ.toast('Opened from a link. It is now saved in this browser (My presentations).', { timeout: 6000 });
      return;
    }

    if (emb && emb.mode === 'player') { slideshow(emb.doc); return; }
    if (emb) {
      PZ.ed.start(emb.doc, { mode: 'file' });
      if (/[#&]play\b/.test(location.hash)) PZ.ed.present(false);
      PZ.toast((PZ.isMac ? '⌘' : 'Ctrl') + '+S saves your changes back into a file (pick this same file to replace it).', { timeout: 8000 });
      return;
    }

    let doc = null;
    const last = PZ.store.lastId();
    if (last) { try { const raw = await PZ.store.get(last); if (raw) doc = PZ.normalizeDoc(raw); } catch (e) { console.warn(e); } }
    PZ.ed.start(doc || PZ.sampleDoc(), { noSave: !doc });
  }

  // a share link pasted into an open tab only changes the hash: reload to open it
  window.addEventListener('hashchange', () => { if (PZ.readHash()) location.reload(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.PZ = window.PZ || {});
