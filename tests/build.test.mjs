import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('the build inlines every file into one HTML page', () => {
  execFileSync(process.execPath, ['build.mjs']);
  const html = readFileSync('dist/index.html', 'utf8');
  assert.doesNotMatch(html, /(src|href)="src\//);
  const src = readFileSync('index.html', 'utf8');
  const parts = (s) => (s.match(/data-pz="[\w-]+"/g) || []).sort();
  assert.deepEqual(parts(html), parts(src));
  assert.equal((html.match(/<script [^>]*data-player/g) || []).length, (src.match(/<script [^>]*data-player/g) || []).length);
  assert.equal((html.match(/\n<\/script>/g) || []).length, (src.match(/<script src=/g) || []).length, 'every script closes once');
});
