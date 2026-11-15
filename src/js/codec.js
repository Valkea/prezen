/* PrezEn · codec: the whole presentation packed into the link (#p=…), like Dedal.
 * JSON → deflate (native CompressionStream, no library) → base64url. The part after # is never sent to a server. */
(function (PZ) {
  'use strict';

  PZ.toBase64Url = function (bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  PZ.fromBase64Url = function (s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  async function pipe(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Version prefix: "z" = deflate-raw, "j" = plain (browsers without CompressionStream). */
  PZ.packJson = async function (value) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    if (typeof CompressionStream === 'function') return 'z' + PZ.toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
    return 'j' + PZ.toBase64Url(bytes);
  };
  PZ.unpackJson = async function (packed) {
    const kind = packed[0], body = PZ.fromBase64Url(packed.slice(1));
    let bytes;
    if (kind === 'z') {
      if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open compressed links');
      bytes = await pipe(body, new DecompressionStream('deflate-raw'));
    } else if (kind === 'j') bytes = body;
    else throw new Error('Unknown link format');
    if (bytes.length > 60 * 1048576) throw new Error('Link too large');
    return JSON.parse(new TextDecoder().decode(bytes));
  };

  /** Drop default values so links stay short. */
  function prune(v) {
    if (Array.isArray(v)) return v.map(prune);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) {
        const x = v[k];
        if (x === undefined || x === null || x === '') continue;
        if (typeof x === 'number') o[k] = Math.round(x * 100) / 100;
        else o[k] = prune(x);
      }
      return o;
    }
    return v;
  }
  PZ.encodeDoc = (doc, opts) => {
    const d = PZ.clone(doc);
    PZ.gcAssets(d);
    if (opts && opts.withoutAssets) { d.assets = {}; PZ.imageRefs(d).forEach((r) => { if (r.ref.startsWith('asset:')) r.set(''); }); }
    return PZ.packJson(prune(d));
  };
  PZ.decodeDoc = async (packed) => PZ.normalizeDoc(await PZ.unpackJson(packed));

  PZ.readHash = function () {
    const m = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash);
    return m ? m[1] : null;
  };
  PZ.hashFlag = (name) => new RegExp('[#&]' + name + '(?:[=&]|$)').test(location.hash);

  /** Base address for share links: this page when hosted, the public app when running from a file. */
  PZ.appUrl = () => (/^https?:$/.test(location.protocol) ? location.origin + location.pathname : PZ.PUBLIC_URL);
})(window.PZ = window.PZ || {});
