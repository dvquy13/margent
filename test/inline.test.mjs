// In-place editing (spec R4) in installed Chrome, driven by real mouse and keyboard input on a served page. Every
// save is checked on disk, byte for byte. The side panel and reload are covered by panel.test.mjs and reload.test.mjs,
// which record their own calls.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveCopy } from './helpers/serve-page.mjs';
import { full } from './helpers/tier.mjs';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'inline', 'docs');
const ORIGINAL = readFileSync(join(FIXTURE, 'inline.md'), 'utf8');
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

let browser;
before(async () => {
  browser = await chromium.launch({ channel: 'chrome' });
});
after(async () => {
  await browser.close();
});

// The fixture with some lines replaced. Each old text must occur exactly once, so a wrong replacement fails here.
function withLines(replacements) {
  let out = ORIGINAL;
  for (const [from, to] of replacements) {
    assert.equal(out.split(from).length - 1, 1, `${JSON.stringify(from)} occurs once in the fixture`);
    out = out.replace(from, to);
  }
  return out;
}

// Opens a served page like openServedPage (serve-page.mjs), with the live-update stream blocked before the page loads. A
// save's own `changed` event would reload the page, and the reload would drop the recorders below.
async function openInlinePage(served, mdPath) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // The blocked stream is reported by the reload client as retrying: that is the point of blocking it, not an error.
    if (m.type() === 'error' && !/Failed to load resource|live reload stream .* is retrying/.test(m.text())) {
      errors.push(`console: ${m.text().split('\n')[0]}`);
    }
  });
  await page.route('**/_events*', (r) => r.abort());
  await page.goto(served.server.url);
  await page.goto(served.url(mdPath.replace(/\.md$/, '.html')));
  await page.waitForFunction(() => window.margent !== undefined);
  return { page, errors, close: () => context.close() };
}

// Opens a served copy of the fixture with the recorders in place, runs fn, and closes everything.
// `saves` lists every request to /_save (routed or not). `errors` collects page and console errors.
async function withPage(fn) {
  const served = await serveCopy(FIXTURE);
  // The server closes even when the page fails to open: a leaked one keeps its watcher alive, and with it this file's
  // process, so the whole run would hang with no failure shown.
  try {
    const { page, errors, close } = await openInlinePage(served, 'inline.md');
    try {
      const saves = [];
      page.on('request', (r) => {
        if (new URL(r.url()).pathname === '/_save') saves.push(r.postData());
      });
      await page.evaluate(() => {
        const a = window.margent;
        window.__calls = [];
        a.reload = () => window.__calls.push(['reload']);
        a.idle = () => window.__calls.push(['idle']);
        a.stale = (range, text) => window.__calls.push(['stale', range, text]);
        a.openPanel = (range, opts) => window.__calls.push(['openPanel', range, opts]);
      });
      await fn({ page, served, errors, saves });
    } finally {
      await close();
    }
  } finally {
    await served.close();
  }
}

const calls = (page) => page.evaluate(() => window.__calls);
const block = (page, src) => page.locator(`[data-src="${src}"]`);
const settle = (page) => page.waitForTimeout(250);

async function waitForCall(page, name) {
  await page.waitForFunction((n) => window.__calls.some((c) => c[0] === n), name, { timeout: 5000 });
}

async function until(check) {
  for (let i = 0; i < 250; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('condition not reached');
}

// A press just inside the left edge of the character at `offset` after the first occurrence of `text` in block `src`.
// A press there puts the caret before that character.
async function caretPoint(page, src, text, offset = 0) {
  return page.evaluate(([src, text, offset]) => {
    const root = document.querySelector(`[data-src="${src}"]`);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.data.indexOf(text);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(n, i + offset);
      r.setEnd(n, i + offset + 1);
      const b = r.getBoundingClientRect();
      return { x: b.left + 1, y: (b.top + b.bottom) / 2 };
    }
    throw new Error(`${JSON.stringify(text)} is not in block ${src}`);
  }, [src, text, offset]);
}

async function pressAt(page, src, text, offset = 0) {
  const p = await caretPoint(page, src, text, offset);
  await page.mouse.click(p.x, p.y);
}

// A press on blank page space, outside every block: the focused block loses focus and saves.
async function blur(page) {
  await page.mouse.click(990, 880);
}

// ---- affordance and edit mode -------------------------------------------------------------------

test('R4.1: a gated block shows a text cursor and an outline on hover', full, () =>
  withPage(async ({ page }) => {
    const b = block(page, '5-6');
    const outline = () => b.evaluate((el) => ({ style: getComputedStyle(el).outlineStyle, cursor: getComputedStyle(el).cursor }));
    await page.mouse.move(990, 880);
    assert.deepEqual(await outline(), { style: 'none', cursor: 'text' });
    const box = await b.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 5);
    assert.deepEqual(await outline(), { style: 'solid', cursor: 'text' });
    assert.equal(await page.evaluate(() => document.querySelectorAll('[data-editing]').length), 0);
  }));

test('R4.2: a plain press makes only that block editable', full, () =>
  withPage(async ({ page }) => {
    await pressAt(page, '3-3', 'The first');
    const editable = () => page.evaluate(() => [...document.querySelectorAll('[contenteditable]')].map((e) => e.dataset.src));
    assert.deepEqual(await editable(), ['3-3']);
    await pressAt(page, '5-6', 'A soft');
    assert.deepEqual(await editable(), ['5-6']);
    await waitForCall(page, 'idle');
  }));

test('R4.3: typing mid-paragraph, then blur, saves the file', () =>
  withPage(async ({ page, served }) => {
    await pressAt(page, '5-6', 'paragraph');
    await page.keyboard.type('NEW ');
    await blur(page);
    await waitForCall(page, 'reload');
    assert.equal(
      served.read('inline.md'),
      withLines([['A soft wrapped paragraph that goes on', 'A soft wrapped NEW paragraph that goes on']])
    );
  }));

test('R4.3: Cmd+S saves while the block keeps the caret', full, () =>
  withPage(async ({ page, served }) => {
    await pressAt(page, '17-17', 'The last');
    await page.keyboard.press('End');
    await page.keyboard.type(' Done.');
    await page.keyboard.press(`${MOD}+s`);
    await waitForCall(page, 'reload');
    assert.equal(served.read('inline.md'), withLines([['The last paragraph.', 'The last paragraph. Done.']]));
  }));

test('R4.3: a block that is unchanged on blur sends nothing and leaves the file alone', full, () =>
  withPage(async ({ page, served, saves }) => {
    const before = statSync(join(served.root, 'inline.md')).mtimeMs;
    await pressAt(page, '3-3', 'The first');
    await blur(page);
    await waitForCall(page, 'idle');
    await settle(page);
    assert.deepEqual(saves, []);
    assert.deepEqual(await calls(page), [['idle']]);
    assert.equal(served.read('inline.md'), ORIGINAL);
    assert.equal(statSync(join(served.root, 'inline.md')).mtimeMs, before);
  }));

test('R4.3: a block edited and then edited back to its source sends nothing', full, () =>
  withPage(async ({ page, served, saves }) => {
    await pressAt(page, '3-3', 'The first');
    await page.keyboard.type('X');
    await page.keyboard.press('Backspace');
    await blur(page);
    await waitForCall(page, 'idle');
    await settle(page);
    assert.deepEqual(saves, []);
    assert.equal(served.read('inline.md'), ORIGINAL);
  }));

test('R4.4: Esc restores the block\'s DOM, leaves edit mode and sends nothing', () =>
  withPage(async ({ page, served, saves, errors }) => {
    const original = await block(page, '3-3').innerHTML();
    await pressAt(page, '3-3', 'The first');
    await page.keyboard.type('junk ');
    await page.keyboard.press('Escape');
    await waitForCall(page, 'idle');
    assert.equal(await block(page, '3-3').innerHTML(), original);
    assert.equal(await block(page, '3-3').getAttribute('contenteditable'), null);
    assert.equal(await block(page, '3-3').getAttribute('data-editing'), null);
    await blur(page);
    await settle(page);
    assert.deepEqual(saves, []);
    assert.equal(served.read('inline.md'), ORIGINAL);
    assert.deepEqual(errors, []);
  }));

// ---- Enter, paste, undo, formatting -------------------------------------------------------------

test('R4.5: Enter in a paragraph writes a blank line, so the save is two blocks', () =>
  withPage(async ({ page, served }) => {
    await pressAt(page, '3-3', 'The first');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Next paragraph.');
    await blur(page);
    await waitForCall(page, 'reload');
    assert.equal(
      served.read('inline.md'),
      withLines([
        [
          'The first paragraph has **bold text**, a [link to other](other.md), and some `code`.',
          'The first paragraph has **bold text**, a [link to other](other.md), and some `code`.\n\nNext paragraph.',
        ],
      ])
    );
  }));

test('R4.5: Enter in a list item makes a new item', full, () =>
  withPage(async ({ page, served }) => {
    await pressAt(page, '10-12', 'second item');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('third item');
    await blur(page);
    await waitForCall(page, 'reload');
    assert.equal(served.read('inline.md'), withLines([['- second item\n', '- second item\n- third item\n']]));
  }));

test('R4.5: Enter in a heading saves', full, () =>
  withPage(async ({ page, served }) => {
    await pressAt(page, '8-8', 'A heading');
    await page.keyboard.press('End');
    await page.keyboard.type(' more');
    await page.keyboard.press('Enter');
    await waitForCall(page, 'reload');
    assert.equal(served.read('inline.md'), withLines([['## A heading\n', '## A heading more\n']]));
    assert.equal(await block(page, '8-8').getAttribute('contenteditable'), null);
  }));

test('R4.6: paste takes only the plain text of the clipboard', () =>
  withPage(async ({ page, served }) => {
    await pressAt(page, '17-17', 'The last');
    await page.keyboard.press('End');
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/html', '<b>bold</b> <i>styled</i> <span style="color:red">red</span>');
      dt.setData('text/plain', ' and more');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    assert.equal(await block(page, '17-17').evaluate((el) => el.querySelectorAll('b, i, span').length), 0);
    await blur(page);
    await waitForCall(page, 'reload');
    assert.equal(served.read('inline.md'), withLines([['The last paragraph.', 'The last paragraph. and more']]));
  }));

// Chrome writes the second of two typed spaces as U+00A0. The save maps it to a space, and turndown collapses the run
// (a run of spaces is one space in the rendered page too), so the file has one plain space.
test('R4.6: a typed run of spaces is saved as plain spaces', full, () =>
  withPage(async ({ page, served }) => {
    await pressAt(page, '17-17', 'The last');
    await page.keyboard.press('End');
    await page.keyboard.type(' one  two');
    await blur(page);
    await waitForCall(page, 'reload');
    assert.equal(served.read('inline.md'), withLines([['The last paragraph.', 'The last paragraph. one two']]));
    assert.ok(!served.read('inline.md').includes('\u00a0'));
  }));

test('R4.6: Cmd+Z before blur restores the text and sends nothing', full, () =>
  withPage(async ({ page, served, saves }) => {
    await pressAt(page, '17-17', 'The last');
    await page.keyboard.press('End');
    await page.keyboard.type(' XYZ');
    await page.keyboard.press(`${MOD}+z`);
    await blur(page);
    await waitForCall(page, 'idle');
    await settle(page);
    assert.deepEqual(saves, []);
    assert.equal(served.read('inline.md'), ORIGINAL);
  }));

test('R4.7: Cmd+B wraps the selection in ** and the save writes it', full, () =>
  withPage(async ({ page, served }) => {
    await pressAt(page, '17-17', 'last');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press(`${MOD}+b`);
    await blur(page);
    await waitForCall(page, 'reload');
    assert.equal(served.read('inline.md'), withLines([['The last paragraph.', 'The **last** paragraph.']]));
  }));

// Selects the text of block `src` from the first to the last character of `text`, with a real drag.
async function dragSelect(page, src, text) {
  const r = await page.evaluate(([src, text]) => {
    const root = document.querySelector(`[data-src="${src}"]`);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.data.indexOf(text);
      if (i < 0) continue;
      const box = (a, b) => {
        const rg = document.createRange();
        rg.setStart(n, a);
        rg.setEnd(n, b);
        const b2 = rg.getBoundingClientRect();
        return { left: b2.left, right: b2.right, y: (b2.top + b2.bottom) / 2 };
      };
      const first = box(i, i + 1);
      const last = box(i + text.length - 1, i + text.length);
      return { fx: first.left + 1, fy: first.y, lx: last.right - 1, ly: last.y };
    }
    throw new Error(`${JSON.stringify(text)} is not in block ${src}`);
  }, [src, text]);
  await page.mouse.move(r.fx, r.fy);
  await page.mouse.down();
  await page.mouse.move(r.lx, r.ly, { steps: 5 });
  await page.mouse.up();
}

test('R4.7: typing over a link\'s whole text keeps the typed text inside the link', full, () =>
  withPage(async ({ page, served }) => {
    await pressAt(page, '3-3', 'The first');
    await dragSelect(page, '3-3', 'link to other');
    await page.keyboard.type('decision 4');
    assert.equal(
      await block(page, '3-3').evaluate((el) => el.querySelector('a').textContent.replace(/\u200b/g, '')),
      'decision 4'
    );
    await blur(page);
    await waitForCall(page, 'reload');
    assert.equal(
      served.read('inline.md'),
      withLines([['[link to other](other.md)', '[decision 4](other.md)']])
    );
  }));

test('R4.7: typing at the end of an untouched link still goes outside the link', full, () =>
  withPage(async ({ page, served }) => {
    await pressAt(page, '3-3', 'The first');
    const end = await page.evaluate(() => {
      const a = document.querySelector('[data-src="3-3"] a');
      const t = a.firstChild;
      const rg = document.createRange();
      rg.setStart(t, t.length - 1);
      rg.setEnd(t, t.length);
      const b = rg.getBoundingClientRect();
      return { x: b.right - 1, y: (b.top + b.bottom) / 2 };
    });
    await page.mouse.click(end.x, end.y);
    await page.keyboard.type('!');
    await blur(page);
    await waitForCall(page, 'reload');
    assert.equal(served.read('inline.md'), withLines([['[link to other](other.md)', '[link to other](other.md)!']]));
  }));

test('R4.7: editing a link\'s text keeps its .md target', full, () =>
  withPage(async ({ page, served }) => {
    await pressAt(page, '3-3', 'The first');
    await pressAt(page, '3-3', 'other');
    await page.keyboard.type('very ');
    await blur(page);
    await waitForCall(page, 'reload');
    assert.equal(
      served.read('inline.md'),
      withLines([['[link to other](other.md)', '[link to very other](other.md)']])
    );
  }));

test('R4.1: a click on a link in a block not being edited follows the link', full, () =>
  withPage(async ({ page, served, saves }) => {
    await pressAt(page, '3-3', 'link to other');
    await page.waitForURL(/\/other\.html$/, { timeout: 5000 });
    assert.deepEqual(saves, []);
    assert.equal(served.read('inline.md'), ORIGINAL);
  }));

// ---- one block at a time, and the save outcomes -------------------------------------------------

test('R4.2: clicking another block saves the first one', () =>
  withPage(async ({ page, served }) => {
    await pressAt(page, '3-3', 'paragraph has');
    await page.keyboard.type('big ');
    await pressAt(page, '5-6', 'A soft');
    // The first block is still saving (not editable), so only the second one is editable at this point.
    assert.deepEqual(
      await page.evaluate(() => [...document.querySelectorAll('[contenteditable="true"]')].map((e) => e.dataset.src)),
      ['5-6']
    );
    await waitForCall(page, 'reload');
    assert.equal(served.read('inline.md'), withLines([['The first paragraph has', 'The first big paragraph has']]));
  }));

test('R4.3: a 409 calls stale with the block\'s text, and the file keeps the other writer\'s version', () =>
  withPage(async ({ page, served }) => {
    await pressAt(page, '5-6', 'source');
    await page.keyboard.type('more ');
    const external = ORIGINAL.replace('The last paragraph.', 'Changed outside.');
    writeFileSync(join(served.root, 'inline.md'), external);
    await blur(page);
    await waitForCall(page, 'stale');
    assert.deepEqual(await calls(page), [
      ['stale', '5-6', 'A soft wrapped paragraph that goes on\nacross a second more source line.'],
    ]);
    assert.equal(served.read('inline.md'), external);
  }));

test('R4.3: a 422 calls openPanel with the text and errors, and restores the block', full, () =>
  withPage(async ({ page, served }) => {
    const original = await block(page, '5-6').innerHTML();
    await page.route('**/_save', (route) =>
      route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ errors: ['inline.md:5: refused by test'] }) })
    );
    await pressAt(page, '5-6', 'source');
    await page.keyboard.type('more ');
    await blur(page);
    await waitForCall(page, 'openPanel');
    assert.deepEqual(await calls(page), [
      [
        'openPanel',
        '5-6',
        {
          text: 'A soft wrapped paragraph that goes on\nacross a second more source line.',
          errors: ['inline.md:5: refused by test'],
        },
      ],
    ]);
    assert.equal(await block(page, '5-6').innerHTML(), original);
    assert.equal(await block(page, '5-6').getAttribute('contenteditable'), null);
    assert.equal(served.read('inline.md'), ORIGINAL);
  }));

test('R4.3: another status keeps the block in edit mode with its text and a visible error', full, () =>
  withPage(async ({ page, served, errors }) => {
    await page.route('**/_save', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) })
    );
    await pressAt(page, '5-6', 'source');
    await page.keyboard.type('more ');
    await blur(page);
    await page.waitForSelector('.edit-error');
    assert.equal(
      await page.locator('.edit-error').textContent(),
      'save failed (HTTP 500): {"error":"boom"}'
    );
    assert.equal(await block(page, '5-6').getAttribute('contenteditable'), 'true');
    assert.equal(await block(page, '5-6').getAttribute('data-editing'), '');
    assert.ok(await block(page, '5-6').textContent().then((t) => t.includes('more source')));
    assert.ok(errors.some((e) => e.includes('save failed (HTTP 500)')), `console error recorded: ${errors}`);
    assert.equal(served.read('inline.md'), ORIGINAL);
    assert.deepEqual(await calls(page), []);
  }));

test('R4.3: while a save is in flight the block is not editable and a second save is not sent', full, () =>
  withPage(async ({ page, served, saves }) => {
    const held = [];
    await page.route('**/_save', (route) => held.push(route));
    await pressAt(page, '5-6', 'source');
    await page.keyboard.type('more ');
    await blur(page);
    await until(() => held.length === 1);
    assert.equal(await block(page, '5-6').getAttribute('contenteditable'), 'false');
    await pressAt(page, '5-6', 'source');
    await page.keyboard.type('again ');
    await blur(page);
    await settle(page);
    assert.equal(saves.length, 1);
    await held[0].fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hash: 'next' }) });
    await waitForCall(page, 'reload');
    assert.equal(saves.length, 1);
    assert.equal(served.read('inline.md'), ORIGINAL);
  }));

test('R4.3: Cmd+S never reaches the browser, outside an edit or while a save is in flight', full, () =>
  withPage(async ({ page, served, saves }) => {
    // Chrome's own Cmd+S opens Save Page, which cancels the live reload stream. A window listener runs after the
    // runtime's document listener, so it sees whether the runtime took the key.
    await page.evaluate(() => {
      window.__saveKeys = [];
      window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 's') window.__saveKeys.push(e.defaultPrevented);
      });
    });
    const saveKeys = () => page.evaluate(() => window.__saveKeys);
    await page.keyboard.press(`${MOD}+s`);
    assert.deepEqual(await saveKeys(), [true]);
    assert.equal(saves.length, 0);

    const held = [];
    await page.route('**/_save', (route) => held.push(route));
    await pressAt(page, '5-6', 'source');
    await page.keyboard.type('more ');
    await page.keyboard.press(`${MOD}+s`);
    await until(() => held.length === 1);
    await page.keyboard.press(`${MOD}+s`);
    assert.deepEqual(await saveKeys(), [true, true, true]);
    await held[0].fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hash: 'next' }) });
    await waitForCall(page, 'reload');
    assert.equal(saves.length, 1);
    assert.equal(served.read('inline.md'), ORIGINAL);
  }));

test('R4.3: dirty() reports unsaved text while a block is edited', full, () =>
  withPage(async ({ page }) => {
    const dirty = () => page.evaluate(() => window.margent.dirty());
    assert.equal(await dirty(), false);
    await pressAt(page, '3-3', 'The first');
    assert.equal(await dirty(), false);
    await page.keyboard.type('X');
    assert.equal(await dirty(), true);
    await blur(page);
    await waitForCall(page, 'reload');
    assert.equal(await dirty(), false);
  }));
