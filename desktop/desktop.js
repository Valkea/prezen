/* PrezEn · desktop: runs inside the Neutralinojs window (desktop/ build only).
 * Native open / save dialogs that return real paths, so Ctrl+S writes the presentation back where it was opened from.
 * Injected by desktop/build.mjs without data-pz: files exported from the desktop app never contain it. */
(function (PZ) {
  'use strict';
  const N = window.Neutralino;
  if (!N || !window.NL_VERSION) return;
  N.init();

  const t = PZ.t;
  PZ.addStrings('fr', {
    'Presentations': 'Présentations',
    'Quit without saving the changes to {name}?': 'Quitter sans enregistrer les modifications de {name} ?',
    'Quit': 'Quitter',
  });

  const baseName = (p) => p.split(/[\\/]/).pop();
  const dirName = (p) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))) || p;
  const isAbsolute = (p) => /^([a-zA-Z]:[\\/]|[\\/])/.test(p);
  const handleFor = (path) => ({ name: baseName(path), path });
  // dialogs start in the folder of the last file used, else next to the executable (the flashdrive when run from it)
  let lastDir = window.NL_PATH || window.NL_CWD || '';

  const FILTERS = {
    html: [{ name: 'PrezEn presentation (HTML)', extensions: ['html', 'htm'] }],
    json: [{ name: 'PrezEn data (JSON)', extensions: ['json'] }],
  };

  async function readPath(path) {
    const doc = await PZ.parseFileText(await N.filesystem.readFile(path));
    lastDir = dirName(path);
    return doc && { doc, handle: handleFor(path), name: baseName(path) };
  }

  PZ.files.canWriteBack = true;

  PZ.files.open = async function () {
    const paths = await N.os.showOpenDialog(t('Open'), { defaultPath: lastDir, filters: [{ name: t('Presentations'), extensions: ['html', 'htm', 'json'] }] });
    return paths && paths.length ? readPath(paths[0]) : null;
  };

  PZ.files.saveAs = async function (blob, name, kind) {
    let path = await N.os.showSaveDialog(t('Save as'), { defaultPath: lastDir + '/' + name, filters: FILTERS[kind] || FILTERS.html });
    if (!path) return 'cancel';
    const ext = (/\.[^.]+$/.exec(name) || [''])[0];
    if (!/\.[^.\\/]+$/.test(baseName(path))) path += ext; // some dialogs do not add the extension
    const handle = handleFor(path);
    await this.write(handle, blob);
    lastDir = dirName(path);
    return handle;
  };

  PZ.files.write = async function (handle, blob) {
    await N.filesystem.writeBinaryFile(handle.path, await blob.arrayBuffer());
  };

  // share links must point to the online app, not to the local server of the desktop window
  PZ.appUrl = () => PZ.PUBLIC_URL;

  // web links open in the default browser instead of replacing the app in its window
  const webUrl = (u) => typeof u === 'string' && /^(https?:|mailto:)/i.test(u);
  const nativeOpen = window.open.bind(window);
  window.open = function (url) {
    if (webUrl(url)) { N.os.open(url); return null; }
    return nativeOpen.apply(window, arguments);
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.hasAttribute('download') || !webUrl(a.href) || new URL(a.href).origin === location.origin) return;
    e.preventDefault();
    N.os.open(a.href);
  }, true);

  // the window title follows the presentation title
  new MutationObserver(() => N.window.setTitle(document.title).catch(() => {}))
    .observe(document.querySelector('title') || document.head, { childList: true, characterData: true, subtree: true });

  N.events.on('windowClose', async () => {
    const E = PZ.ed;
    if (E && E.dirty && E.mode === 'file' && PZ.ui && !(await PZ.ui.confirm(t('Unsaved changes'), t('Quit without saving the changes to {name}?', { name: E.fileName || '' }), t('Quit')))) return;
    if (E && E.autosave) E.autosave.flush(); // the browser copy (IndexedDB) is written asynchronously
    setTimeout(() => N.app.exit(), 300);
  });

  // a presentation given on the command line ("Open with PrezEn", drag onto the executable): open it once the editor is up
  const arg = (window.NL_ARGS || []).slice(1).find((a) => !a.startsWith('--') && /\.(html?|json)$/i.test(a));
  if (arg) {
    const path = isAbsolute(arg) ? arg : (window.NL_CWD || '') + '/' + arg;
    const editorReady = () => new Promise((resolve) => {
      const tick = () => (PZ.ed && PZ.ed.doc && document.querySelector('.ed') ? resolve() : setTimeout(tick, 50));
      tick();
    });
    editorReady().then(() => readPath(path)).then((r) => {
      if (!r) return;
      PZ.ed.load(r.doc, { mode: 'file', handle: r.handle, name: r.name });
      PZ.toast(t('Opened {name}', { name: r.name }));
    }).catch((e) => PZ.toast(t('Cannot open this file: {msg}', { msg: e.message || String(e) }), { type: 'error', timeout: 7000 }));
  }
})(window.PZ = window.PZ || {});
