/* PrezEn · storage: the in-browser library (IndexedDB, nothing leaves the device) and file open/save.
 * Files: Chrome/Edge can write back to the same file (File System Access API); other browsers download a copy. */
(function (PZ) {
  'use strict';

  const DB = 'prezen', STORE = 'docs';
  let dbp = null;
  const memory = new Map(); // fallback when IndexedDB is not available (private mode, some file:// setups)

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('no indexedDB')); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e) => { PZ.storageFallback = true; throw e; });
    return dbp;
  }
  function tx(mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    }));
  }

  PZ.store = {
    async put(doc) {
      const rec = { id: doc.id, title: doc.title, updated: doc.updated || Date.now(), count: doc.slides.length, doc };
      try { await tx('readwrite', (s) => s.put(rec)); } catch (e) { memory.set(doc.id, PZ.clone(rec)); }
      try { localStorage.setItem('prezen:last', doc.id); } catch (e) { /* ignore */ }
    },
    async get(id) {
      try { const r = await tx('readonly', (s) => s.get(id)); return r ? r.doc : null; } catch (e) { const m = memory.get(id); return m ? m.doc : null; }
    },
    async list() {
      let all;
      try { all = await tx('readonly', (s) => s.getAll()); } catch (e) { all = Array.from(memory.values()); }
      return (all || []).sort((a, b) => b.updated - a.updated);
    },
    async del(id) {
      try { await tx('readwrite', (s) => s.delete(id)); } catch (e) { memory.delete(id); }
    },
    lastId() { try { return localStorage.getItem('prezen:last'); } catch (e) { return null; } },
  };

  // ---------------------------------------------------------------- files

  /** Extract the presentation from a .json file or from an exported PrezEn .html file.
   *  Password-protected files ask for the password: resolves to null when that is cancelled. */
  PZ.parseFileText = async function (text) {
    const t = text.trim();
    let j;
    if (t[0] === '{') {
      j = JSON.parse(t);
      if (j.app !== 'prezen' || !(j.doc || j.enc)) j = { doc: j };
    } else {
      const dom = new DOMParser().parseFromString(text, 'text/html');
      const node = dom.getElementById('pz-data');
      if (!node) throw new Error('This file does not contain a PrezEn presentation');
      j = JSON.parse(node.textContent);
    }
    if (typeof j.enc === 'string') return PZ.decodeDoc(j.enc, { cancel: true });
    return PZ.normalizeDoc(j.doc);
  };

  const TYPES = {
    html: { description: 'PrezEn presentation (HTML)', accept: { 'text/html': ['.html', '.htm'] } },
    json: { description: 'PrezEn data (JSON)', accept: { 'application/json': ['.json'] } },
  };
  PZ.files = {
    canWriteBack: typeof window.showSaveFilePicker === 'function',

    /** Pick a file: returns {doc, handle, name} or null. */
    async open() {
      if (typeof window.showOpenFilePicker === 'function') {
        let handle = null, file = null;
        try {
          [handle] = await window.showOpenFilePicker({ types: [{ description: 'Presentations', accept: { 'text/html': ['.html', '.htm'], 'application/json': ['.json'] } }] });
          file = await handle.getFile();
        } catch (e) { if (e.name === 'AbortError') return null; } // other failures (e.g. file://): fall back to <input>
        if (file) {
          const doc = await PZ.parseFileText(await file.text());
          return doc && { doc, handle, name: file.name };
        }
      }
      return new Promise((resolve, reject) => {
        const input = PZ.h('input', { type: 'file', accept: '.html,.htm,.json', style: 'display:none' });
        input.addEventListener('change', async () => {
          const f = input.files[0];
          input.remove();
          if (!f) return resolve(null);
          try { const doc = await PZ.parseFileText(await f.text()); resolve(doc && { doc, handle: null, name: f.name }); } catch (e) { reject(e); }
        });
        document.body.appendChild(input);
        input.click();
      });
    },

    /** Save with a picker (or download). Returns the handle to write to it again later, or null. */
    async saveAs(blob, name, kind) {
      if (this.canWriteBack) {
        try {
          const handle = await window.showSaveFilePicker({ suggestedName: name, types: [TYPES[kind] || TYPES.html] });
          await this.write(handle, blob);
          return handle;
        } catch (e) { if (e.name === 'AbortError') return 'cancel'; console.warn('Save picker failed, downloading instead', e); }
      }
      // No save picker (Firefox, Safari): the browser decides where downloads go, so at least let the user pick the name.
      const chosen = await this.askName(name);
      if (chosen == null) return 'cancel';
      PZ.download(chosen, blob);
      return null;
    },

    /** In-app "Save as" dialog for the download fallback. Resolves to a file name (extension kept) or null. */
    askName(name) {
      const ui = PZ.ui, h = PZ.h, t = PZ.t;
      if (!ui || !ui.modal) return Promise.resolve(name);
      const ext = (/\.[^.]+$/.exec(name) || [''])[0];
      return new Promise((resolve) => {
        let out = null;
        const ok = () => {
          const base = input.value.replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').trim().replace(new RegExp(ext.replace('.', '\\.') + '$', 'i'), '').trim();
          if (!base) { input.focus(); return; }
          out = base + ext; m.close();
        };
        const input = h('input', { class: 'ui-input', value: name.slice(0, name.length - ext.length), autofocus: true,
          onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } } });
        const m = ui.modal({
          title: t('Save as'),
          content: [
            h('label', { class: 'ui-label', text: t('File name') }),
            h('div', { class: 'ui-row' }, input, h('span', { text: ext })),
            h('p', { class: 'ed-hint', text: t('This browser saves files to its downloads folder. To choose the folder each time, enable “Always ask where to save files” in its settings.') }),
          ],
          onClose: () => resolve(out),
          buttons: [{ label: t('Cancel'), run: (c) => c() }, { label: t('Save'), primary: true, run: () => ok() }],
        });
        setTimeout(() => input.select(), 40);
      });
    },

    async write(handle, blob) {
      if (handle.requestPermission) {
        const p = await handle.requestPermission({ mode: 'readwrite' });
        if (p !== 'granted') throw new Error('Permission to write the file was refused');
      }
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
    },
  };

  PZ.safeFileName = (title, ext) => (String(title || 'presentation').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'presentation') + ext;
})(window.PZ = window.PZ || {});
