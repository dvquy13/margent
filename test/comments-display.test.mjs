// Comment display (M3 spec R4, acceptance A6; plan T14, decision 0023). Fixtures are rendered to pages and opened in
// Chrome. At 1100px and wider the threads are cards in a right rail, each lined up with its anchor and pushed down only
// when the card above reaches it. Below 1100px the rail is a drawer. Run after `npm run build`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { full } from './helpers/tier.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const FIX = join(here, 'fixtures', 'comments');
const SHOTS = join(repo, 'docs', 'results', 'm3');
// Screenshots for the results folder are rewritten only on request, so a test run leaves the tree clean.
const UPDATE_SHOTS = process.env.UPDATE_SHOTS === '1';

const { renderDoc } = await import(join(repo, '.build', 'render', 'page.js'));

const workdir = mkdtempSync(join(tmpdir(), 'margent-display-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

// The page for `source`, written to the work folder and returned as a file URL.
function pageFile(name, source) {
  const html = renderDoc({ file: join(FIX, name), source, root: FIX, outFile: join(workdir, `${name}.html`) }).html;
  const path = join(workdir, `${name}.html`);
  writeFileSync(path, html);
  return { html, url: pathToFileURL(path).href };
}

const FIXTURES = ['all-kinds.md', 'block-prose.md', 'quoted.md', 'quoted-repeat.md', 'quoted-table.md', 'tall-table.md', 'links-in-highlight.md'];
const urls = Object.fromEntries(FIXTURES.map((name) => [name, pageFile(name, readFileSync(join(FIX, name), 'utf8')).url]));

let browser;
before(async () => {
  browser = await chromium.launch({ channel: 'chrome' });
});
after(async () => {
  await browser.close();
});

// A context at the given size and colour scheme. Google Fonts are blocked, so every run lays out the same text.
async function open(width, colorScheme, url = urls['all-kinds.md'], { javaScriptEnabled = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, javaScriptEnabled });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  return { page, errors, close: () => context.close() };
}

// Every card with its anchor's top, the content column's edges, the horizontal overflow and what is visible in its block.
async function layout(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    const cards = [...document.querySelectorAll('.c-card')].map((card) => {
      const id = card.dataset.c;
      const kind = card.dataset.kind;
      let anchor;
      if (kind === 'inline') anchor = document.querySelector(`mark.c-hl[data-c="${id}"]`);
      else if (kind === 'point') anchor = document.querySelector(`span.c-thread[data-c="${id}"]`);
      else {
        const range = document.querySelector(`p.c-line span.c-thread[data-c="${id}"]`).closest('p.c-line').dataset.anchor;
        anchor = document.querySelector(`[data-src="${range}"]`);
      }
      const r = card.getBoundingClientRect();
      return { id, kind, top: r.top, bottom: r.bottom, left: r.left, right: r.right, anchorTop: anchor.getBoundingClientRect().top };
    });
    const column = [...main.children].filter((e) => !e.matches('.c-rail')).map((e) => e.getBoundingClientRect());
    const visible = (el) => getComputedStyle(el).display !== 'none';
    return {
      cards,
      contentLeft: Math.min(...column.map((r) => r.left)),
      contentRight: Math.max(...column.map((r) => r.right)),
      scroll: document.documentElement.scrollWidth,
      inner: window.innerWidth,
      // A hidden thread is zero-size (decision 0023), so it is shown only when its box has some size.
      threadsInBlocks: [...document.querySelectorAll('.c-thread')].filter((t) => {
        const r = t.getBoundingClientRect();
        return !t.classList.contains('c-point') && (r.width > 0 || r.height > 0);
      }).length,
      linesShown: [...document.querySelectorAll('p.c-line')].filter(visible).length,
    };
  });
}

// The wide layout's rules (A6): each card's top is its anchor's top, or exactly 8px under the card above when it is
// pushed; no two cards overlap; the rail is beside the column; nothing overflows.
function assertWideLayout(state, label) {
  assert.ok(state.cards.length > 0, `${label}: there are cards`);
  assert.ok(state.scroll <= state.inner, `${label}: no horizontal overflow (${state.scroll} > ${state.inner})`);
  assert.equal(state.threadsInBlocks, 0, `${label}: in-block threads are hidden`);
  assert.equal(state.linesShown, 0, `${label}: block comment lines are hidden`);
  let previous = null;
  for (const card of state.cards) {
    const pushed = previous !== null && previous.bottom + 8 > card.anchorTop;
    if (pushed) {
      assert.ok(Math.abs(card.top - (previous.bottom + 8)) < 0.6, `${label}: ${card.id} is 8px under the card above`);
    } else {
      assert.ok(Math.abs(card.top - card.anchorTop) <= 4, `${label}: ${card.id} top ${card.top} is within 4px of its anchor ${card.anchorTop}`);
    }
    assert.ok(card.left >= state.contentRight, `${label}: ${card.id} is beside the content column, not over it`);
    previous = card;
  }
  for (let i = 0; i < state.cards.length; i++) {
    for (let j = i + 1; j < state.cards.length; j++) {
      const a = state.cards[i];
      const b = state.cards[j];
      assert.ok(a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5, `${label}: ${a.id} and ${b.id} do not overlap`);
    }
  }
}

const wideCombos = [
  [1280, 'light'],
  [1280, 'dark'],
  [1512, 'light'],
  [1512, 'dark'],
];

mkdirSync(SHOTS, { recursive: true });
for (const [width, scheme] of wideCombos) {
  for (const name of FIXTURES) {
    test(`A6: ${name} at ${width}px ${scheme}: cards line up with their anchors and do not overlap`, full, async () => {
      const { page, errors, close } = await open(width, scheme, urls[name]);
      try {
        assertWideLayout(await layout(page), `${name} ${width}px ${scheme}`);
        assert.deepEqual(errors, [], 'no page errors');
        if (name === 'all-kinds.md') {
          if (UPDATE_SHOTS) await page.screenshot({ path: join(SHOTS, `display-${width}-${scheme}.png`), fullPage: true });
        }
      } finally {
        await close();
      }
    });
  }
}

test('A6: the content column keeps 900px at 1280 and 1512, and narrows at 1100', full, async () => {
  const widths = {};
  for (const width of [1100, 1280, 1512]) {
    const { page, close } = await open(width, 'light');
    try {
      const { contentLeft, contentRight } = await layout(page);
      widths[width] = Math.round(contentRight - contentLeft);
      const headerLeft = await page.evaluate(() => document.querySelector('header.top .wordmark').getBoundingClientRect().left);
      assert.ok(Math.abs(headerLeft - contentLeft) < 0.6, `at ${width}px the wordmark is on the content column's left edge`);
    } finally {
      await close();
    }
  }
  assert.equal(widths[1280], 900);
  assert.equal(widths[1512], 900);
  assert.equal(widths[1100], 756);
});

for (const scheme of ['light', 'dark']) {
  test(`A6: 390px ${scheme}: no rail column, the count button, no overflow, screenshot`, full, async () => {
    const { page, errors, close } = await open(390, scheme);
    try {
      const state = await layout(page);
      assert.ok(state.scroll <= state.inner, `closed: no horizontal overflow (${state.scroll} > ${state.inner})`);
      assert.equal(state.threadsInBlocks, 0, 'in-block threads are hidden');
      const label = await page.locator('.c-toggle').textContent();
      assert.equal(label, `Comments · ${state.cards.length}`, 'the button shows the count');
      assert.equal(await page.locator('.c-rail').evaluate((e) => getComputedStyle(e).visibility), 'hidden', 'the drawer is closed');
      if (UPDATE_SHOTS) await page.screenshot({ path: join(SHOTS, `display-390-${scheme}.png`), fullPage: true });
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });
}

test('A6: 390px: the drawer opens from the button and closes on Escape, on its close button and on a click outside', async () => {
  const { page, errors, close } = await open(390, 'light');
  try {
    const drawer = page.locator('.c-rail');
    const toggle = page.locator('.c-toggle');
    // The state is the class, read at once. Visibility changes at the end of its 120ms transition, so it is checked
    // separately, after the drawer has settled.
    const visible = () => drawer.evaluate((e) => e.classList.contains('is-open'));

    await toggle.click();
    assert.equal(await visible(), true, 'the button opens the drawer');
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    const open1 = await layout(page);
    assert.ok(open1.scroll <= open1.inner, `open: no horizontal overflow (${open1.scroll} > ${open1.inner})`);
    // The drawer slides in over 120ms; the shot waits for the slide to finish.
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
    if (UPDATE_SHOTS) await page.screenshot({ path: join(SHOTS, 'display-390-drawer.png') });

    await page.keyboard.press('Escape');
    assert.equal(await visible(), false, 'Escape closes the drawer');

    await toggle.click();
    await page.locator('.c-rail-head .c-close').click();
    assert.equal(await visible(), false, 'the close button closes the drawer');

    await toggle.click();
    await page.mouse.click(20, 600);
    assert.equal(await visible(), false, 'a click outside closes the drawer');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('A6: 390px: a card click closes the drawer, scrolls the anchor into view and marks the pair', full, async () => {
  const { page, errors, close } = await open(390, 'light');
  try {
    await page.locator('.c-toggle').click();
    await page.locator('.c-card[data-c="c5"]').click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.c-rail')).visibility === 'hidden');
    assert.equal(await page.locator('.c-rail').evaluate((e) => e.classList.contains('is-open')), false, 'the drawer closes');
    assert.equal(await page.locator('mark.c-hl[data-c="c5"]').evaluate((e) => e.classList.contains('is-linked')), true, 'the highlight is marked');
    const inView = await page.locator('mark.c-hl[data-c="c5"]').evaluate((e) => {
      const r = e.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    });
    assert.equal(inView, true, 'the anchor is scrolled into view');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

// The pair is the anchor (highlight, point marker or block) and its card. Each one carries is-linked while either is
// hovered or focused.
function linked(page, selector) {
  return page.locator(selector).evaluate((e) => e.classList.contains('is-linked'));
}

test('R4.3: hovering a highlight links its card, and hovering a card links its highlight', async () => {
  const { page, errors, close } = await open(1280, 'light');
  try {
    await page.locator('mark.c-hl[data-c="c1"]').hover();
    assert.equal(await linked(page, '.c-card[data-c="c1"]'), true, 'card linked by hovering its highlight');
    assert.equal(await linked(page, '.c-card[data-c="c3"]'), false, 'other cards stay unlinked');

    await page.mouse.move(5, 5);
    assert.equal(await linked(page, '.c-card[data-c="c1"]'), false, 'link clears when the pointer leaves');

    await page.locator('.c-card[data-c="c1"]').hover();
    assert.equal(await linked(page, 'mark.c-hl[data-c="c1"]'), true, 'highlight linked by hovering its card');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('R4.3: hovering a point marker links its card, and hovering a block card links its block', full, async () => {
  const { page, errors, close } = await open(1280, 'light');
  try {
    await page.locator('span.c-thread.c-point[data-c="c3"]').hover();
    assert.equal(await linked(page, '.c-card[data-c="c3"]'), true, 'card linked by hovering the point marker');
    await page.mouse.move(5, 5);

    await page.locator('.c-card[data-c="c6"]').hover();
    assert.equal(await linked(page, '[data-src="17-19"]'), true, 'the block is linked by hovering its block card');
    await page.mouse.move(5, 5);
    assert.equal(await linked(page, '[data-src="17-19"]'), false, 'the block link clears');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('R4.3: keyboard focus links the pair both ways, and leaving clears it', full, async () => {
  const { page, errors, close } = await open(1280, 'dark');
  try {
    // Tab until the c5 highlight has focus. Its card links with it.
    let focusedMark = false;
    for (let i = 0; i < 60 && !focusedMark; i++) {
      await page.keyboard.press('Tab');
      focusedMark = await page.evaluate(() => document.activeElement.matches('mark.c-hl[data-c="c5"]'));
    }
    assert.ok(focusedMark, 'the c5 highlight is reachable with Tab');
    assert.equal(await linked(page, '.c-card[data-c="c5"]'), true, 'focused highlight links its card');

    await page.locator('.c-card[data-c="c5"]').focus();
    assert.equal(await linked(page, 'mark.c-hl[data-c="c5"]'), true, 'focused card links its highlight');

    await page.locator('.c-card[data-c="c4"]').focus();
    assert.equal(await linked(page, 'mark.c-hl[data-c="c5"]'), false, 'moving focus away clears the link');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('R4.3: hovering a quoted block card marks its phrase in the block with the Custom Highlight', full, async () => {
  const { page, errors, close } = await open(1280, 'light', urls['tall-table.md']);
  try {
    await page.locator('.c-card[data-c="c2"]').hover();
    assert.equal(await page.evaluate(() => CSS.highlights.has('margent-quote')), true, 'the phrase is highlighted');
    const text = await page.evaluate(() => [...CSS.highlights.get('margent-quote')].map((r) => r.toString()));
    assert.deepEqual(text, ['Row 7']);
    await page.mouse.move(5, 5);
    assert.equal(await page.evaluate(() => CSS.highlights.has('margent-quote')), false, 'the highlight clears');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('R4.3: a quoted phrase that is not in its block marks only the block', full, async () => {
  const { page, errors, close } = await open(1280, 'light', urls['quoted.md']);
  try {
    await page.locator('.c-card[data-c="c1"]').hover();
    const blocks = await page.evaluate(() => document.querySelectorAll('[data-src].is-linked').length);
    assert.equal(blocks, 1, 'the quoted block is linked');
    assert.equal(await page.evaluate(() => CSS.highlights.has('margent-quote')), false, 'no phrase is marked');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('0039: a phrase that occurs twice in its block is marked at both places, always and on hover', full, async () => {
  const { page, errors, close } = await open(1280, 'light', urls['quoted-repeat.md']);
  try {
    const always = await page.evaluate(() => [...(CSS.highlights.get('margent-quotes') ?? [])].map((r) => r.toString()));
    assert.deepEqual(always, ['beta gate', 'beta gate'], 'both matches carry the always-on tint');
    await page.locator('.c-card[data-c="c1"]').hover();
    const hovered = await page.evaluate(() => [...CSS.highlights.get('margent-quote')].map((r) => r.toString()));
    assert.deepEqual(hovered, ['beta gate', 'beta gate'], 'hovering the card marks both matches');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('0039: a block comment with no quote tints its paragraph\'s text, and a table\'s comment keeps a light bar', async () => {
  const { page, errors, close } = await open(1280, 'light', urls['block-prose.md']);
  try {
    const always = await page.evaluate(() => [...(CSS.highlights.get('margent-quotes') ?? [])].map((r) => r.toString()));
    assert.deepEqual(always, ['The sync job copies the vault every night.'], 'the paragraph is tinted without hover');
    await page.locator('.c-card[data-c="c1"]').hover();
    const hovered = await page.evaluate(() => [...CSS.highlights.get('margent-quote')].map((r) => r.toString()));
    assert.deepEqual(hovered, ['The sync job copies the vault every night.'], 'hovering the card tints it more strongly');
    const table = page.locator('[data-src].c-commented');
    assert.equal(await table.count(), 1, 'only the table takes the bar');
    assert.match(await table.evaluate((n) => n.querySelector('table') ? 'table' : n.localName), /table/);
    assert.match(await table.evaluate((n) => getComputedStyle(n).boxShadow), /, /, 'the bar shows without hover');
    assert.equal(await page.locator('.c-quote-missing').count(), 0, 'an unquoted comment is never missing');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('0039: a quote the page cannot find is muted and labelled on its card, and quoteReport says so', full, async () => {
  const { page, errors, close } = await open(1280, 'light', urls['quoted.md']);
  try {
    const card = page.locator('.c-card[data-c="c1"]');
    assert.equal(await card.locator('q.c-quote.c-quote-missing').count(), 1, 'the quote is marked missing');
    assert.equal(await card.locator('q.c-quote + .c-quote-note').textContent(), 'not found in the page');
    assert.equal(await page.locator('.c-card[data-c="c2"] .c-quote-missing').count(), 0, 'a highlight is never marked missing');
    // c2 is an inline thread: its highlight is in the source, so only the block comment's quote is reported.
    const report = await page.evaluate(() => window.margentComments.quoteReport());
    assert.deepEqual(report, [{ id: 'c1', found: false }]);
    assert.equal(await card.locator('.c-quote-note').count(), 1, 'the label is not added twice');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

// The UI stores a quote with ' for each " (quoteOf), so a phrase taken from text that has " in it must still be found.
test('0023: a phrase taken from a table cell with " in it is marked, though its quote stores \' for "', async () => {
  const { page, errors, close } = await open(1280, 'light', urls['quoted-table.md']);
  try {
    const always = await page.evaluate(() => [...(CSS.highlights.get('margent-quotes') ?? [])].map((r) => r.toString()));
    assert.deepEqual(always, ['"alpha beta", "gamma", delta'], 'the quoted phrase is marked with its page quotes');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('0023: a phrase drawn by an island with " in it is marked in its frame, though its quote stores \' for "', full, async () => {
  const file = join(FIX, 'ui-island', 'docs', 'island.md');
  const root = join(FIX, 'ui-island', 'docs');
  // The island line gets a " (a plain YAML scalar may hold one); the quote is what a selection there stores.
  const source = readFileSync(file, 'utf8')
    .replace('  - Blog and Docs stay in', '  - Blog "and" Docs stay in')
    .replace('A paragraph after the island.', `{>>[c1] Quy: "Blog 'and' Docs" → quoted from the island<<}\n\nA paragraph after the island.`);
  const path = join(workdir, 'island-quotes.html');
  writeFileSync(path, renderDoc({ file, source, root, outFile: path }).html);
  const { page, errors, close } = await open(1280, 'light', pathToFileURL(path).href);
  try {
    await page.waitForFunction(() => document.querySelector('agent-island')?.getAttribute('data-state') === 'rendered');
    await page.locator('.c-card[data-c="c1"]').hover();
    const frame = islandFrame(page);
    await frame.waitForFunction(() => CSS.highlights.has('margent-quote'));
    const marked = await frame.evaluate(() => [...CSS.highlights.get('margent-quote')].map((r) => r.toString()));
    assert.deepEqual(marked, ['Blog "and" Docs'], 'the phrase is marked with its frame quotes');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('R4: print puts threads back in their blocks, with no rail', full, async () => {
  const { page, close } = await open(1280, 'light');
  try {
    await page.emulateMedia({ media: 'print' });
    const shown = await page.evaluate(() => ({
      rail: getComputedStyle(document.querySelector('.c-rail')).display,
      threads: [...document.querySelectorAll('.c-thread')].map((t) => getComputedStyle(t).display),
      floats: [...document.querySelectorAll('.c-thread')].map((t) => getComputedStyle(t).float),
    }));
    assert.equal(shown.rail, 'none');
    assert.ok(shown.threads.length > 0);
    assert.ok(shown.threads.every((d) => d !== 'none'), 'every thread is shown in its block');
    assert.ok(shown.floats.every((f) => f === 'none'), 'no margin floats in print');
  } finally {
    await close();
  }
});

test('R4: without JavaScript the threads stay in their blocks, with no rail', full, async () => {
  const { page, close } = await open(1280, 'light', urls['all-kinds.md'], { javaScriptEnabled: false });
  try {
    const displays = await page.evaluate(() => [...document.querySelectorAll('.c-thread')].map((t) => getComputedStyle(t).display));
    assert.ok(displays.length > 0);
    assert.ok(displays.every((d) => d !== 'none'));
    assert.equal(await page.locator('.c-rail').count(), 0);
  } finally {
    await close();
  }
});

test('R2.5: a page without comments has no comment CSS, script or markup', full, async () => {
  const plain = pageFile('plain.md', '---\ntitle: Plain\n---\n\n# Plain\n\nNo notes here.\n');
  assert.equal(plain.html.includes('is-linked'), false);
  assert.equal(plain.html.includes('c-hl'), false);
  assert.equal(plain.html.includes('c-thread'), false);
  assert.equal(plain.html.includes('c-rail'), false);
  assert.equal(plain.html.includes('margentComments'), false);
  // And the page with comments carries both.
  const withComments = readFileSync(join(workdir, 'all-kinds.md.html'), 'utf8');
  assert.equal(withComments.includes('c-rail'), true);
  assert.equal(withComments.includes('c-thread'), true);
});

// The frame of the island in the page: an island draws in its own document, which the page's scripts cannot read.
const islandFrame = (page) => page.frames().find((f) => f !== page.mainFrame());

test('R4.3: a quoted phrase drawn by an island is marked in its frame on hover, through margentIslands.mark (M5 R6.2)', full, async () => {
  const root = join(FIX, 'ui-island', 'docs');
  const file = join(root, 'island.md');
  const source = readFileSync(file, 'utf8').replace(
    'A paragraph after the island.',
    '{>>[c1] Quy: "Blog and Docs stay in" → why only these?<<}\n\nA paragraph after the island.'
  );
  const path = join(workdir, 'island-quoted.html');
  writeFileSync(path, renderDoc({ file, source, root, outFile: path }).html);
  const { page, errors, close } = await open(1280, 'light', pathToFileURL(path).href);
  try {
    await page.waitForFunction(() => document.querySelector('agent-island')?.getAttribute('data-state') === 'rendered');
    const frame = islandFrame(page);
    await page.locator('.c-card[data-c="c1"]').hover();
    await frame.waitForFunction(() => CSS.highlights.has('margent-quote'));
    const marked = await frame.evaluate(() => [...CSS.highlights.get('margent-quote')].map((r) => r.toString()));
    assert.deepEqual(marked, ['Blog and Docs stay in'], 'the phrase is marked inside the frame');
    assert.equal(await page.evaluate(() => CSS.highlights.has('margent-quote')), false, 'the page marks nothing in the island');
    await page.mouse.move(1, 1);
    await frame.waitForFunction(() => !CSS.highlights.has('margent-quote'));
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('0023: every quoted phrase is marked without hover, and a click on one opens its card', full, async () => {
  const { page, errors, close } = await open(1280, 'light', urls['tall-table.md']);
  try {
    const always = await page.evaluate(() => [...(CSS.highlights.get('margent-quotes') ?? [])].map((r) => r.toString()));
    // The inline thread's "marked phrase" is tinted by its own <mark>, so it is not in the quote highlight.
    assert.deepEqual(always, ['Row 7'], 'every quoted phrase is marked before any hover');
    assert.equal(await page.evaluate(() => CSS.highlights.has('margent-quote')), false, 'no card is linked yet');
    const point = await page.evaluate(() => {
      const row7 = [...CSS.highlights.get('margent-quotes')].find((r) => r.toString() === 'Row 7');
      const r = row7.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(point.x, point.y);
    assert.equal(await page.evaluate(() => document.activeElement?.matches('.c-card[data-c="c2"]')), true, 'its card has focus');
    assert.equal(await page.evaluate(() => CSS.highlights.has('margent-quote')), true, 'and is linked');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('0023: a quote that runs across two island lines is marked in the frame on hover, with or without the space between them', full, async () => {
  const root = join(FIX, 'ui-island', 'docs');
  const file = join(root, 'island.md');
  // The frame's text joins the two lines with no space; a drag over them stores one. The guest ignores whitespace.
  for (const quote of ['are out Blog and', 'are outBlog and']) {
    const source = readFileSync(file, 'utf8').replace(
      'A paragraph after the island.',
      `{>>[c1] Quy: "${quote}" → two lines<<}\n\nA paragraph after the island.`
    );
    const path = join(workdir, 'island-two-lines.html');
    writeFileSync(path, renderDoc({ file, source, root, outFile: path }).html);
    const { page, errors, close } = await open(1280, 'light', pathToFileURL(path).href);
    try {
      await page.waitForFunction(() => document.querySelector('agent-island')?.getAttribute('data-state') === 'rendered');
      await page.locator('.c-card[data-c="c1"]').hover();
      const frame = islandFrame(page);
      await frame.waitForFunction(() => CSS.highlights.has('margent-quote'));
      const marked = await frame.evaluate(() => [...CSS.highlights.get('margent-quote')].map((r) => r.toString()));
      assert.deepEqual(marked, ['are outBlog and'], `the range covers both lines for "${quote}"`);
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  }
});

// F2: a link inside a highlight keeps its own colour, so it still stands apart from the tinted text around it. The
// Custom Highlight colours can't be read from getComputedStyle, so the glyphs are read from painted pixels: each box's
// background is its most common colour, and its glyph is the pixel farthest in luminance from that background.
const F2_CASES = [
  { para: 'The plan', link: 'the spec', plain: 'follows' },
  { para: 'see the decision', link: 'the decision', plain: 'see' },
  { para: 'The review found', link: 'sourced claim', plain: 'review found' },
];
const F2_MIN_GAP = 40;

// The rectangle of the first match of `text` under `root`, scrolled into view and inset a pixel so the edges are clear.
async function f2Box(page, para, root, text) {
  return page.locator('p:not(article p):not(.c-line)', { hasText: para }).evaluate((p, { root, text }) => {
    p.scrollIntoView({ block: 'center', behavior: 'instant' });
    const scope = root === 'link' ? p.querySelector('a') : p;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode()); ) {
      const at = node.data.indexOf(text);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      const r = range.getBoundingClientRect();
      return { x: r.x + 1, y: r.y + 1, width: r.width - 2, height: r.height - 2 };
    }
    throw new Error(`F2: "${text}" not found in ${root}`);
  }, { root, text });
}

// The painted glyph colour of a PNG: the background is the most common colour, the glyph the pixel farthest from it in
// luminance (darkest on a light tint, brightest on a dark one). Decoded in the page with an Image and a canvas.
async function f2Glyph(page, png) {
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const counts = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const key = `${d[i]},${d[i + 1]},${d[i + 2]}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const [bgKey] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const [br, bg, bb] = bgKey.split(',').map(Number);
    const bgLum = 0.2126 * br + 0.7152 * bg + 0.0722 * bb;
    let best = -1;
    let glyph = null;
    for (let i = 0; i < d.length; i += 4) {
      const gap = Math.abs(lum(i) - bgLum);
      if (gap > best) {
        best = gap;
        glyph = [d[i], d[i + 1], d[i + 2]];
      }
    }
    return { background: bgKey.split(',').map(Number), glyph };
  }, `data:image/png;base64,${png.toString('base64')}`);
}

test('F2: a link inside a highlight keeps its colour apart from the tinted text, in light and dark', async () => {
  for (const scheme of ['light', 'dark']) {
    const { page, errors, close } = await open(1280, scheme, urls['links-in-highlight.md']);
    try {
      for (const c of F2_CASES) {
        const link = await f2Box(page, c.para, 'link', c.link);
        const plain = await f2Box(page, c.para, 'para', c.plain);
        const linkPng = await page.screenshot({ clip: link });
        const plainPng = await page.screenshot({ clip: plain });
        const linkInk = await f2Glyph(page, linkPng);
        const plainInk = await f2Glyph(page, plainPng);
        const gap = Math.max(...[0, 1, 2].map((k) => Math.abs(linkInk.glyph[k] - plainInk.glyph[k])));
        assert.ok(
          gap >= F2_MIN_GAP,
          `${scheme} "${c.link}": link glyph ${linkInk.glyph} on ${linkInk.background}, plain "${c.plain}" glyph ${plainInk.glyph} on ${plainInk.background}; channel gap ${gap} is below ${F2_MIN_GAP}`
        );
      }
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  }
});
