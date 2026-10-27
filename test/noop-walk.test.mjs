// The no-op walk (spec R10 and acceptance A2). Every gated block of every .md under the frozen margent docs/ is
// focused with a real click and then blurred with a click outside, with no typing. Nothing may be saved: no /_save
// request, and the file's bytes and mtime are unchanged. Runs on a temp copy of the frozen margent docs/, which is never
// written. Run `npm run build` first.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { serveCopy, openServedPage } from './helpers/serve-page.mjs';
import { recordSaves, sleep } from './edit-corpus/steps.mjs';
import { MARGENT_CORPUS } from './helpers/corpus.mjs';
import { full } from './helpers/tier.mjs';

// Every .md under a folder, relative to it, sorted.
function markdownFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full, base));
    else if (entry.name.endsWith('.md')) out.push(relative(base, full));
  }
  return out;
}

const DOCS = markdownFiles(MARGENT_CORPUS);
const totals = { docs: 0, blocks: 0 };
// Blocks whose text is all inside links. A click there follows a link, so the walk skips them, and lists each one.
const skipped = [];
let browser;
before(async () => {
  browser = await chromium.launch({ channel: 'chrome' });
});
after(() => {
  console.log(`A2 no-op walk: ${totals.docs} docs, ${totals.blocks} gated blocks focused and blurred, no save`);
  console.log(`A2 no-op walk skipped ${skipped.length} blocks whose text is all inside links: ${skipped.join(', ')}`);
  return browser.close();
});

// The top-level gated blocks of the page, in document order, as their ranges.
function gatedRanges(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-gate="pass"]')]
      .filter((el) => !el.parentElement.closest('[data-src]'))
      .map((el) => el.getAttribute('data-src'))
  );
}

// True when the block has text outside links, the same text textPoint can pick (two or more characters, not in an <a>).
function hasTextOutsideLinks(page, range) {
  return page.evaluate((range) => {
    const block = document.querySelector(`[data-src="${range}"]`);
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.data.trim().length >= 2 && !n.parentElement.closest('a[href]')) return true;
    }
    return false;
  }, range);
}

// A point inside the middle of a non-link text node of the block, scrolled into view. Throws if the block has no such text.
function textPoint(page, range) {
  return page.evaluate((range) => {
    const block = document.querySelector(`[data-src="${range}"]`);
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.data.trim().length < 2 || n.parentElement.closest('a[href]')) continue;
      const i = Math.floor(n.data.length / 2);
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + 1);
      if (r.getClientRects().length === 0) continue;
      n.parentElement.scrollIntoView({ block: 'center' });
      const b = r.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: (b.top + b.bottom) / 2 };
    }
    throw new Error(`block ${range} has no text outside links to focus`);
  }, range);
}

for (const doc of DOCS) {
  test(`A2 no-op walk: ${doc}`, full, async (t) => {
    // Closed by t.after, so a page that fails to open cannot leak the server: its watcher would keep this file's process
    // alive after the tests end, and the whole run would hang with no failure shown.
    const served = await serveCopy(MARGENT_CORPUS);
    t.after(() => served.close());
    const file = join(served.root, doc);
    const before = { bytes: served.read(doc), mtimeMs: statSync(file).mtimeMs };
    const { page, errors, close } = await openServedPage(browser, served, doc);
    const saves = recordSaves(page);
    try {
      const ranges = await gatedRanges(page);
      const focused = [];
      for (const range of ranges) {
        if (!(await hasTextOutsideLinks(page, range))) {
          skipped.push(`${doc}:${range}`);
          t.diagnostic(`skipped ${doc}:${range}: all of its text is inside links`);
          continue;
        }
        focused.push(range);
        const p = await textPoint(page, range);
        await page.mouse.click(p.x, p.y);
        await page.mouse.click(990, 880);
      }
      await sleep(300);
      assert.deepEqual(errors, [], 'the page reported errors');
      assert.deepEqual(saves.requests, [], 'a /_save request was sent by focusing and blurring blocks');
      assert.equal(served.read(doc), before.bytes, 'the file changed');
      assert.equal(statSync(file).mtimeMs, before.mtimeMs, 'the file mtime changed');
      totals.docs += 1;
      totals.blocks += focused.length;
    } finally {
      await close();
    }
  });
}
