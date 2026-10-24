// Save core tests (T3, R6.2 to R6.5, acceptance A9): hashing, splicing under the line-ending and blank-line rules,
// validation through renderDoc, and the atomic write. Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARGENT_CORPUS } from './helpers/corpus.mjs';

// Every .md under dir, recursively, sorted.
function markdownUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...markdownUnder(full));
    else if (name.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

const { hash, splice, validate, writeAtomic } = await import('../.build/serve/splice.js');
const { renderDoc } = await import('../.build/render/page.js');

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, 'fixtures', 'splice');
const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');

test('hash is SHA-256 hex, and a string hashes as its UTF-8 bytes', () => {
  assert.equal(hash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(hash('héllo'), hash(Buffer.from('héllo', 'utf8')));
  assert.equal(hash(new Uint8Array(Buffer.from('abc'))), hash('abc'));
});

test('A9: a CRLF file keeps CRLF after a multi-line edit', () => {
  const src = fixture('crlf.md');
  // Lines 5-6 are "Second paragraph," and "over two lines."
  const out = splice(src, [5, 6], 'Second paragraph,\nnow three\nlines');
  assert.equal(out, '# CRLF doc\r\n\r\nFirst paragraph.\r\n\r\nSecond paragraph,\r\nnow three\r\nlines\r\n\r\nLast paragraph.\r\n');
  assert.equal(out.replace(/\r\n/g, '').includes('\n'), false, 'no bare LF in a CRLF file');
});

test('A9: a CRLF file keeps CRLF when its last line is edited', () => {
  const src = fixture('crlf.md');
  const out = splice(src, [8, 8], 'Last\nparagraph');
  assert.equal(out, '# CRLF doc\r\n\r\nFirst paragraph.\r\n\r\nSecond paragraph,\r\nover two lines.\r\n\r\nLast\r\nparagraph\r\n');
});

test('A9: a file with no final newline keeps none when its last line is edited', () => {
  const src = fixture('no-final-newline.md');
  const out = splice(src, [7, 7], 'Changed last\nline');
  assert.equal(out, '# Bare doc\n\nFirst paragraph.\n\nSecond paragraph.\n\nChanged last\nline');
});

test('A9: a file with no final newline keeps none when a middle line is edited', () => {
  const src = fixture('no-final-newline.md');
  const out = splice(src, [3, 3], 'Changed first\n\nsecond block');
  assert.equal(out, '# Bare doc\n\nChanged first\n\nsecond block\n\nSecond paragraph.\n\nLast line with no newline');
});

test('the file line ending decides the replacement ending, and lines outside the range keep their bytes', () => {
  // The first break is CRLF, so the file is CRLF, and the LF-only line 3 is left alone.
  assert.equal(splice('A\r\nB\nC\r\n', [1, 1], 'x\ny'), 'x\r\ny\r\nB\nC\r\n');
  // The first break is LF, so a CRLF line in the middle does not switch the file to CRLF.
  assert.equal(splice('A\nB\r\nC\n', [3, 3], 'x'), 'A\nB\r\nx\n');
});

test('a trailing newline on the text is ignored', () => {
  const src = 'a\nb\nc\n';
  assert.equal(splice(src, [2, 2], 'x\n'), splice(src, [2, 2], 'x'));
  assert.equal(splice(src, [2, 2], 'x\n'), 'a\nx\nc\n');
});

test('deleting a block in the middle leaves one blank line at the seam', () => {
  const src = '# T\n\nPara one.\n\nPara two.\n\n## Next\n\nBody\n';
  assert.equal(splice(src, [3, 3], ''), '# T\n\nPara two.\n\n## Next\n\nBody\n');
  assert.equal(splice('A\n\nB\n\nC\n', [3, 3], ''), 'A\n\nC\n');
  assert.equal(splice('A\nB\nC\n', [2, 2], ''), 'A\nC\n');
});

test('deleting the first block leaves no leading blank line', () => {
  assert.equal(splice('# T\n\nPara one.\n\nPara two.\n', [1, 1], ''), 'Para one.\n\nPara two.\n');
});

test('deleting the last block leaves no dangling blank line', () => {
  assert.equal(splice('# T\n\nPara one.\n\nPara two.\n', [5, 5], ''), '# T\n\nPara one.\n');
});

test('deleting the only block leaves an empty file', () => {
  assert.equal(splice('# T\n', [1, 1], ''), '');
  assert.equal(splice('# T\n', [1, 1], '\n'), '');
});

test('deleting the last lines of a file with no final newline keeps it that way', () => {
  assert.equal(splice('A\n\nB', [3, 3], ''), 'A');
  assert.equal(splice('A\nB\nC', [2, 2], ''), 'A\nC');
});

test('a multi-block text replaces one range with several blocks', () => {
  assert.equal(splice('# T\n\nOld.\n\nEnd\n', [3, 3], 'a\n\nb'), '# T\n\na\n\nb\n\nEnd\n');
});

test('a range at the start and at the end of the file', () => {
  assert.equal(splice('a\nb\nc\n', [1, 1], 'X'), 'X\nb\nc\n');
  assert.equal(splice('a\nb\nc\n', [3, 3], 'X'), 'a\nb\nX\n');
  assert.equal(splice('a\nb\nc\n', [1, 3], 'X'), 'X\n');
});

test('ranges outside the file throw', () => {
  const src = 'a\nb\nc\n';
  assert.throws(() => splice(src, [0, 1], 'x'), /outside the file, which has 3 lines/);
  assert.throws(() => splice(src, [2, 1], 'x'), /outside the file/);
  assert.throws(() => splice(src, [1, 4], 'x'), /outside the file/);
  assert.throws(() => splice('', [1, 1], 'x'), /outside the file, which has 0 lines/);
});

test('a file with no lines has none to splice, and a trailing newline is not a line', () => {
  assert.throws(() => splice('a\n', [2, 2], 'x'), /outside the file, which has 1 lines/);
});

test('identity: splicing every top-level block of the frozen margent docs gives the same bytes', () => {
  // A copy of the whole tree, so every relative image link resolves as it does in the repo. Block ranges come from
  // the markdown alone, so the copy is only there for the renderer to find its links.
  const work = mkdtempSync(join(tmpdir(), 'margent-splice-corpus-'));
  try {
    const docs = join(work, 'docs');
    cpSync(MARGENT_CORPUS, docs, { recursive: true });
    const files = markdownUnder(docs);

    let total = 0;
    for (const file of files) {
      const name = relative(docs, file);
      const source = readFileSync(file, 'utf8');
      const { html } = renderDoc({ file, source, root: docs, outFile: file.replace(/\.md$/, '.html') });
      const lines = source.split('\n');
      for (const [, start, end] of html.matchAll(/data-src="(\d+)-(\d+)"/g)) {
        const [s, e] = [Number(start), Number(end)];
        const text = lines.slice(s - 1, e).join('\n');
        assert.equal(splice(source, [s, e], text), source, `${name} lines ${s}-${e}`);
        total++;
      }
    }
    assert.ok(total > 200, `expected more than 200 block ranges, found ${total}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('hash of a spliced file changes with the text and is stable for the same bytes', () => {
  const before = '# T\n\nOld.\n';
  const after = splice(before, [3, 3], 'New.');
  assert.notEqual(hash(before), hash(after));
  assert.equal(hash(after), hash(splice(before, [3, 3], 'New.\n')));
});

test('validate: a valid doc gives no errors', () => {
  const file = join(FIXTURES, 'docs', 'valid.md');
  assert.deepEqual(validate(file, join(FIXTURES, 'docs'), readFileSync(file, 'utf8')), []);
});

test('renderDoc throws a RenderError with the line of a broken island', () => {
  const root = join(FIXTURES, 'docs');
  const file = join(root, 'broken.md');
  // Naming an island with no module is a Node-side error (M5 R1.2). A schema failure is a page error now, so not used here.
  const source = splice(readFileSync(file, 'utf8'), [5, 5], '<!-- island nosuch -->');
  assert.throws(
    () => renderDoc({ file, source, root, outFile: join(root, 'broken.html') }),
    // Checked by name: each .build/ module bundles its own copy of the class.
    (err) => err.name === 'RenderError' && err.line === 5 && err.message.includes('broken.md:5: island "nosuch" has no module')
  );
});

test('validate: a splice that breaks an island returns one RenderError with file and line', () => {
  const root = join(FIXTURES, 'docs');
  const file = join(root, 'valid.md');
  // Renaming the island to one with no module is a Node-side render error (M5 R1.2).
  const broken = splice(readFileSync(file, 'utf8'), [5, 5], '<!-- island nosuch -->');
  const errors = validate(file, root, broken);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].name, 'RenderError');
  assert.equal(errors[0].line, 5);
  assert.match(errors[0].message, /valid\.md:5: island "nosuch" has no module/);
});

test('validate does not write the HTML file', () => {
  const work = mkdtempSync(join(tmpdir(), 'margent-splice-validate-'));
  try {
    const file = join(work, 'valid.md');
    writeFileSync(file, fixture('docs/valid.md'));
    mkdirSync(join(work, 'islands'));
    copyFileSync(join(FIXTURES, 'docs', 'islands', 'tally.island.js'), join(work, 'islands', 'tally.island.js'));
    assert.deepEqual(validate(file, work, readFileSync(file, 'utf8')), []);
    assert.deepEqual(readdirSync(work).sort(), ['islands', 'valid.md']);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('writeAtomic writes the text, keeps the mode, and leaves no temp file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'margent-splice-write-'));
  try {
    const file = join(dir, 'doc.md');
    writeFileSync(file, 'old\n');
    chmodSync(file, 0o640);
    writeAtomic(file, 'new\r\ntext');
    assert.equal(readFileSync(file, 'utf8'), 'new\r\ntext');
    assert.equal(statSync(file).mode & 0o777, 0o640);
    assert.deepEqual(readdirSync(dir), ['doc.md']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeAtomic creates a new file when none exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'margent-splice-write-'));
  try {
    writeAtomic(join(dir, 'new.md'), 'hello\n');
    assert.equal(readFileSync(join(dir, 'new.md'), 'utf8'), 'hello\n');
    assert.deepEqual(readdirSync(dir), ['new.md']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeAtomic removes its temp file and rethrows when the rename fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'margent-splice-write-'));
  try {
    // A non-empty folder cannot be replaced by a file, so the rename fails after the temp file is written.
    const target = join(dir, 'doc.md');
    mkdirSync(target);
    writeFileSync(join(target, 'keep.txt'), 'x');
    assert.throws(() => writeAtomic(target, 'text'));
    assert.deepEqual(readdirSync(dir), ['doc.md']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
