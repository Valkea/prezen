/* PrezEn · export: self-contained HTML files.
 *   player: the presentation and the player only (light, opens anywhere, no editor)
 *   editor: the whole app + the presentation (edit it from a flashdrive, save it back, present it)
 * The page rebuilds itself from its own <style data-pz> / <script data-pz> nodes, like TiddlyWiki. */
(function (PZ) {
  'use strict';

  const END_SCRIPT = '<' + '/script>';
  const END_STYLE = '<' + '/style>';

  /** The app's own sources, in page order. playerOnly keeps the nodes flagged data-player. */
  PZ.appSources = async function (playerOnly) {
    const out = [];
    for (const node of PZ.$$('style[data-pz], link[data-pz], script[data-pz]')) {
      if (playerOnly && !node.hasAttribute('data-player')) continue;
      let text;
      try { text = await PZ.sourceText(node); } catch (e) {
        throw new Error(PZ.t('Cannot read the app files from a local folder. Use the single-file build (dist/PrezEn.html) or run “npm run dev”.'));
      }
      // type: inert data scripts (the bundled pdf.js, text/plain) must stay inert in the exported file
      out.push({ kind: node.tagName === 'SCRIPT' ? 'js' : 'css', name: node.getAttribute('data-pz'), player: node.hasAttribute('data-player'), type: node.getAttribute('type') || '', text });
    }
    return out;
  };

  /** Google Fonts used by the doc: <link> tags, or inlined @font-face (latin subsets) for offline use. */
  async function fontTags(doc, embed) {
    const tags = [];
    for (const name of PZ.usedFonts(doc)) {
      const url = PZ.googleFontUrl(name);
      if (!url) continue;
      const safe = PZ.escapeHtml(name);
      if (embed) {
        try {
          const css = await (await fetch(url)).text();
          const blocks = css.split(/(?=\/\*\s*[\w-]+\s*\*\/)/).filter((b) => /\/\*\s*(latin|latin-ext)\s*\*\//.test(b));
          let out = blocks.join('\n');
          const urls = Array.from(new Set((out.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g) || []).map((u) => u.slice(4, -1))));
          for (const u of urls) {
            const data = await PZ.blobToDataUrl(await (await fetch(u)).blob());
            out = out.split(u).join(data);
          }
          if (out && !out.includes('<')) { tags.push(`<style data-pz-font="${safe}">${out}${END_STYLE}`); continue; }
        } catch (e) {
          const existing = document.querySelector(`style[data-pz-font="${CSS.escape(name)}"]`);
          if (existing && !existing.textContent.includes('<')) { tags.push(`<style data-pz-font="${safe}">${existing.textContent}${END_STYLE}`); continue; }
        }
      }
      tags.push(`<link rel="stylesheet" href="${PZ.escapeHtml(url)}" data-pz-font="${safe}">`);
    }
    return tags;
  }

  /** Build the HTML text. opts: {mode:'player'|'editor', embedImages, embedFonts, onProgress}. Returns {html, report}. */
  PZ.buildHtml = async function (doc, opts) {
    opts = opts || {};
    const mode = opts.mode === 'editor' ? 'editor' : 'player';
    const d = PZ.clone(doc);
    d.updated = Date.now();
    const report = { failedImages: [] };
    if (opts.embedImages) {
      const r = await PZ.embedImages(d, opts.onProgress);
      report.failedImages = r.failed;
    }
    PZ.gcAssets(d);
    const sources = await PZ.appSources(mode === 'player');
    const fonts = await fontTags(d, !!opts.embedFonts);
    // a password-protected doc travels encrypted ("enc": an encrypted pack, see codec.js), title included
    const locked = !!d.password;
    const data = { app: 'prezen', v: 1, mode, lang: PZ.lang };
    if (locked) data.enc = await PZ.lockPacked(await PZ.packJson(d), d.password); else data.doc = d;
    const payload = JSON.stringify(data).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));
    const attrs = (s) => `${s.type ? `type="${PZ.escapeHtml(s.type)}" ` : ''}data-pz="${PZ.escapeHtml(s.name)}"${s.player ? ' data-player' : ''}`;
    const css = sources.filter((s) => s.kind === 'css').map((s) => `<style ${attrs(s)}>\n${s.text}\n${END_STYLE}`);
    const js = sources.filter((s) => s.kind === 'js').map((s) => {
      if (/<\/script/i.test(s.text)) throw new Error('Source ' + s.name + ' cannot be inlined');
      return `<script ${attrs(s)}>\n${s.text}\n${END_SCRIPT}`;
    });
    const html = [
      '<!doctype html>',
      `<html lang="${PZ.lang}">`,
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<meta name="generator" content="PrezEn ${PZ.VERSION}">`,
      `<title>${PZ.escapeHtml(locked ? PZ.APP : d.title)}</title>`,
      `<link rel="icon" href="${PZ.LOGO_URL}">`,
      ...fonts,
      ...css,
      '</head>',
      '<body>',
      `<script type="application/json" id="pz-data">${payload}${END_SCRIPT}`,
      ...js,
      '</body>',
      '</html>',
    ].join('\n');
    return { html, report, size: html.length };
  };

  /** Plain JSON data file (the editor opens it back). Encrypted ({enc}) when the doc has a password. */
  PZ.buildJson = async function (doc) {
    const d = PZ.clone(doc);
    PZ.gcAssets(d);
    if (d.password) return JSON.stringify({ app: 'prezen', v: 1, enc: await PZ.lockPacked(await PZ.packJson(d), d.password) });
    return JSON.stringify({ app: 'prezen', v: 1, doc: d }, null, 1);
  };
})(window.PZ = window.PZ || {});
