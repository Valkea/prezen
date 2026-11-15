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

  /** Extract the presentation from a .json file or from an exported PrezEn .html file. */
  PZ.parseFileText = function (text) {
    const t = text.trim();
    if (t[0] === '{') {
      const j = JSON.parse(t);
      return PZ.normalizeDoc(j.doc && j.app === 'prezen' ? j.doc : j);
    }
    const dom = new DOMParser().parseFromString(text, 'text/html');
    const node = dom.getElementById('pz-data');
    if (!node) throw new Error('This file does not contain a PrezEn presentation');
    const j = JSON.parse(node.textContent);
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
        try {
          const [handle] = await window.showOpenFilePicker({ types: [{ description: 'Presentations', accept: { 'text/html': ['.html', '.htm'], 'application/json': ['.json'] } }] });
          const file = await handle.getFile();
          return { doc: PZ.parseFileText(await file.text()), handle, name: file.name };
        } catch (e) { if (e.name === 'AbortError') return null; if (e instanceof SyntaxError || /PrezEn|presentation/i.test(e.message)) throw e; }
      }
      return new Promise((resolve, reject) => {
        const input = PZ.h('input', { type: 'file', accept: '.html,.htm,.json', style: 'display:none' });
        input.addEventListener('change', async () => {
          const f = input.files[0];
          input.remove();
          if (!f) return resolve(null);
          try { resolve({ doc: PZ.parseFileText(await f.text()), handle: null, name: f.name }); } catch (e) { reject(e); }
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
      PZ.download(name, blob);
      return null;
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
