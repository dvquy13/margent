// Mermaid diagrams under `export` (M8 spec D6.2). `export --md` keeps a ```mermaid fence byte for byte, with and without
// --clean; --clean strips a comment after the fence as it strips any block comment. `export` (HTML) renders the diagram the
// way `open` does. Run `npm run build` first (or `npm test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'dist', 'cli.js');
const FLOW = 'test/fixtures/diagrams/serve/docs/flow.md';
// Shared with comments-render: a block comment after a mermaid fence.
const QUOTED = 'test/fixtures/comments/quoted-diagram.md';

// Runs the CLI from the repo root, so messages carry repo-relative paths. BROWSER=true stands in for the default browser.
function cli(args, cache) {
  const env = { ...process.env, BROWSER: 'true', XDG_CACHE_HOME: cache };
  delete env.MARGENT_CHROME;
  return spawnSync(process.execPath, [CLI, ...args], { cwd: REPO, encoding: 'utf8', env });
}

// A scratch directory removed when the test ends.
function tempDir(t, label) {
  const dir = mkdtempSync(join(tmpdir(), `margent-export-${label}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// The file export wrote, read from its stdout: export names each output path, relative to a base it picks.
function written(r) {
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

// The mermaid fence of a source: from its opening ```mermaid line to the closing fence.
function fenceOf(source) {
  const m = /```mermaid\n[\s\S]*?\n```/.exec(source);
  assert.ok(m, 'test setup: the source has a mermaid fence');
  return m[0];
}

test('D6.2: export --md keeps the mermaid fence byte for byte, and the file is the source', (t) => {
  const r = cli(['export', FLOW, '--out', tempDir(t, 'md'), '--md'], tempDir(t, 'cache'));
  assert.equal(readFileSync(written(r), 'utf8'), readFileSync(join(REPO, FLOW), 'utf8'));
});

test('D6.2: export --md --clean keeps the mermaid fence byte for byte and strips the comment after it', (t) => {
  const r = cli(['export', QUOTED, '--out', tempDir(t, 'md-clean'), '--md', '--clean'], tempDir(t, 'cache'));
  const source = readFileSync(join(REPO, QUOTED), 'utf8');
  const cleaned = readFileSync(written(r), 'utf8');
  assert.equal(fenceOf(cleaned), fenceOf(source), 'the fence is the same bytes');
  // The block comment's line goes with the blank line before it (splice's delete rule); every other byte stays.
  assert.equal(cleaned, source.replace(/\n\{>>\[c1\][^\n]*<<\}\n$/, ''));
  assert.doesNotMatch(cleaned, /\{>>|<<\}/);
});

test('D6.2: export --md --clean on a diagram with no comment keeps the fence byte for byte', (t) => {
  const r = cli(['export', FLOW, '--out', tempDir(t, 'md-clean-flow'), '--md', '--clean'], tempDir(t, 'cache'));
  assert.equal(readFileSync(written(r), 'utf8'), readFileSync(join(REPO, FLOW), 'utf8'));
});

test('D6.2: export (HTML) renders the diagram as open does: the page holds figure.diagram with both layouts', (t) => {
  const r = cli(['export', FLOW, '--out', tempDir(t, 'page')], tempDir(t, 'cache'));
  const html = readFileSync(written(r), 'utf8');
  assert.match(html, /<figure class="diagram" data-src="10-13">/);
  assert.match(html, /<div class="diagram-wide"[^>]*><svg/);
  assert.match(html, /<div class="diagram-narrow"[^>]*><svg/);
  assert.match(html, /Render the page/, 'the node label is in the SVG');
});

test('D6.2: export (HTML) with --clean renders the diagram, and the comment after it is gone from the page', (t) => {
  const r = cli(['export', QUOTED, '--out', tempDir(t, 'page-clean'), '--clean'], tempDir(t, 'cache'));
  const html = readFileSync(written(r), 'utf8');
  assert.match(html, /<figure class="diagram" data-src="9-12">/);
  assert.doesNotMatch(html, /does this include check/);
});
