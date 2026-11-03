// Comments on diagrams (M8 spec D5.2 to D5.4, acceptance A6; decision 0041). The selection case is the corpus's
// (test/edit-corpus/cases/diagrams/). Here: `check` counts a phrase once, names a phrase that is not in the diagram, and
// the card's mark and alignment sit on the phrase in the shown layout. Run after `npm run build`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { full } from './helpers/tier.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const CLI = join(repo, 'dist', 'cli.js');
const FIX = join(here, 'fixtures', 'comments');

const { renderDoc } = await import(join(repo, '.build', 'render', 'page.js'));

const workdir = mkdtempSync(join(tmpdir(), 'margent-diagram-comments-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

// `margent check` from the repo root. Its quote pass runs in Chrome, so a page with a quote needs the browser.
function check(path) {
  return spawnSync(process.execPath, [CLI, 'check', path], { cwd: repo, encoding: 'utf8', env: { ...process.env, BROWSER: 'true' } });
}

test('D5.3: a phrase in a diagram counts once, though both layouts hold it: check passes (count once)', () => {
  const r = check('test/fixtures/comments/quoted-diagram.md');
  assert.equal(r.stdout, 'ok 1 docs, 0 islands\n', r.stderr);
  assert.equal(r.status, 0);
});

test('D5.2: a quoted phrase that is not in the diagram fails check, naming the diagram', () => {
  const r = check('test/fixtures/comments/quoted-diagram-missing.md');
  assert.equal(
    r.stdout,
    'test/fixtures/comments/quoted-diagram-missing.md:14: comment c1: quoted phrase "Ship the page" is not in the diagram it is anchored to\n',
    r.stderr,
  );
  assert.equal(r.status, 1);
});

// The rendered page of a fixture, opened from the work folder as a file.
function pageOf(name) {
  const source = readFileSync(join(FIX, name), 'utf8');
  const html = renderDoc({ file: join(FIX, name), source, root: FIX, outFile: join(workdir, `${name}.html`) }).html;
  writeFileSync(join(workdir, `${name}.html`), html);
  return pathToFileURL(join(workdir, `${name}.html`)).href;
}

let browser;
before(async () => {
  browser = await chromium.launch({ channel: 'chrome' });
});
after(async () => {
  await browser.close();
});

// A page at the given width, with Google Fonts blocked so every run lays out the same text.
async function open(width, url) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  return { page, errors, close: () => context.close() };
}

test(
  'D5.4: hovering the card of a phrase in a diagram marks it in the shown layout, and the card lines up with it',
  full,
  async () => {
    const { page, errors, close } = await open(1280, pageOf('quoted-diagram.md'));
    try {
      await page.locator('.c-card[data-c="c1"]').hover();
      const marked = await page.evaluate(() => {
        const ranges = [...(CSS.highlights.get('margent-quote') ?? [])];
        return ranges.map((r) => {
          const layout = r.startContainer.parentElement.closest('.diagram-wide, .diagram-narrow');
          const box = r.getBoundingClientRect();
          return {
            text: r.toString(),
            layout: layout ? layout.className : null,
            shown: layout ? getComputedStyle(layout).display !== 'none' : false,
            top: box.top,
          };
        });
      });
      const where = `the highlight holds ${JSON.stringify(marked)}`;
      assert.equal(marked.length, 1, where);
      assert.equal(marked[0].text, 'Render the page', where);
      assert.equal(marked[0].layout, 'diagram-wide', where);
      assert.equal(marked[0].shown, true, where);

      const card = await page.locator('.c-card[data-c="c1"]').boundingBox();
      assert.ok(Math.abs(card.y - marked[0].top) <= 4, `the card top ${card.y} is within 4px of the phrase ${marked[0].top}`);
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  }
);
