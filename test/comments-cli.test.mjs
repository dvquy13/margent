// The comment commands of the CLI (M3 spec R8, R9, A8, A9; plan T4): `comments`, `export --md --clean`, `export --clean`
// and `serve --author`. Each test spawns dist/cli.js, so run `npm run build` first. The fixtures are in
// test/fixtures/comments/cli/ (the folder every test below walks) and test/fixtures/comments/errors/ (malformed docs).
// UPDATE_GOLDEN=1 rewrites test/golden/comments/; review the diff before committing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { versionless } from './helpers/version.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'dist', 'cli.js');
const CLI_FIX = 'test/fixtures/comments/cli';
const ERRORS = 'test/fixtures/comments/errors';
const BREAKS = 'test/fixtures/comments/breaks';
const GOLDEN = join(REPO, 'test', 'golden', 'comments');

const workdir = mkdtempSync(join(tmpdir(), 'margent-comments-cli-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

let counter = 0;
function scratch(label) {
  const dir = join(workdir, `${label}-${counter++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Runs the CLI from `cwd` (the repo by default), with a cache of the test's own.
function cli(args, cwd = REPO) {
  const cache = scratch('cache');
  const env = { ...process.env, BROWSER: 'true', XDG_CACHE_HOME: cache };
  delete env.MARGENT_CHROME;
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env });
}

// Byte-for-byte golden comparison of a file under test/golden/comments/. UPDATE_GOLDEN=1 rewrites it.
function assertGolden(name, actual) {
  const path = join(GOLDEN, name);
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, versionless(Buffer.isBuffer(actual) ? actual.toString('utf8') : actual));
    return;
  }
  assert.ok(existsSync(path), `golden ${name} is missing (run with UPDATE_GOLDEN=1 and review it)`);
  const expected = readFileSync(path);
  const got = Buffer.from(versionless(Buffer.isBuffer(actual) ? actual.toString('utf8') : actual), 'utf8');
  assert.ok(got.equals(expected), `golden ${name} differs (rerun with UPDATE_GOLDEN=1 if the change is intended)`);
}

// Every file under dir, as sorted relative paths with its bytes.
function snapshot(dir) {
  const out = new Map();
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.set(relative(dir, full).split('\\').join('/'), readFileSync(full));
    }
  };
  walk(dir);
  return out;
}

// ---- the independent expectation for --md --clean (A9)
//
// The cleaned text of a source, worked out line by line with plain patterns and no code from src/: a line that holds
// only notes goes; a highlight keeps its text and loses its markers, and notes go, both outside backtick code spans
// and fences; an island marker goes and `island {name}` fences become `yaml`. Blank lines are compared as no part of
// the expectation (splice owns where one goes), so the check is that every other line is what the source says.

const NOTE_ONLY = /^(?:\{>>\[c\d+\] [^\n]*?<<\})+$/;
const NOTE = /\{>>\[c\d+\] [^\n]*?<<\}/g;
const ISLAND_MARKER = /^<!--\s*island\b[^\n]*-->$/;
const ISLAND_FENCE = /^(\s*(?:`{3,}|~{3,}))island\s+\S+$/;

// Markup removed from the parts of a line outside backtick code spans.
function stripMarkup(line) {
  return line
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(NOTE, '').replace(/\{==/g, '').replace(/==\}/g, '')))
    .join('');
}

// The expected cleaned lines of an LF source, blank lines left out.
function expectedNonBlank(source, { islandMarkup }) {
  const out = [];
  let inFence = false;
  for (const line of source.split('\n')) {
    if (inFence) {
      out.push(line);
      if (/^\s*(`{3,}|~{3,})\s*$/.test(line)) inFence = false;
      continue;
    }
    if (islandMarkup && ISLAND_FENCE.test(line)) {
      out.push(line.replace(ISLAND_FENCE, '$1yaml'));
      inFence = true;
      continue;
    }
    if (/^\s*(`{3,}|~{3,})/.test(line)) {
      out.push(line);
      inFence = true;
      continue;
    }
    if (NOTE_ONLY.test(line)) continue;
    if (islandMarkup && ISLAND_MARKER.test(line)) continue;
    out.push(stripMarkup(line));
  }
  return out.filter((line) => line.trim() !== '');
}

// ---- comments (A8, R8)

test('comments on the folder prints the golden report and exits 0', () => {
  const r = cli(['comments', CLI_FIX]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assertGolden('comments.txt', r.stdout);
});

test('comments: each head line names the thread, its state and what it is anchored to (R8.2, R8.3)', () => {
  const r = cli(['comments', `${CLI_FIX}/review.md`]);
  assert.equal(r.status, 0, r.stderr);
  const heads = r.stdout.split('\n').filter((l) => /^\S.*:\d+: \[c\d+\]/.test(l));
  assert.deepEqual(heads, [
    `${CLI_FIX}/review.md:9: [c1] needs you · "96% of rendered pages"`,
    `${CLI_FIX}/review.md:11: [c2] needs agent · point comment`,
    `${CLI_FIX}/review.md:13: [c3] needs agent · "per month"`,
    `${CLI_FIX}/review.md:15: [c4] needs agent · "$40"`,
    `${CLI_FIX}/review.md:22: [c5] needs agent · block comment on the table at line 17`,
    `${CLI_FIX}/review.md:24: [c6] needs you · block comment on the table at line 17`,
    `${CLI_FIX}/review.md:26: [c7] needs agent · "an inline note"`,
  ]);
  assert.match(r.stdout, /\n {2}Claude: Measured on 4 repos\.\n/);
  assert.equal(r.stdout.split('\n').at(-2), '7 threads in 1 doc: 5 needs agent, 2 needs you');
});

test('comments: a block comment on an island says so, with the island anchor (R8.2)', () => {
  const r = cli(['comments', `${CLI_FIX}/islands.md`]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /:17: \[c7\] needs agent · block comment on the island at line 11\n/);
});

test('comments: a quoted block comment names its quote in the head, and the note line drops it (T13)', () => {
  const r = cli(['comments', `${CLI_FIX}/quoted.md`]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(
    r.stdout,
    /^test\/fixtures\/comments\/cli\/quoted\.md:14: \[c1\] needs you · block comment on the table at line 9, at "Wiki and Forum are out"\n {2}Quy: why are these left out\?\n {2}Claude: They were excluded before the sample was drawn\.\n1 thread in 1 doc: 0 needs agent, 1 needs you\n$/
  );
});

test('0041: a quote with #n names its occurrence in the head line, after the quote', () => {
  const r = cli(['comments', 'test/fixtures/comments/quoted-occurrence.md']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(
    r.stdout,
    /^test\/fixtures\/comments\/quoted-occurrence\.md:14: \[c1\] needs you · block comment on the table at line 9, at "keep" #2\n/
  );
});

test('comments: one thread in one doc uses the singular in both places (R8.2)', () => {
  const dir = scratch('one');
  writeFileSync(join(dir, 'one.md'), '---\ntitle: One\n---\n\nA point.{>>[c1] Quy: Check this.<<}\n');
  const r = cli(['comments', '.'], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    r.stdout,
    'one.md:5: [c1] needs agent · point comment\n  Quy: Check this.\n1 thread in 1 doc: 1 needs agent, 0 needs you\n'
  );
});

test('comments: a folder with no threads says so and exits 0, with the count of docs walked (R8.4)', () => {
  const one = scratch('none');
  writeFileSync(join(one, 'a.md'), '# A\n\nNo markup.\n');
  const r1 = cli(['comments', '.'], one);
  assert.equal(r1.status, 0, r1.stderr);
  assert.equal(r1.stdout, 'no threads in 1 doc\n');

  writeFileSync(join(one, 'b.md'), '# B\n\nStill none.\n');
  const r2 = cli(['comments', '.'], one);
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(r2.stdout, 'no threads in 2 docs\n');
});

test('comments on a malformed doc exits 1 with file:line on stderr and no thread list (R8.4, A8)', () => {
  const r = cli(['comments', `${ERRORS}/unclosed-note.md`]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.equal(
    r.stderr,
    `${ERRORS}/unclosed-note.md:7: unclosed {>>: add <<} after the note text\n`
  );
});

test('comments on a folder with malformed docs prints every error, each as file:line, and exits 1 (R8.4)', () => {
  const r = cli(['comments', ERRORS]);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  const lines = r.stderr.trimEnd().split('\n');
  assert.equal(lines.length, 11, r.stderr);
  for (const line of lines) assert.match(line, /^test\/fixtures\/comments\/errors\/[\w-]+\.md:\d+: .+$/, line);
});

// ---- export --md --clean (A9, R9)

const EXPORT_MD = join(workdir, 'export-md-clean');
const EXPORT_PLAIN_MD = join(workdir, 'export-md-plain');
const EXPORT_PAGE = join(workdir, 'export-page-clean');
// The export runs once; the tests below read its output.
const exported = {
  mdClean: cli(['export', CLI_FIX, '--out', EXPORT_MD, '--md', '--clean']),
  mdPlain: cli(['export', CLI_FIX, '--out', EXPORT_PLAIN_MD, '--md']),
  pageClean: cli(['export', CLI_FIX, '--out', EXPORT_PAGE, '--clean']),
};

test('export --md --clean writes every doc as .md at its relative path, one path per line (R9.1)', () => {
  assert.equal(exported.mdClean.status, 0, exported.mdClean.stderr);
  const files = snapshot(EXPORT_MD);
  assert.deepEqual([...files.keys()].sort(), ['crlf.md', 'islands.md', 'plain.md', 'quoted.md', 'review.md']);
  assert.equal(
    exported.mdClean.stdout,
    ['crlf.md', 'islands.md', 'plain.md', 'quoted.md', 'review.md'].map((f) => `${join(EXPORT_MD, f)}\n`).join('')
  );
});

test('export --md --clean output matches its goldens byte for byte (A9)', () => {
  for (const [name, bytes] of snapshot(EXPORT_MD)) assertGolden(join('clean-md', name), bytes);
});

test('export --md --clean: every byte outside the stripped spans is the source (A9, R9.4)', () => {
  for (const name of ['crlf.md', 'islands.md', 'plain.md', 'quoted.md', 'review.md']) {
    const source = readFileSync(join(REPO, CLI_FIX, name), 'utf8');
    const out = readFileSync(join(EXPORT_MD, name), 'utf8');
    const lf = source.replace(/\r\n/g, '\n');
    const got = out.replace(/\r\n/g, '\n');
    assert.deepEqual(
      got.split('\n').filter((l) => l.trim() !== ''),
      expectedNonBlank(lf, { islandMarkup: true }),
      `${name}: the cleaned lines differ from the source with the markup removed`
    );
    // Code keeps its markup as text (review.md's fence and code span use c8 and c9), so only live ids and markers count.
    assert.doesNotMatch(got, /\{>>\[c[1-7]\]|<!-- island/, `${name}: markup left behind outside code`);
    assert.equal(/\r?\n\r?\n\r?\n/.test(out), false, `${name}: a doubled blank line was left behind`);
  }
});

test('export --md --clean keeps CRLF files CRLF, line by line (R9.4)', () => {
  const out = readFileSync(join(EXPORT_MD, 'crlf.md'), 'utf8');
  assert.equal(out.replace(/\r\n/g, '').includes('\n'), false, 'a bare LF was written');
  assert.equal(out.includes('Line one keeps this part for review.\r\n'), true);
  assert.equal(out.includes('{>>'), false);
});

test('export --md --clean of a doc with no comments and no islands is byte-identical to its source (R9.4, A9)', () => {
  assert.equal(exported.mdClean.status, 0, exported.mdClean.stderr);
  const source = readFileSync(join(REPO, CLI_FIX, 'plain.md'));
  assert.ok(readFileSync(join(EXPORT_MD, 'plain.md')).equals(source));
});

test('export --md without --clean copies every source byte (R9.1)', () => {
  assert.equal(exported.mdPlain.status, 0, exported.mdPlain.stderr);
  const files = snapshot(EXPORT_PLAIN_MD);
  for (const name of ['crlf.md', 'islands.md', 'plain.md', 'quoted.md', 'review.md']) {
    assert.ok(files.get(name).equals(readFileSync(join(REPO, CLI_FIX, name))), `${name} differs from its source`);
  }
});

test('export --clean writes pages rendered from the cleaned source, with no thread left (R9.1, A9)', () => {
  assert.equal(exported.pageClean.status, 0, exported.pageClean.stderr);
  const page = readFileSync(join(EXPORT_PAGE, 'review.html'), 'utf8');
  assert.equal(page.includes('c-thread'), false);
  assert.equal(page.includes('c-hl'), false);
  assert.equal(page.includes('open</span>'), false, 'the header still counts open threads');
  // The fence and the code span keep their markup as text (c8, c9); the live notes (c1 to c7) are gone.
  assert.equal(/\[c[1-7]\]/.test(page), false, 'a note survived the cleaning');
  assert.ok(page.includes('96% of <strong>rendered</strong> pages in the sample.'));
  assert.ok(page.includes('{&gt;&gt;[c9] X: y&lt;&lt;}'), 'markup in a code span stays text');
});

test('export --clean page for review.md matches its golden byte for byte (A9)', () => {
  assertGolden('clean-page/review.html', readFileSync(join(EXPORT_PAGE, 'review.html')));
});

test('export --md --clean of a folder with a malformed doc writes nothing and exits 1 (R8.4 style)', () => {
  const out = join(scratch('out'), 'never');
  const r = cli(['export', ERRORS, '--out', out, '--md', '--clean']);
  assert.equal(r.status, 1);
  assert.equal(existsSync(out), false, 'the output folder was created');
  assert.match(r.stderr, /test\/fixtures\/comments\/errors\/[\w-]+\.md:\d+: /);
});

// ---- serve --author (R5.6 seam, plan T4)

test('serve --author with an empty name is a usage error, exit 2 (plan T4)', () => {
  for (const args of [['serve', CLI_FIX, '--author='], ['serve', CLI_FIX, '--author', ''], ['serve', CLI_FIX, '--author']]) {
    const r = cli(args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /--author needs a name/);
    assert.match(r.stderr, /--author \{name\}/, 'the usage names --author');
  }
});

test('serve --author with a name the note syntax cannot hold is a usage error, exit 2', () => {
  const r = cli(['serve', CLI_FIX, '--author=Quy: dev']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /must not hold ':'/);
});

test('decision 0037: comments prints each further line of a note on its own line, under the text (R8)', () => {
  const r = cli(['comments', `${BREAKS}/two-line.md`]);
  assert.equal(r.status, 0, r.stderr);
  // The author "Quy" is 3 letters, so the text starts at column 2 + 3 + 2 = 7.
  assert.ok(
    r.stdout.includes(
      [
        '  Quy: is that stable across repos?',
        '       Measured on one repo only.',
        '       ',
        '       Check the other three.',
        '  Claude: Measured on 4 repos.',
        '',
      ].join('\n')
    ),
    r.stdout
  );
});
