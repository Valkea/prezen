// Load the browser scripts into a Node VM context (they are classic scripts sharing window.PZ).
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function load(files) {
  const ctx = {
    console, setTimeout, clearTimeout, TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Blob, Response, btoa, atob, URL,
    CSS: { supports: (p, v) => /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d.,\s%]+\))$/i.test(v), escape: (s) => s },
    location: { protocol: 'https:', origin: 'https://example.org', pathname: '/prezen/', hash: '' },
    navigator: { platform: 'Linux', userAgent: 'node' },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(readFileSync(join(root, f), 'utf8'), ctx, { filename: f });
  return ctx.PZ;
}

export const CORE = ['src/js/core.js', 'src/js/sanitize.js', 'src/js/model.js', 'src/js/assets.js', 'src/js/icons.js', 'src/js/shapes.js', 'src/js/effects.js', 'src/js/codec.js'];
/** JSON round trip: compares values across VM realms. */
export const plain = (v) => JSON.parse(JSON.stringify(v));
