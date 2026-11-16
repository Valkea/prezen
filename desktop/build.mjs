// Desktop app (Neutralinojs), experimental. Usage: node desktop/build.mjs [run|build] [-- extra args for the app]
//   1. builds the single-file app (../build.mjs) and writes resources/index.html = dist/index.html + desktop.js
//   2. downloads the Neutralinojs binaries into bin/ the first time (neu update)
//   3. run: opens the app in a window · build: single executables per platform in dist/prezen/ (neu build --embed-resources)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const NEU = '@neutralinojs/neu@11.8.0';
const [cmd = 'run', ...rest] = process.argv.slice(2);
const appArgs = rest[0] === '--' ? rest.slice(1) : rest;

execFileSync(process.execPath, [join(root, 'build.mjs')], { stdio: 'inherit' });
const html = readFileSync(join(root, 'dist/index.html'), 'utf8');
const js = readFileSync(join(here, 'desktop.js'), 'utf8');
if (/<\/script/i.test(js)) throw new Error('desktop.js contains </script');
const end = html.lastIndexOf('</body>');
mkdirSync(join(here, 'resources'), { recursive: true });
writeFileSync(join(here, 'resources/index.html'), `${html.slice(0, end)}<script>\n${js}\n</script>\n${html.slice(end)}`);
console.log('Wrote desktop/resources/index.html');

const neu = (...args) => execFileSync('npx', ['-y', NEU, ...args], { cwd: here, stdio: 'inherit', shell: process.platform === 'win32' });
if (!existsSync(join(here, 'bin'))) neu('update');
if (cmd === 'run') neu('run', ...(appArgs.length ? ['--', ...appArgs] : []));
else if (cmd === 'build') neu('build', '--embed-resources');
else if (cmd !== 'resources') throw new Error(`Unknown command ${cmd}: use run, build or resources`);
