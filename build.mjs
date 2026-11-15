// Build: inline every stylesheet and script of index.html into one self-contained HTML file.
// No dependencies. Output: dist/index.html (GitHub Pages) and dist/PrezEn.html (same file, to download / copy to a flashdrive).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));

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
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
writeFileSync(join(root, 'dist/PrezEn.html'), html);
writeFileSync(join(root, 'dist/.nojekyll'), '');
console.log(`Inlined ${count} files → dist/index.html, dist/PrezEn.html (${(html.length / 1024).toFixed(0)} KB)`);
