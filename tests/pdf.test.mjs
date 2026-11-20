// PDF import, editable mode: how text pieces become lines, blocks and rich text, and where pictures go.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, CORE, plain } from './load.mjs';

const PZ = load([...CORE, 'src/js/editor/pdf.js']);
const { buildLines, buildBlocks, blockHtml, familyNames, pictureBox, scanOps } = PZ.edPdf.internals;

/** A text piece as textRuns() makes it: baseline at (x, y) in device pixels, len wide. */
const run = (str, x, y, o = {}) => Object.assign({ str, x, y, len: str.length * 10, size: 20, angle: 0, color: '#111111', font: 'Arial', bold: false, italic: false }, o);

test('pieces on one baseline make one line, with spaces where the gaps are', () => {
  const lines = buildLines([run('world', 70, 100), run('Hello', 10, 100.4), run('again', 125, 100)]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].runs.map((r) => r.str).join(''), 'Hello world again');
});

test('a wide gap splits columns, and text drawn twice (fake bold) is kept once', () => {
  const lines = buildLines([run('Left', 10, 100), run('Right', 400, 100), run('Left', 10.5, 100)]);
  assert.deepEqual(plain(lines.map((l) => l.runs.map((r) => r.str).join(''))), ['Left', 'Right']);
});

test('lines of one look and regular spacing make a block; another look starts a new one', () => {
  const lines = buildLines([
    run('Title', 10, 50, { size: 40, bold: true }),
    run('First line of a paragraph that is long', 10, 120), run('second line of it', 10, 146), run('third', 10, 172),
    run('Footer', 10, 400),
  ]);
  const blocks = buildBlocks(lines);
  assert.deepEqual(plain(blocks.map((b) => b.lines.length)), [1, 3, 1]);
  assert.equal(blocks[1].align, 'left');
  assert.equal(blocks[1].gap, 26);
});

test('centred lines make a centred block', () => {
  const blocks = buildBlocks(buildLines([run('A centred title line', 300, 100), run('short', 375, 126)]));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].align, 'center');
});

test('rich text: wrapped paragraph lines are joined, bullets keep their breaks, other looks get a span', () => {
  const para = buildBlocks(buildLines([run('A paragraph line wide', 10, 100), run('that goes on here.', 10, 126)]))[0];
  assert.equal(blockHtml(para, 1, 1), 'A paragraph line wide that goes on here.');
  const list = buildBlocks(buildLines([run('• One', 10, 100), run('• Two with', 10, 126), run('bold', 130, 126, { bold: true }), run('& more', 180, 126)]))[0];
  assert.equal(blockHtml(list, 1, 1), '• One<br>• Two with<span style="font-weight:700"> bold</span> &amp; more');
  const hyphen = buildBlocks(buildLines([run('A long hyphenated inter-', 10, 100), run('national word', 10, 126)]))[0];
  assert.equal(blockHtml(hyphen, 1, 1), 'A long hyphenated inter-national word');
});

test('font names: family candidates from PostScript names', () => {
  assert.deepEqual(plain(familyNames('DejaVuSans-Bold').slice(0, 2)), ['Deja Vu Sans', 'DejaVu Sans']);
  assert.ok(familyNames('DejaVuSans-Bold').includes('DejaVuSans'));
  assert.equal(familyNames('TimesNewRomanPSMT')[0], 'Times New Roman');
  assert.deepEqual(plain(familyNames('ArialMT')), ['Arial']);
  assert.equal(familyNames('OpenSans-SemiBold')[0], 'Open Sans');
});

test('pictures: upright ones become images; turned, upside-down, full-page and tiny ones stay in the background', () => {
  const W = 1920, H = 1080, q = 1;
  assert.deepEqual(plain(pictureBox([400, 0, 0, -200, 100, 500], W, H, q, 0, 0)), { x: 100, y: 300, w: 400, h: 200, flip: false, dev: 400 });
  const mirrored = pictureBox([-400, 0, 0, -200, 600, 500], W, H, q, 0, 0); // a < 0
  assert.equal(mirrored.x, 200);
  assert.equal(mirrored.flip, true);
  assert.equal(pictureBox([0, 400, -200, 0, 300, 100], W, H, q, 0, 0), null); // turned
  assert.equal(pictureBox([400, 0, 0, 200, 100, 300], W, H, q, 0, 0), null); // upside down
  assert.equal(pictureBox([1920, 0, 0, -1080, 0, 1080], W, H, q, 0, 0), null); // the whole page
  assert.equal(pictureBox([10, 0, 0, -10, 100, 100], W, H, q, 0, 0), null); // tiny
  assert.equal(pictureBox([400, 0, 0, -200, 1800, 500], W, H, q, 0, 0), null); // cut by the page edge
});

test('operator list: text operations are found, pictures get the transform in force', () => {
  const O = { save: 10, restore: 11, transform: 12, showText: 44, showSpacedText: 45, paintImageXObject: 85, beginAnnotation: 80, endAnnotation: 81 };
  const ops = {
    fnArray: [O.save, O.transform, O.paintImageXObject, O.restore, O.showText, O.beginAnnotation, O.showText, O.paintImageXObject, O.endAnnotation, O.showSpacedText],
    argsArray: [null, [100, 0, 0, 50, 10, 20], ['img1', 4, 2], null, [[]], [], [[]], ['img2', 4, 2], null, [[]]],
  };
  const r = scanOps(O, ops, { transform: [2, 0, 0, -2, 0, 1000] });
  assert.deepEqual(plain(r.text), [4, 9]); // the one inside the annotation stays drawn
  assert.equal(r.images.length, 1);
  assert.deepEqual(plain(r.images[0].m), [200, 0, 0, -100, 20, 960]);
});
