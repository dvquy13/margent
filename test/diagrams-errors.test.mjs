// Diagram errors (M8 spec D2.1 to D2.3, A3). A mermaid error or a relative link in a diagram is a render error at its doc
// line, so check, open and export all fail with that line and exit 1. Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'dist', 'cli.js');
const ERRORS = 'test/fixtures/diagrams/errors';
const LINKS = 'test/fixtures/diagrams/links/doc.md';

// Runs the CLI from the repo root, so messages carry repo-relative paths. BROWSER=true stands in for the default browser.
function cli(args, cache) {
  const env = { ...process.env, BROWSER: 'true', XDG_CACHE_HOME: cache };
  delete env.MARGENT_CHROME;
  return spawnSync(process.execPath, [CLI, ...args], { cwd: REPO, encoding: 'utf8', env });
}

// A scratch directory removed when the test ends, so the cache and export folders never leak.
function tempDir(t, label) {
  const dir = mkdtempSync(join(tmpdir(), `margent-diagrams-${label}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Each fixture's fence opens on doc line 3. A pele error on content line N is reported at doc line 3 + N (D2.1), and an error
// with no line of its own is reported at the fence line. syntax.md puts its error on content line 2, so it reports line 5.
const ERROR_LINES = [
  ['syntax.md', 5, 'mermaid syntax: Lexical error on line 2. Unrecognized text.'],
  ['semantic.md', 3, 'mermaid semantic: "Cache" has invalid value: -1. Negative values are not allowed in pie charts. All slice values must be >= 0.'],
  ['limit.md', 3, 'mermaid limit: A block diagram can hold at most 100000 space blocks.'],
  ['unsupported.md', 3, 'mermaid unsupported-diagram: No diagram type detected for the given text.'],
  ['relative-link.md', 6, 'diagram links must be absolute URLs: link other.md from the caption instead'],
];

for (const [name, line, message] of ERROR_LINES) {
  const expected = `${ERRORS}/${name}:${line}: ${message}\n`;

  test(`D2.1 and D2.2: check prints ${name} at line ${line} with its message, exit 1`, (t) => {
    const r = cli(['check', `${ERRORS}/${name}`], tempDir(t, 'check'));
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.stdout, expected);
  });

  test(`A3: open fails on ${name} with the same line, exit 1, and writes nothing`, (t) => {
    const cache = tempDir(t, 'open');
    const r = cli(['open', `${ERRORS}/${name}`], cache);
    assert.equal(r.status, 1, r.stdout);
    assert.equal(r.stderr, expected);
    assert.equal(r.stdout, '');
    assert.deepEqual(readdirSync(cache), []);
  });

  test(`A3: export fails on ${name} with the same line, exit 1, and writes nothing`, (t) => {
    const out = tempDir(t, 'export');
    const r = cli(['export', `${ERRORS}/${name}`, '--out', out], tempDir(t, 'cache'));
    assert.equal(r.status, 1, r.stdout);
    assert.equal(r.stderr, expected);
    assert.equal(r.stdout, '');
    assert.deepEqual(readdirSync(out), []);
  });
}

test('D2.2: a diagram with absolute https and mailto links renders, check passes, and both hrefs reach the page', (t) => {
  const check = cli(['check', LINKS], tempDir(t, 'check'));
  assert.equal(check.status, 0, check.stderr);
  assert.equal(check.stdout, 'ok 1 docs, 0 islands\n');

  const cache = tempDir(t, 'open');
  const opened = cli(['open', LINKS], cache);
  assert.equal(opened.status, 0, opened.stderr);
  const html = readFileSync(opened.stdout.trim(), 'utf8');
  assert.match(html, /href="https:\/\/example\.com\/docs"/);
  assert.match(html, /href="mailto:team@example\.com"/);
});
