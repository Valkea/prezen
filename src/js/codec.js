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
      if (typeof DecompressionStream !== 'function') throw new Error(PZ.t('This browser cannot open compressed links'));
      bytes = await pipe(body, new DecompressionStream('deflate-raw'));
    } else if (kind === 'j') bytes = body;
    else throw new Error(PZ.t('Unknown link format'));
    if (bytes.length > 60 * 1048576) throw new Error(PZ.t('Link too large'));
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
  // ---------------------------------------------------------------- password protection
  /* "e" = encrypted pack: AES-GCM 256 with a key derived from the password (PBKDF2-SHA256).
   * Body: [format 1][salt 16][iv 12][ciphertext]. The plaintext is the inner pack's kind letter ("z"/"j")
   * followed by its raw bytes, so a protected link is barely longer than an open one. */
  const ITERATIONS = 250000;
  function subtle() {
    const c = typeof crypto !== 'undefined' && crypto.subtle;
    if (!c) throw new Error(PZ.t('This browser cannot open password-protected presentations here.'));
    return c;
  }
  async function deriveKey(password, salt) {
    const s = subtle();
    const base = await s.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return s.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  PZ.isLocked = (packed) => typeof packed === 'string' && packed[0] === 'e';

  PZ.lockPacked = async function (packed, password) {
    const inner = PZ.fromBase64Url(packed.slice(1));
    const plain = new Uint8Array(inner.length + 1);
    plain[0] = packed.charCodeAt(0);
    plain.set(inner, 1);
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, await deriveKey(password, salt), plain));
    const out = new Uint8Array(29 + ct.length);
    out[0] = 1; out.set(salt, 1); out.set(iv, 17); out.set(ct, 29);
    return 'e' + PZ.toBase64Url(out);
  };

  /** Back to the inner pack. A wrong password throws an error flagged wrongPassword. */
  PZ.unlockPacked = async function (packed, password) {
    const b = PZ.fromBase64Url(packed.slice(1));
    if (b[0] !== 1 || b.length < 30) throw new Error(PZ.t('Unknown link format'));
    const s = subtle();
    let plain;
    try {
      plain = new Uint8Array(await s.decrypt({ name: 'AES-GCM', iv: b.subarray(17, 29) }, await deriveKey(password, b.subarray(1, 17)), b.subarray(29)));
    } catch (e) {
      const err = new Error(PZ.t('Wrong password'));
      err.wrongPassword = true;
      throw err;
    }
    return String.fromCharCode(plain[0]) + PZ.toBase64Url(plain.subarray(1));
  };

  /** Full-screen password prompt (works in the light slideshow too). Resolves to the inner pack, or null when cancelled. */
  PZ.askUnlock = function (packed, o) {
    o = o || {};
    const h = PZ.h, t = PZ.t;
    return new Promise((resolve) => {
      const input = h('input', { class: 'pz-lock-input', type: 'password', autocomplete: 'current-password', 'aria-label': t('Password'), placeholder: t('Password') });
      const err = h('p', { class: 'pz-lock-err', role: 'alert' });
      const ok = h('button', { class: 'pz-lock-btn pz-lock-primary', type: 'submit', text: t('Open') });
      const done = (v) => { box.remove(); resolve(v); };
      const form = h('form', { class: 'pz-lock-box' },
        PZ.icon ? PZ.icon('lock', 'pz-lock-ico') : null,
        h('h1', { text: t('Protected presentation') }),
        h('p', { text: t('Enter the password to open it.') }),
        input, err,
        h('div', { class: 'pz-lock-btns' },
          o.cancel ? h('button', { class: 'pz-lock-btn', type: 'button', text: t('Cancel'), onClick: () => done(null) }) : null, ok));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!input.value) { input.focus(); return; }
        ok.disabled = input.disabled = true;
        err.textContent = t('Checking…');
        try { done(await PZ.unlockPacked(packed, input.value)); } catch (ex) {
          err.textContent = ex.wrongPassword ? t('Wrong password. Try again.') : ex.message;
          ok.disabled = input.disabled = false;
          input.select();
        }
      });
      const box = h('div', { class: 'pz-lock' }, form);
      document.body.appendChild(box);
      input.focus();
    });
  };

  /** JSON value of any pack. A locked pack uses o.password, or asks for it (o.cancel: offer a Cancel button → null). */
  PZ.unpackAny = async function (packed, o) {
    o = o || {};
    if (PZ.isLocked(packed)) {
      packed = o.password != null ? await PZ.unlockPacked(packed, o.password) : await PZ.askUnlock(packed, o);
      if (packed == null) return null;
    }
    return PZ.unpackJson(packed);
  };

  /** Pack a doc for a link or a file: encrypted with doc.password when it has one. */
  PZ.encodeDoc = async (doc, opts) => {
    const d = PZ.clone(doc);
    PZ.gcAssets(d);
    if (opts && opts.withoutAssets) { d.assets = {}; PZ.imageRefs(d).forEach((r) => { if (r.ref.startsWith('asset:')) r.set(''); }); }
    const packed = await PZ.packJson(prune(d));
    return d.password ? PZ.lockPacked(packed, d.password) : packed;
  };
  /** Resolves to null when the password prompt was cancelled. */
  PZ.decodeDoc = async (packed, o) => {
    const v = await PZ.unpackAny(packed, o);
    return v == null ? null : PZ.normalizeDoc(v);
  };

  PZ.readHash = function () {
    const m = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash);
    return m ? m[1] : null;
  };
  PZ.hashFlag = (name) => new RegExp('[#&]' + name + '(?:[=&]|$)').test(location.hash);

  /** Base address for share links: this page when hosted, the public app when running from a file. */
  PZ.appUrl = () => (/^https?:$/.test(location.protocol) ? location.origin + location.pathname : PZ.PUBLIC_URL);
})(window.PZ = window.PZ || {});
