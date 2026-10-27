// Acceptance checks that run on fixtures: A1 text coverage, A4 re-render on a verdict edit, A8/A9 layout and
// theme shots, A10 link walk. The scripts in scripts/accept/ take paths, so the same ones can run on any docs tree.
// Run after `npm run build`. Browser checks need an installed Chrome.
//
// SHOTS_DIR=/some/dir npm test also writes the A8/A9 screenshots there, for review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { islandFrameByName, openPage, withBrowser } from './helpers/browser.mjs';
import { full } from './helpers/tier.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'dist', 'cli.js');
const SCRIPTS = join(REPO, 'scripts', 'accept');
const FIXTURES = join(REPO, 'test', 'fixtures');
const BLOCKS_MD = join(FIXTURES, 'blocks', 'all-blocks.md');
const S3 = join(FIXTURES, 'islands', 's3');
const LINKED = join(FIXTURES, 'cli', 'linked');
const ACCEPT_LINKS = join(FIXTURES, 'accept', 'links');

const workdir = mkdtempSync(join(tmpdir(), 'margent-accept-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

let counter = 0;
function scratch(label) {
  const dir = join(workdir, `${label}-${counter++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Exports one .md (with its linked closure) through the CLI, and returns the printed page path for that .md.
function exportOne(md, out) {
  const cache = scratch('cache');
  const r = spawnSync(process.execPath, [CLI, 'export', md, '--out', out], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, BROWSER: 'true', XDG_CACHE_HOME: cache },
  });
  assert.equal(r.status, 0, `export ${md}: ${r.stderr}`);
  return r.stdout.trim().split('\n')[0];
}

// Runs one of scripts/accept/ with the repo as the working directory.
function accept(script, args) {
  return spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd: REPO, encoding: 'utf8' });
}

// ---- A1: every word of the markdown is in the page

test('A1 text-coverage passes on all-blocks.md and on S3 C.md', full, () => {
  for (const md of [BLOCKS_MD, join(S3, 'C.md')]) {
    const html = exportOne(md, scratch('a1-export'));
    const r = accept('text-coverage.mjs', [html, md]);
    assert.equal(r.status, 0, `${md}:\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /^ok \d+ words\n$/);
  }
});

test('A1 text-coverage fails and names the word when the md has text the page does not', full, () => {
  const html = exportOne(BLOCKS_MD, scratch('a1-stale'));
  const edited = join(scratch('a1-edited'), 'all-blocks.md');
  // The page was exported from the original; the md has a paragraph added after the export.
  writeFileSync(edited, `${readFileSync(BLOCKS_MD, 'utf8')}\nAdded after the export: quasarzebra.\n`);
  const line = readFileSync(edited, 'utf8').split('\n').findIndex((l) => l.includes('quasarzebra')) + 1;
  const r = accept('text-coverage.mjs', [html, edited]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`missing: "quasarzebra" first at .*all-blocks\\.md:${line}\n`));
  assert.match(r.stdout, /fail: \d+ missing words, 0 errors\n$/);
});

// ---- A4: an md verdict edit shows on the next export, with no LLM involved

async function tallyOf(html) {
  return withBrowser(async (browser) => {
    const { page, errors, close } = await openPage(browser, html);
    try {
      assert.deepEqual(errors, [], `${html} has errors`);
      // The island's shadow content lives inside its srcdoc frame (M5 R3).
      const frame = await islandFrameByName(page, 'spike-verdicts');
      return await frame.evaluate(() => {
        const root = [...document.body.children].find((e) => e.shadowRoot).shadowRoot;
        const count = (kind) => Number(root.querySelector(`button.t[data-kind="${kind}"] .big`).textContent);
        return {
          proceed: count('proceed'),
          adjust: count('adjust'),
          text: root.textContent.replace(/\s+/g, ' ').trim(),
        };
      });
    } finally {
      await close();
    }
  });
}

test('A4 a verdict cell edited in the md is re-rendered by the next export', full, async () => {
  const folder = join(scratch('a4'), 's3');
  cpSync(S3, folder, { recursive: true });
  const md = join(folder, 'C.md');
  const before = await tallyOf(exportOne(md, scratch('a4-before')));

  const row = '| S3 CI cost | What does a month of CI cost at the release rate? | Proceed |';
  const source = readFileSync(md, 'utf8');
  assert.equal(source.split(row).length - 1, 1, 'the S3 row appears once in the copy');
  writeFileSync(md, source.replace(row, row.replace('| Proceed |', '| Adjust |')));
  const after = await tallyOf(exportOne(md, scratch('a4-after')));

  assert.equal(after.proceed, before.proceed - 1, 'one fewer Proceed');
  assert.equal(after.adjust, before.adjust + 1, 'one more Adjust');
  assert.notEqual(after.text, before.text, 'the island text changed');
});

// ---- A8, A9: layout and theme. SHOTS_DIR keeps the screenshots for review.

test('A8 A9 shots: no horizontal scroll, islands rendered, the toggle restyles page, islands and SVG figures', full, () => {
  const out = process.env.SHOTS_DIR ? resolve(process.env.SHOTS_DIR) : scratch('shots');
  mkdirSync(out, { recursive: true });
  const docs = [BLOCKS_MD, join(S3, 'A.md'), join(S3, 'B.md'), join(S3, 'C.md')];
  for (const md of docs) {
    const html = exportOne(md, scratch('shots-export'));
    const r = accept('shots.mjs', [html, out]);
    assert.equal(r.status, 0, `${md}:\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /ok 6 shots\n$/);
    const name = basename(md, '.md');
    for (const width of [1280, 390]) {
      for (const theme of ['light', 'dark-toggle', 'dark-system']) {
        assert.ok(readdirSync(out).includes(`${name}-${width}-${theme}.png`), `${name}-${width}-${theme}.png written`);
      }
    }
  }
});

// ---- A10: link walk

test('A10 link-walk passes on all-blocks: .md links, anchors in linked docs and the cross-dir link', full, () => {
  const html = exportOne(BLOCKS_MD, scratch('a10-blocks'));
  const r = accept('link-walk.mjs', [html]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^ok \d+ links\n$/);
});

test('A10 link-walk passes on the linked fixture index', full, () => {
  const html = exportOne(join(LINKED, 'index.md'), scratch('a10-linked'));
  const r = accept('link-walk.mjs', [html]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^ok 2 links\n$/);
});

test('A10 link-walk passes on the accept fixture: .md links, anchors in linked docs, TOC and a duplicate heading slug', full, () => {
  const html = exportOne(join(ACCEPT_LINKS, 'index.md'), scratch('a10-accept'));
  const r = accept('link-walk.mjs', [html]);
  // 1 guide link, 2 deep links, 2 in-page links (intro, example-2) and 3 TOC links.
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^ok 8 links\n$/);
});

test('A10 link-walk fails on broken anchors, in the page and in a linked doc, and names each', full, () => {
  const html = exportOne(join(ACCEPT_LINKS, 'broken.md'), scratch('a10-broken'));
  const r = accept('link-walk.mjs', [html]);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /broken: .*"nowhere" -> #missing: no element with id "missing" on this page\n/);
  assert.match(r.stdout, /broken: .*"guide" -> guide\.html#nope: no element with id "nope" in .*guide\.html\n/);
  assert.match(r.stdout, /fail: 2 broken\n$/);
});
