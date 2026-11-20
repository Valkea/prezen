// Build: inline every stylesheet and script of index.html into one self-contained HTML file.
// No dependencies. Output: dist/index.html (GitHub Pages) and dist/PrezEn.html (same file, to download / copy to a flashdrive).
//   node build.mjs --pdfjs   also bundles pdf.js (PDF import then works offline; the file grows by ~1.4 MB).
//                            Downloaded once from jsDelivr into vendor/, checked against the hashes in src/js/editor/pdf.js.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const withPdfjs = process.argv.includes('--pdfjs') || process.env.PREZEN_PDFJS === '1';

/** The pdf.js files named in src/js/editor/pdf.js, as inert <script type="text/plain"> nodes the app evaluates on demand. */
async function pdfjsNodes() {
  const src = read('src/js/editor/pdf.js');
  const version = /const PDFJS_VERSION = '([\w.-]+)';/.exec(src)[1];
  const files = Object.fromEntries([...src.matchAll(/(\w+): \['([\w.-]+\.js)', '(sha384-[\w+/=]+)'\]/g)].map((m) => [m[1], { file: m[2], sri: m[3] }]));
  if (!files.lib || !files.worker) throw new Error('pdf.js file list not found in src/js/editor/pdf.js');
  const dir = join(root, 'vendor', 'pdfjs-' + version);
  mkdirSync(dir, { recursive: true });
  const out = [];
  for (const kind of ['lib', 'worker']) {
    const { file, sri } = files[kind];
    const path = join(dir, file);
    let buf = existsSync(path) ? readFileSync(path) : null;
    if (!buf) {
      const url = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/${file}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Cannot download ${url}: HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    }
    const got = 'sha384-' + createHash('sha384').update(buf).digest('base64');
    if (got !== sri) throw new Error(`${file}: hash ${got} does not match ${sri} (delete ${dir} and build again)`);
    writeFileSync(path, buf);
    const js = buf.toString('utf8');
    if (/<\/script|<!--/i.test(js)) throw new Error(`${file} cannot be inlined`);
    out.push(`<script type="text/plain" data-pz="pdfjs-${kind}">\n${js}\n</script>`);
  }
  return out.join('\n') + '\n';
}

let count = 0;
let html = read('index.html')
  .replace(/<!-- Development entry point[\s\S]*?-->\n<!-- data-pz[\s\S]*?-->\n/, '')
  .replace(/<link rel="stylesheet" href="([^"]+)"([^>]*)>/g, (_, href, attrs) => {
    const css = read(href);
    if (/<\/style/i.test(css)) throw new Error(`${href} contains </style`);
    count++;
    return `<style${attrs}>\n${css}\n</style>`;
  })
  .replace(/<script src="([^"]+)"([^>]*)><\/script>/g, (_, src, attrs) => {
    let js = read(src);
    if (/<\/script/i.test(js)) throw new Error(`${src} contains </script`);
    if (src.endsWith('core.js')) js = js.replace(/PZ\.VERSION = '[^']*'/, `PZ.VERSION = '${pkg.version}'`);
    count++;
    return `<script${attrs}>\n${js}\n</script>`;
  });

if (/(src|href)="src\//.test(html)) throw new Error('Some source files were not inlined');
if (withPdfjs) { // before the real </body> (the last one: inlined scripts contain the text too)
  const end = html.lastIndexOf('</body>');
  html = html.slice(0, end) + (await pdfjsNodes()) + html.slice(end);
}
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
writeFileSync(join(root, 'dist/PrezEn.html'), html);
writeFileSync(join(root, 'dist/.nojekyll'), '');
console.log(`Inlined ${count} files${withPdfjs ? ' + pdf.js' : ''} → dist/index.html, dist/PrezEn.html (${(html.length / 1024).toFixed(0)} KB)`);
