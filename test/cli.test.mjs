// CLI tests (T6, R4): open, export, check, doctor (R7), --version and usage. Each test spawns `node dist/cli.js` from the repo root,
// so messages carry repo-relative paths. Run after `npm run build`. Browser-dependent checks need an installed Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from './helpers/version.mjs';
import { full } from './helpers/tier.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'dist', 'cli.js');
const FIXTURES = join(REPO, 'test', 'fixtures');
const LINKED = 'test/fixtures/cli/linked';
const ISLANDS_DOCS = 'test/fixtures/islands/docs';
const S3 = 'test/fixtures/islands/s3';

const workdir = mkdtempSync(join(tmpdir(), 'margent-cli-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

let counter = 0;
// A fresh scratch directory per test, so cache and output folders never leak between tests.
function scratch(label) {
  const dir = join(workdir, `${label}-${counter++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Runs the CLI from the repo root. BROWSER=true stands in for the default browser; the cache is the test's own.
function cli(args, { env = {}, cache = scratch('cache') } = {}) {
  const base = { ...process.env, BROWSER: 'true', XDG_CACHE_HOME: cache };
  delete base.MARGENT_CHROME;
  return spawnSync(process.execPath, [CLI, ...args], { cwd: REPO, encoding: 'utf8', env: { ...base, ...env } });
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

// ---- version and usage

test('--version prints the package version and exits 0', () => {
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  const r = cli(['--version']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${pkg.version}\n`);
});

test('no arguments, --help, an unknown command and a missing argument print usage to stderr and exit 2', () => {
  for (const args of [[], ['--help'], ['frobnicate'], ['open'], ['check'], ['export', LINKED], ['export', '--out', 'x']]) {
    const r = cli(args);
    assert.equal(r.status, 2, `margent ${args.join(' ')}: ${r.stderr}`);
    assert.equal(r.stdout, '', `margent ${args.join(' ')} wrote to stdout`);
    assert.match(r.stderr, /usage:\n {2}margent open \{file\}/, `margent ${args.join(' ')}`);
  }
});

test('an unknown command names it on stderr, before the usage', () => {
  const r = cli(['frobnicate']);
  assert.match(r.stderr, /^margent: unknown command "frobnicate"\n/);
});

test('the usage lists doctor after check', () => {
  const r = cli(['--help']);
  assert.match(r.stderr, /usage:\n {2}margent open \{file\}\n {2}margent check \{path\}\n {2}margent doctor\n/);
});

// ---- doctor (R7)

test('doctor on this machine exits 0 and prints the ok lines in order (author may warn instead)', full, () => {
  const r = cli(['doctor']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stderr, '');
  const lines = r.stdout.trim().split('\n');
  for (const line of lines) assert.match(line, /^(ok|warn) /, line);
  const names = lines.map((line) => line.split(':')[0]).filter((name) => name !== 'warn author' && name !== 'ok author');
  assert.deepEqual(names, ['ok node', 'ok margent', 'ok chrome', 'ok opener', 'ok cache', 'ok islands']);
  assert.match(r.stdout, /^ok islands: a sample island rendered in its sandboxed frame$/m);
});

test('doctor with a MARGENT_CHROME that is not a binary exits 1, names it, and skips the islands check', () => {
  const r = cli(['doctor'], { env: { MARGENT_CHROME: '/nope' } });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /^fail chrome: MARGENT_CHROME is set to "\/nope", which is not an executable file\. Install/m);
  assert.match(r.stdout, /^fail islands: skipped, Chrome is not available$/m);
});

test('doctor with XDG_CACHE_HOME pointing at a file exits 1 with a fail cache line', full, () => {
  const file = join(scratch('doctor-cache-file'), 'not-a-folder');
  writeFileSync(file, 'x');
  const r = cli(['doctor'], { cache: file });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /^fail cache: .*: ENOTDIR/m);
  assert.match(r.stdout, /Set XDG_CACHE_HOME to a writable folder\.$/m);
});

test('doctor with a BROWSER that is not on PATH exits 1 with a fail opener line', full, () => {
  const r = cli(['doctor'], { env: { BROWSER: 'definitely-not-a-command-xyz' } });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /^fail opener: definitely-not-a-command-xyz is not on PATH\. Set BROWSER to a browser command\.$/m);
});

test('doctor takes no arguments: an extra argument is a usage error (exit 2)', () => {
  const r = cli(['doctor', 'extra']);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /^margent: doctor takes no arguments\n/);
  assert.equal(r.stdout, '');
});

// ---- open

test('open writes the file and every doc it links to (recursively, within the root) into the cache and prints the page', () => {
  const cache = scratch('open');
  const r = cli(['open', `${LINKED}/index.md`], { cache });
  assert.equal(r.status, 0, r.stderr);
  // The root is the fixture's own folder (it has an islands/ folder), so pages sit at the root-relative paths.
  const root = join(REPO, LINKED);
  const sha = createHash('sha1').update(root).digest('hex');
  const dir = join(cache, 'margent', sha);
  assert.equal(r.stdout, `${join(dir, 'index.html')}\n`);
  assert.deepEqual([...snapshot(dir).keys()].sort(), ['guide.html', 'index.html', 'sub/deep.html']);
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.ok(html.includes(`<meta name="generator" content="margent ${VERSION}">`), 'the generator line names the package version');
  assert.match(html, /href="guide\.html"/);
});

test('open with a file that links nowhere writes only that file', () => {
  const cache = scratch('open-lone');
  const r = cli(['open', `${LINKED}/unlinked.md`], { cache });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(snapshot(cache).size, 1, 'exactly one cache file');
});

test('open fails on a broken doc: every error to stderr, exit 1, nothing written, nothing opened', () => {
  const cache = scratch('open-broken');
  const opener = join(scratch('opener'), 'record.sh');
  const opened = join(dirname(opener), 'opened.txt');
  // BROWSER is a script that records the path it was given. It must not run at all.
  writeFileSync(opener, `#!/bin/sh\necho "$1" > ${opened}\n`);
  chmodSync(opener, 0o755);
  const r = cli(['open', `${ISLANDS_DOCS}/yaml-invalid.md`], { cache, env: { BROWSER: opener } });
  assert.equal(r.status, 1, r.stdout);
  assert.equal(r.stdout, '');
  assert.match(
    r.stderr,
    new RegExp(`^${ISLANDS_DOCS}/yaml-invalid\\.md:6: invalid YAML in island "steps": `)
  );
  assert.equal(r.stderr.trim().split('\n').length, 1, 'one line per error');
  assert.equal(snapshot(cache).size, 0, 'the cache is still empty');
  assert.equal(existsSync(opened), false, 'the browser was not started');
});

test('open of a doc with a pattern mismatch succeeds silently: the island shows it, check reports it (R1.4)', () => {
  const cache = scratch('open-mismatch');
  const r = cli(['open', `${ISLANDS_DOCS}/mismatch.md`], { cache });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(r.stdout.trim(), join(cache, 'margent', createHash('sha1').update(join(REPO, ISLANDS_DOCS)).digest('hex'), 'mismatch.html'));
});

test('open reports a failing opener and exits 1', () => {
  const cache = scratch('open-opener');
  const r = cli(['open', `${LINKED}/guide.md`], { cache, env: { BROWSER: '/nonexistent/browser' } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^margent: could not start the browser opener "\/nonexistent\/browser"/);
});

test('open of a missing or non-markdown file exits 1 with a message', () => {
  const missing = cli(['open', `${LINKED}/absent.md`]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /^margent: no such file or folder: /);
  const notMd = cli(['open', `${LINKED}/sub`]);
  assert.equal(notMd.status, 1);
  assert.match(notMd.stderr, /^margent: not a markdown file: /);
});

// ---- export

test('export of a file writes it and its linked closure under --out, one path per line', () => {
  const out = scratch('export-file');
  const r = cli(['export', `${LINKED}/index.md`, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([...snapshot(out).keys()].sort(), ['guide.html', 'index.html', 'sub/deep.html']);
  assert.deepEqual(
    r.stdout.trim().split('\n').sort(),
    [join(out, 'guide.html'), join(out, 'index.html'), join(out, 'sub', 'deep.html')].sort()
  );
});

test('export of a folder writes every .md under it, paths relative to the folder', () => {
  const out = scratch('export-folder');
  const r = cli(['export', LINKED, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([...snapshot(out).keys()].sort(), ['guide.html', 'index.html', 'sub/deep.html', 'unlinked.html']);
});

test('export skips node_modules and dot-folders', () => {
  const src = scratch('export-skip');
  mkdirSync(join(src, 'node_modules'));
  mkdirSync(join(src, '.hidden'));
  mkdirSync(join(src, 'kept'));
  for (const [path, text] of [
    ['top.md', '# Top\n'],
    ['node_modules/pkg.md', '# Pkg\n'],
    ['.hidden/secret.md', '# Secret\n'],
    ['kept/inner.md', '# Inner\n'],
  ]) {
    writeFileSync(join(src, path), text);
  }
  const out = scratch('export-skip-out');
  const r = cli(['export', src, '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual([...snapshot(out).keys()].sort(), ['kept/inner.html', 'top.html']);
});

test('export output is byte-identical across two runs into two dirs of the same depth (A3)', () => {
  const a = join(scratch('det-a'), 'out');
  const b = join(scratch('det-b'), 'out');
  for (const out of [a, b]) {
    const r = cli(['export', S3, '--out', out]);
    assert.equal(r.status, 0, r.stderr);
  }
  const first = snapshot(a);
  const second = snapshot(b);
  assert.deepEqual([...first.keys()].sort(), [...second.keys()].sort());
  assert.ok(first.size > 0);
  for (const [name, bytes] of first) assert.ok(bytes.equals(second.get(name)), `${name} differs between runs`);
});

test('export of a broken folder writes nothing and exits 1 with every error', () => {
  const out = scratch('export-broken');
  const r = cli(['export', ISLANDS_DOCS, '--out', out]);
  assert.equal(r.status, 1);
  assert.equal(snapshot(out).size, 0);
  assert.match(r.stderr, /test\/fixtures\/islands\/docs\/yaml-invalid\.md:6: /);
  assert.match(r.stderr, /test\/fixtures\/islands\/docs\/no-table\.md:3: /);
  assert.doesNotMatch(r.stderr, /throws\.md/, 'a module that throws at load is a page error, not a render error (R1.3)');
});

test('export of a folder with no .md files exits 1', () => {
  const empty = scratch('empty');
  const r = cli(['export', empty, '--out', scratch('empty-out')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^margent: no \.md files under /);
});

// ---- check: render errors (A6), no Chrome needed

test('check of a clean folder without islands prints ok and launches nothing', () => {
  const r = cli(['check', LINKED], { env: { MARGENT_CHROME: '/nonexistent/chrome' } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'ok 4 docs, 0 islands\n');
});

const A6 = [
  ['yaml-invalid.md', 6, 'invalid YAML in island "steps": Flow sequence in block collection must be sufficiently indented and end with a ]'],
  ['missing-module.md', 3, `island "absent" has no module islands/absent.island.js between ${ISLANDS_DOCS} and the docs root`],
  ['no-table.md', 3, 'island "shape" marker must sit directly above a table (no blank line)'],
  ['throws.md', 3, `module ${ISLANDS_DOCS}/islands/throws.island.js throws at load: boom at load`],
];

for (const [name, line, message] of A6) {
  test(`check: ${name} fails at ${line} with its message, exit 1`, () => {
    const r = cli(['check', `${ISLANDS_DOCS}/${name}`]);
    assert.equal(r.status, 1, r.stdout);
    assert.equal(r.stdout, `${ISLANDS_DOCS}/${name}:${line}: ${message}\n`, `stderr: ${r.stderr}`);
  });
}

test('check: a module that throws while rendering fails at the island line, from the headless run', full, () => {
  const r = cli(['check', 'test/fixtures/cli/render-throw/doc.md']);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout, 'test/fixtures/cli/render-throw/doc.md:3: island boom: boom at render\n');
});

test('check: an exception after load fails its island at the island line (R5.3)', full, () => {
  const r = cli(['check', 'test/fixtures/cli/page-error/doc.md']);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout, 'test/fixtures/cli/page-error/doc.md:3: island late: late boom\n');
});

test('check: an island whose guest never reports fails with did not report, after its bound (R5.1, Chrome)', full, async () => {
  const cache = scratch('no-report');
  const doc = 'test/fixtures/cli/overflow-scroll/doc.md';
  const opened = cli(['open', doc], { cache });
  assert.equal(opened.status, 0, opened.stderr);
  const html = opened.stdout.trim();
  // The guest runtime's text no longer matches its script-src hash in the page policy, so the frame never runs it.
  const text = readFileSync(html, 'utf8');
  const start = text.indexOf('id="margent-guest-runtime"');
  const marker = "'use strict';";
  const at = text.indexOf(marker, start);
  assert.ok(start >= 0 && at > start, 'the page carries the guest runtime');
  writeFileSync(html, text.slice(0, at) + "'use strict'; " + text.slice(at + marker.length));
  const { runPages } = await import('../.build/cli/pages-run.js');
  const problems = await runPages([{ file: doc, html, islands: [{ name: 'scroller', line: 5 }], quotes: [] }]);
  assert.deepEqual(problems, [`${doc}:5: island scroller: did not report within 10s`]);
});

test('check: content that spills out of the box at 390px fails at the island line, with the width (contract rule 4)', () => {
  const r = cli(['check', 'test/fixtures/cli/overflow-390/doc.md']);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout.split('\n').length, 2, 'one overflow line, and nothing at 1280px');
  assert.match(
    r.stdout,
    /^test\/fixtures\/cli\/overflow-390\/doc\.md:5: island wide: content overflows its box at 390px \(div "cell 0[^"]*", \d+px past the right edge\)\n$/
  );
});

test('check: an island whose wide content scrolls inside an overflow-x: auto wrapper passes', full, () => {
  const r = cli(['check', 'test/fixtures/cli/overflow-scroll/doc.md']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, 'ok 1 docs, 1 islands\n');
});

test('check: a pattern mismatch (A5) fails at the cell line with the warning message', full, () => {
  const r = cli(['check', `${ISLANDS_DOCS}/mismatch.md`]);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(
    r.stdout,
    `${ISLANDS_DOCS}/mismatch.md:9: island tally: cell "Maybe proceed" does not match verdict pattern\n`
  );
});

test('check: a folder keeps going past a broken doc and reports each one', full, () => {
  const r = cli(['check', ISLANDS_DOCS]);
  assert.equal(r.status, 1);
  const lines = r.stdout.trim().split('\n');
  assert.ok(lines.length > 5, r.stdout);
  for (const line of lines) assert.match(line, /^test\/fixtures\/islands\/docs\/[^:]+:\d+: /);
});

// ---- check: quoted block comments (decision 0039)

const QUOTES = 'test/fixtures/cli/quotes';

test('check: an unquoted block comment on a doc with no islands launches no Chrome and passes', () => {
  const r = cli(['check', `${QUOTES}/unquoted.md`], { env: { MARGENT_CHROME: '/nonexistent/chrome' } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'ok 1 docs, 0 islands\n');
});

test('check: a quoted phrase that is not in the table it is anchored to fails at the comment line (Chrome)', () => {
  const r = cli(['check', `${QUOTES}/plain-table.md`]);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(
    r.stdout,
    `${QUOTES}/plain-table.md:10: comment c1: quoted phrase "Review" is not in the table it is anchored to\n`
  );
});

test('check: a quote with markdown in it fails, since the page shows the words without the backticks', full, () => {
  const r = cli(['check', `${QUOTES}/markdown-quote.md`]);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(
    r.stdout,
    `${QUOTES}/markdown-quote.md:7: comment c1: quoted phrase "\`beta gate\`" is not in the table it is anchored to\n`
  );
});

test('check: a quote of a phrase whose page text holds a double quote passes (the quote stores it as a single quote)', full, () => {
  const r = cli(['check', `${QUOTES}/quote-apostrophe.md`]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, 'ok 1 docs, 0 islands\n');
});

test('check: a matching quote in a doc with no islands passes without margentIslands', full, () => {
  const r = cli(['check', `${QUOTES}/no-islands.md`]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, 'ok 1 docs, 0 islands\n');
});

test('check: a quote of text inside an island passes (Chrome)', full, () => {
  const r = cli(['check', `${QUOTES}/island-quote.md`]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, 'ok 1 docs, 1 islands\n');
});

test('check: a quote of text the island does not show fails, anchored to the island (Chrome)', full, () => {
  const r = cli(['check', `${QUOTES}/island-quote-missing.md`]);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(
    r.stdout,
    `${QUOTES}/island-quote-missing.md:8: comment c1: quoted phrase "Stage beta ships" is not in the island it is anchored to\n`
  );
});

// ---- check: a quote that names its match, or does not say which one (decision 0041)

test('check: a quote with no #n that occurs twice in its table fails, and says how to name the match', () => {
  const r = cli(['check', `${QUOTES}/ambiguous.md`]);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(
    r.stdout,
    `${QUOTES}/ambiguous.md:8: comment c1: quoted phrase "beta gate" occurs 2 times in the table it is anchored to; add #n after the quote to say which\n`
  );
});

test('check: a quote with #3 where its table has two matches fails, and says how many there are', full, () => {
  const r = cli(['check', `${QUOTES}/out-of-range.md`]);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(
    r.stdout,
    `${QUOTES}/out-of-range.md:8: comment c1: quoted phrase "beta gate" #3: the table it is anchored to has only 2\n`
  );
});

test('check: a quote with #2 whose phrase is not in its table fails, with the number in the message', full, () => {
  const r = cli(['check', `${QUOTES}/not-found-occurrence.md`]);
  assert.equal(r.status, 1, r.stderr);
  assert.equal(
    r.stdout,
    `${QUOTES}/not-found-occurrence.md:8: comment c1: quoted phrase "Review" #2 is not in the table it is anchored to\n`
  );
});

test('check: a quote with #2 for a repeated phrase, and #1 for a phrase that occurs once, passes', full, () => {
  const r = cli(['check', `${QUOTES}/occurrence-in-range.md`]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, 'ok 1 docs, 0 islands\n');
});

// ---- check: links (decision 0036), no Chrome needed

const LINKS = 'test/fixtures/cli/links';

test('check: a link to a missing heading or a missing file fails at its line, exit 1', () => {
  const r = cli(['check', 'test/fixtures/accept/links/broken.md'], { env: { MARGENT_CHROME: '/nonexistent/chrome' } });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(
    r.stdout,
    'test/fixtures/accept/links/broken.md:3: link to #missing: no such heading on this page\n' +
      'test/fixtures/accept/links/broken.md:5: link to guide.md#nope: no heading #nope in test/fixtures/accept/links/guide.md\n',
  );
});

test('check: links that resolve, following linked docs, pass with exit 0', () => {
  const r = cli(['check', 'test/fixtures/accept/links/index.md'], { env: { MARGENT_CHROME: '/nonexistent/chrome' } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'ok 3 docs, 0 islands\n');
});

test('check: a link to a missing file fails with no such file', () => {
  const r = cli(['check', `${LINKS}/missing.md`], { env: { MARGENT_CHROME: '/nonexistent/chrome' } });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout, `${LINKS}/missing.md:7: link to gone.md: no such file\n`);
});

test('check: a link to an existing folder passes', () => {
  const r = cli(['check', `${LINKS}/folder.md`], { env: { MARGENT_CHROME: '/nonexistent/chrome' } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'ok 1 docs, 0 islands\n');
});

test('check: a link to a raw HTML id or <a name> on the target page passes', () => {
  const r = cli(['check', `${LINKS}/raw-anchor.md`], { env: { MARGENT_CHROME: '/nonexistent/chrome' } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'ok 2 docs, 0 islands\n');
});

test('check: a percent-encoded anchor to a non-ASCII heading passes', () => {
  const r = cli(['check', `${LINKS}/non-ascii.md`], { env: { MARGENT_CHROME: '/nonexistent/chrome' } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'ok 1 docs, 0 islands\n');
});

test('check: a link in a figure caption is checked too', () => {
  const r = cli(['check', `${LINKS}/caption.md`], { env: { MARGENT_CHROME: '/nonexistent/chrome' } });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(r.stdout, `${LINKS}/caption.md:9: link to gone.md: no such file\n`);
});

test('check: a sub-folder whose link leaves it is checked against the target, and a missing heading there fails', () => {
  const r = cli(['check', `${LINKS}/out`], { env: { MARGENT_CHROME: '/nonexistent/chrome' } });
  assert.equal(r.status, 1, r.stderr);
  assert.equal(
    r.stdout,
    `${LINKS}/out/inner.md:9: link to ../other.md#nope: no heading #nope in ${LINKS}/other.md\n`,
  );
});

// ---- check: islands, headless (needs Chrome)

test('check: a clean folder with islands prints ok and exits 0 (Chrome)', () => {
  const r = cli(['check', S3]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'ok 4 docs, 3 islands\n');
  assert.equal(r.stderr, '');
});

test('check: a missing Chrome with islands present fails loudly and names MARGENT_CHROME (Chrome not launched)', () => {
  const r = cli(['check', S3], { env: { MARGENT_CHROME: '/nonexistent/chrome' } });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^margent: MARGENT_CHROME is set to "\/nonexistent\/chrome", which is not an executable file/);
});

test('check: a temp dir for pages is removed afterwards', full, () => {
  const tmp = scratch('tmp-check');
  const r = cli(['check', S3], { env: { TMPDIR: tmp } });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readdirSync(tmp), [], 'nothing left in TMPDIR');
});
