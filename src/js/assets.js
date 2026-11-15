/* PrezEn · assets: where images come from.
 *   asset:ID          embedded in the doc (doc.assets[ID] = data URL), travels with files and links
 *   https://…         any web image; Google Drive, Dropbox and GitHub page links are rewritten to direct links
 *   s3://bucket/key   public Amazon S3 object (or paste an https / pre-signed S3 URL as is)
 *   gs://bucket/key   public Google Cloud Storage object
 *   images/photo.jpg  a path relative to the presentation file (flashdrive / local folder use)
 */
(function (PZ) {
  'use strict';

  const driveId = (u) => {
    let m = /drive\.google\.com\/file\/d\/([\w-]{10,})/.exec(u) || /drive\.google\.com\/(?:open|uc|thumbnail)\?(?:.*&)?id=([\w-]{10,})/.exec(u)
      || /docs\.google\.com\/uc\?(?:.*&)?id=([\w-]{10,})/.exec(u) || /lh3\.googleusercontent\.com\/d\/([\w-]{10,})/.exec(u);
    return m ? m[1] : '';
  };

  /** What kind of reference is this? (used for badges and help in the editor) */
  PZ.srcKind = function (ref) {
    if (!ref) return 'none';
    if (ref.startsWith('asset:')) return 'embedded';
    if (ref.startsWith('data:')) return 'embedded';
    if (/^s3:\/\//i.test(ref) || /\.s3[.-]([\w-]+\.)?amazonaws\.com/i.test(ref)) return 's3';
    if (/^gs:\/\//i.test(ref) || /storage\.googleapis\.com/i.test(ref)) return 'gcs';
    if (driveId(ref)) return 'drive';
    if (/dropbox(usercontent)?\.com/i.test(ref)) return 'dropbox';
    if (/^https?:\/\//i.test(ref)) return 'url';
    if (/^blob:/i.test(ref)) return 'blob';
    if (/^[a-z][\w+.-]*:/i.test(ref)) return 'invalid';
    return 'relative';
  };
  PZ.SRC_LABELS = { embedded: 'Embedded', s3: 'Amazon S3', gcs: 'Google Cloud', drive: 'Google Drive', dropbox: 'Dropbox', url: 'Web URL', relative: 'Local path', blob: 'Temporary', invalid: 'Invalid', none: 'None' };

  const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

  /** Turn a stored reference into something an <img> can load. Returns {src, fallbacks}. */
  PZ.resolveSrc = function (ref, doc) {
    ref = typeof ref === 'string' ? ref.trim() : '';
    const kind = PZ.srcKind(ref);
    if (kind === 'none' || kind === 'invalid') return { src: '', fallbacks: [] };
    if (ref.startsWith('asset:')) return { src: (doc && doc.assets && doc.assets[ref.slice(6)]) || '', fallbacks: [] };
    if (ref.startsWith('data:')) return { src: /^data:image\//i.test(ref) ? ref : '', fallbacks: [] };
    if (kind === 'drive') {
      const id = driveId(ref);
      return { src: 'https://lh3.googleusercontent.com/d/' + id + '=w2400', fallbacks: ['https://drive.google.com/thumbnail?id=' + id + '&sz=w2400', 'https://drive.google.com/uc?export=view&id=' + id] };
    }
    let m;
    if ((m = /^s3:\/\/([\w.-]+)\/(.+)$/i.exec(ref))) return { src: 'https://' + m[1] + '.s3.amazonaws.com/' + encPath(m[2]), fallbacks: [] };
    if ((m = /^gs:\/\/([\w.-]+)\/(.+)$/i.exec(ref))) return { src: 'https://storage.googleapis.com/' + m[1] + '/' + encPath(m[2]), fallbacks: [] };
    if (kind === 'dropbox') {
      let u = ref.replace(/([?&])dl=0\b/, '$1raw=1');
      if (!/[?&](raw=1|dl=1)/.test(u)) u += (u.includes('?') ? '&' : '?') + 'raw=1';
      return { src: u, fallbacks: [] };
    }
    if ((m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/(.+)$/.exec(ref))) return { src: 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3], fallbacks: [] };
    return { src: ref, fallbacks: [] };
  };

  /** Configure an <img> with a reference, its fallbacks and a final "missing image" hook. */
  PZ.setImgSrc = function (img, ref, doc, onFail) {
    const r = PZ.resolveSrc(ref, doc);
    const queue = r.fallbacks.slice();
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onerror = () => {
      if (queue.length) img.src = queue.shift();
      else { img.onerror = null; if (onFail) onFail(ref); }
    };
    if (r.src) img.src = r.src; else if (onFail) setTimeout(() => onFail(ref));
  };

  // ---------------------------------------------------------------- embedding

  function hash(s) { // FNV-1a over a sample: enough to dedupe identical pictures
    let h = 0x811c9dc5;
    const step = Math.max(1, Math.floor(s.length / 4096));
    for (let i = 0; i < s.length; i += step) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + s.length.toString(36);
  }

  /** Store a data URL in doc.assets and return its reference. */
  PZ.addAsset = function (doc, dataUrl) {
    doc.assets = doc.assets || {};
    const id = 'a' + hash(dataUrl);
    doc.assets[id] = dataUrl;
    return 'asset:' + id;
  };

  /** All image references in a doc as {ref, set(newRef)}. */
  PZ.imageRefs = function (doc) {
    const out = [];
    doc.slides.forEach((s) => {
      if (s.bg && s.bg.src) out.push({ ref: s.bg.src, set: (v) => { s.bg.src = v; } });
      s.els.forEach((el) => { if (el.type === 'image' && el.src) out.push({ ref: el.src, set: (v) => { el.src = v; } }); });
    });
    return out;
  };

  /** Drop embedded assets nothing refers to. */
  PZ.gcAssets = function (doc) {
    const used = new Set(PZ.imageRefs(doc).map((r) => r.ref).filter((r) => r.startsWith('asset:')).map((r) => r.slice(6)));
    for (const k of Object.keys(doc.assets || {})) if (!used.has(k)) delete doc.assets[k];
  };

  /** Fetch every linked image and embed it. Works for hosts that allow cross-origin reads (CORS) and local paths over http. */
  PZ.embedImages = async function (doc, onProgress) {
    const refs = PZ.imageRefs(doc).filter((r) => !r.ref.startsWith('asset:') && !r.ref.startsWith('data:'));
    const done = new Map();
    const failed = [];
    let i = 0;
    for (const r of refs) {
      if (onProgress) onProgress(++i, refs.length);
      if (done.has(r.ref)) { if (done.get(r.ref)) r.set(done.get(r.ref)); continue; }
      const res = PZ.resolveSrc(r.ref, doc);
      let embedded = '';
      for (const url of [res.src].concat(res.fallbacks)) {
        try {
          const resp = await fetch(url, { mode: 'cors', referrerPolicy: 'no-referrer' });
          if (!resp.ok) continue;
          const blob = await resp.blob();
          if (!/^image\//.test(blob.type)) continue;
          embedded = PZ.addAsset(doc, await PZ.blobToDataUrl(blob));
          break;
        } catch (e) { /* CORS or network: try the next one */ }
      }
      done.set(r.ref, embedded);
      if (embedded) r.set(embedded); else failed.push(r.ref);
    }
    return { total: done.size, failed: Array.from(new Set(failed)) };
  };

  /** Read a picked/dropped file as a data URL, shrinking big photos (keeps SVG and GIF as they are). */
  PZ.imageFileToDataUrl = async function (file, opts) {
    opts = opts || {};
    const maxDim = opts.maxDim || 2400;
    if (!/^image\//.test(file.type)) throw new Error(PZ.t('Not an image'));
    const raw = await PZ.readFile(file, 'dataURL');
    if (opts.optimize === false || /svg|gif/.test(file.type)) return raw;
    const img = new Image();
    img.src = raw;
    try { await img.decode(); } catch (e) { return raw; }
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 600 * 1024) return raw;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
    const out = c.toDataURL(type, 0.86);
    return out.length < raw.length ? out : raw;
  };

  /** Natural size of an image reference (to insert it with the right proportions). */
  PZ.imageSize = function (ref, doc) {
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;
      const end = (v) => { if (!done) { done = true; resolve(v); } };
      PZ.setImgSrc(img, ref, doc, () => end(null));
      img.onload = () => end({ w: img.naturalWidth, h: img.naturalHeight });
      setTimeout(() => end(null), 8000);
    });
  };
})(window.PZ = window.PZ || {});
