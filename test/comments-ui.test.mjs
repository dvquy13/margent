// The comment UI in served pages (M3 spec R5, R6, A7, A10; plan T8), in installed Chrome. Every action is a real mouse drag
// or key press. Every result is read from disk and compared with the expected bytes. Run `npm run build` first (or npm test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './helpers/browser.mjs';
import { openServedPage, serveCopy } from './helpers/serve-page.mjs';
import { full } from './helpers/tier.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(REPO, 'test', 'fixtures', 'comments', 'ui', 'docs');
const REFUSAL = join(REPO, 'test', 'fixtures', 'comments', 'ui-refusal', 'docs');
const ORIGINAL = readFileSync(join(FIXTURE, 'ui.md'), 'utf8');
const ISLAND = join(REPO, 'test', 'fixtures', 'comments', 'ui-island', 'docs');
const ISLAND_ORIGINAL = readFileSync(join(ISLAND, 'island.md'), 'utf8');
const REPEAT = join(REPO, 'test', 'fixtures', 'comments', 'ui-repeat', 'docs');
const REPEAT_ORIGINAL = readFileSync(join(REPEAT, 'repeat.md'), 'utf8');
const REPEAT_ISLAND = join(REPO, 'test', 'fixtures', 'comments', 'ui-island-repeat', 'docs');
// The screenshots go to the folder UPDATE_SHOTS names, never into docs/: the test is skipped without one.
const SHOTS = process.env.UPDATE_SHOTS && process.env.UPDATE_SHOTS !== '1' ? process.env.UPDATE_SHOTS : null;
const PLAIN = 'The plain paragraph has one word to mark and a second sentence to leave alone.';

// Serves a copy of a fixture folder (`fixture`, default the UI fixture; `doc` is the page to open) with the other options
// as startServer's, runs fn with the open page, and closes everything. `noAuthor` serves with git reading no user.name: the
// environment is pointed away from every git config while the server starts.
function scenario(options, fn) {
  const { fixture = FIXTURE, doc = 'ui.md', noAuthor, prepare, ...serveOptions } = options;
  return async () => {
    let served;
    if (noAuthor) {
      const home = mkdtempSync(join(tmpdir(), 'margent-home-'));
      const saved = { HOME: process.env.HOME, GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM, USER: process.env.USER, USERNAME: process.env.USERNAME, LOGNAME: process.env.LOGNAME };
      process.env.HOME = home;
      process.env.GIT_CONFIG_GLOBAL = '/dev/null';
      process.env.GIT_CONFIG_NOSYSTEM = '1';
      for (const key of ['USER', 'USERNAME', 'LOGNAME']) delete process.env[key];
      try {
        served = await serveCopy(fixture);
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
        rmSync(home, { recursive: true, force: true });
      }
    } else {
      served = await serveCopy(fixture, serveOptions);
    }
    // prepare rewrites the served doc before the page opens (an edit test needs a note already holding a break).
    if (prepare) writeFileSync(join(served.root, doc), prepare(served.read(doc)));
    // The server closes even when the page fails to open: a leaked one keeps this file's process alive.
    try {
      await withBrowser(async (browser) => {
        const { page, errors, close } = await openServedPage(browser, served, doc);
        try {
          const saves = [];
          page.on('request', (r) => {
            if (new URL(r.url()).pathname === '/_save') saves.push(r.postData());
          });
          await fn({ page, served, saves });
          assert.deepEqual(errors, [], 'the page logs no errors');
        } finally {
          await close();
        }
      });
    } finally {
      await served.close();
    }
  };
}

// The viewport point of a boundary in a unique text of the page, or of an island's frame when the page does not have the
// text: index 0 is before its first character, index text.length after its last. The point is measured only; the
// selection comes from the mouse. An island draws in its own frame (M5 R3), so its text is found there, and its point is
// the frame's box plus the point inside it.
async function pointAt(page, spec) {
  const onPage = await measurePoint(page, spec);
  if (onPage) return onPage;
  for (const handle of await page.locator('agent-island iframe').elementHandles()) {
    const frame = await handle.contentFrame();
    await handle.scrollIntoViewIfNeeded();
    const inner = await measurePoint(frame, spec);
    if (!inner) continue;
    // A press sent right after the scroll can land on the page under the frame's old place: two frames let it settle.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const box = await handle.boundingBox();
    return { x: box.x + inner.x, y: box.y + inner.y };
  }
  throw new Error(`${JSON.stringify(spec.text)} is not in the page or in any island`);
}

// The point in one target's text (the page, or a frame), or null when the target does not have the text. `nth` (1-based,
// in document order) picks one of several occurrences, even two in one text node; without it the text must occur once.
async function measurePoint(target, { text, index, nth }) {
  return target.evaluate(
    ([text, index, nth]) => {
      const hits = [];
      // Rendered text only: not the page's embedded source (a script), not our own controls, and not the rail's cards,
      // which repeat the notes' text (decision 0023).
      // An island draws into an open shadow root, which a walker over the body does not enter. Its light DOM holds the
      // island's data and its source (a pre), which are not what it shows, so they are skipped.
      const scan = (root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) =>
            (n.parentElement.closest('script, style, agent-island, .comment-box, .edit-panel, .c-rail') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
        });
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          for (let at = n.data.indexOf(text); at >= 0; at = n.data.indexOf(text, at + text.length)) hits.push({ node: n, i: at });
        }
        for (const el of root.querySelectorAll('*')) if (el.shadowRoot) scan(el.shadowRoot);
      };
      scan(document.body);
      if (hits.length === 0) return null;
      if (nth === undefined && hits.length !== 1) throw new Error(`${JSON.stringify(text)} occurs in ${hits.length} places, not 1`);
      if (nth !== undefined && hits.length < nth) throw new Error(`${JSON.stringify(text)} occurs in ${hits.length} places, not ${nth}`);
      const { node, i } = hits[(nth ?? 1) - 1];
      const r = document.createRange();
      if (index < text.length) {
        r.setStart(node, i + index);
        r.setEnd(node, i + index + 1);
        const b = r.getBoundingClientRect();
        return { x: b.left + 1, y: (b.top + b.bottom) / 2 };
      }
      r.setStart(node, i + text.length - 1);
      r.setEnd(node, i + text.length);
      const b = r.getBoundingClientRect();
      return { x: b.right - 1, y: (b.top + b.bottom) / 2 };
    },
    [text, index, nth]
  );
}

// A real drag from one boundary to another, by the mouse.
async function drag(page, from, to) {
  const a = await pointAt(page, from);
  const b = await pointAt(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

const selectedText = (page) => page.evaluate(() => window.getSelection().toString());
const highlightSet = (page) => page.evaluate(() => CSS.highlights.has('margent-pending'));
const settle = (page) => page.waitForTimeout(300);

// The quote a new-comment card shows: the phrase it is about.
const quoteText = (page) => page.locator('.comment-box q.c-quote').textContent();

// The Comment control that the selection shows, clicked, and the new-comment card that opens.
async function openNote(page) {
  const tool = page.locator('.comment-tool');
  await tool.waitFor();
  await tool.click();
  await page.locator('.comment-box:not([hidden])').waitFor();
}

// Runs an action that saves, and waits for the save's answer. A 200 or a 409 reloads the page, so the wait is for the
// reloaded page (the marker set before the action is gone). Returns the HTTP status.
async function saveVia(page, action) {
  await page.evaluate(() => {
    window.__marker = 'before-save';
  });
  const response = page.waitForResponse((r) => r.url().endsWith('/_save') && r.request().method() === 'POST');
  await action();
  const status = (await response).status();
  if (status === 200 || status === 409) {
    await page.waitForFunction(() => window.margent !== undefined && window.__marker === undefined, null, { timeout: 5000 });
  }
  return status;
}

// A thread's button, on its card in the rail (decision 0023). The card is hovered first (its actions show on hover, and
// stay clickable at rest). Below 1100px the cards are in the drawer, so the drawer opens first.
async function threadButton(page, id, label) {
  const toggle = page.locator('.c-toggle');
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const card = page.locator(`.c-card[data-c="${id}"]`);
  await card.hover();
  return card.getByRole('button', { name: label, exact: true });
}

// A top-level block's comment control, found by its kind. Hovering the block shows the control.
async function blockControl(page, kind) {
  const control = page.locator(`.comment-control[aria-label^="Comment on ${kind},"]`).first();
  const range = await control.evaluate((el) => el.closest('[data-src]').getAttribute('data-src'));
  await page.locator(`[data-src="${range}"]`).first().hover();
  return control;
}

// ---- R5.1 the Comment control and the note box -------------------------------------------------------------------

test(
  'R5.1: a word dragged, then Comment, a note and Enter, marks the word and adds the note',
  scenario({ author: 'Ada' }, async ({ page, served, saves }) => {
    await drag(page, { text: 'plain', index: 0 }, { text: 'plain', index: 5 });
    assert.equal(await selectedText(page), 'plain');
    await openNote(page);
    await page.keyboard.type('Check the wording.');
    assert.equal(await page.evaluate(() => window.margent.dirty()), true, 'a note with text is unsaved text');
    const status = await saveVia(page, () => page.keyboard.press('Enter'));
    assert.equal(status, 200);
    assert.equal(
      served.read('ui.md'),
      ORIGINAL.replace('The plain paragraph', 'The {==plain==}{>>[c3] Ada: Check the wording.<<} paragraph')
    );
    assert.equal(saves.length, 1, 'one save');
  })
);

test(
  '0037: Shift+Enter starts a new line in a note, Enter saves it as <br>, and the rail card shows the break',
  scenario({ author: 'Ada' }, async ({ page, served, saves }) => {
    await drag(page, { text: 'plain', index: 0 }, { text: 'plain', index: 5 });
    await openNote(page);
    await page.keyboard.type('first');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('second');
    assert.equal(await page.locator('.comment-box .comment-input').inputValue(), 'first\nsecond');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    assert.equal(
      served.read('ui.md'),
      ORIGINAL.replace('The plain paragraph', 'The {==plain==}{>>[c3] Ada: first<br>second<<} paragraph')
    );
    assert.equal(saves.length, 1, 'one save');
    const card = page.locator('.c-card[data-c="c3"] .c-text');
    assert.equal(await card.evaluate((el) => el.innerHTML), 'first<br>second');
  })
);

test(
  'R5.1: Esc cancels the note: the file stays as it was and the preview clears',full,
  scenario({ author: 'Ada' }, async ({ page, served, saves }) => {
    await drag(page, { text: 'plain', index: 0 }, { text: 'plain', index: 5 });
    await openNote(page);
    await page.keyboard.type('Never sent');
    assert.equal(await highlightSet(page), true);
    await page.keyboard.press('Escape');
    await page.locator('.comment-box').waitFor({ state: 'hidden' });
    assert.equal(await highlightSet(page), false);
    await settle(page);
    assert.equal(served.read('ui.md'), ORIGINAL);
    assert.deepEqual(saves, []);
  })
);

test(
  'R5.1: an empty or blank note sends nothing',full, 
  scenario({ author: 'Ada' }, async ({ page, served, saves }) => {
    await drag(page, { text: 'plain', index: 0 }, { text: 'plain', index: 5 });
    await openNote(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('   ');
    await page.keyboard.press('Enter');
    await settle(page);
    assert.deepEqual(saves, []);
    assert.equal(served.read('ui.md'), ORIGINAL);
    assert.equal(await page.locator('.comment-box').isVisible(), true, 'the box stays open for a note');
    assert.equal(await page.evaluate(() => window.margent.dirty()), false, 'an empty note is not unsaved text');
  })
);

test(
  'R5.1: the Comment control hides when the selection collapses',full, 
  scenario({ author: 'Ada' }, async ({ page }) => {
    await drag(page, { text: 'plain', index: 0 }, { text: 'plain', index: 5 });
    await page.locator('.comment-tool').waitFor();
    await page.mouse.click(990, 880);
    await page.locator('.comment-tool').waitFor({ state: 'hidden' });
  })
);

// ---- R5.2 snapping and the preview -----------------------------------------------------------------------------

test(
  'R5.2: a drag from inside a bold word to the next word marks the whole bold word, and the preview shows while typing',full, 
  scenario({ author: 'Ada' }, async ({ page, served }) => {
    await drag(page, { text: 'rendered', index: 2 }, { text: 'pages', index: 5 });
    assert.equal(await selectedText(page), 'ndered pages');
    await openNote(page);
    assert.equal(await highlightSet(page), true, 'the snapped range is highlighted before typing');
    await page.keyboard.type('Stable?');
    assert.equal(await highlightSet(page), true, 'and while the note is typed');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    assert.equal(
      served.read('ui.md'),
      ORIGINAL.replace('of **rendered** pages across', 'of {==**rendered** pages==}{>>[c3] Ada: Stable?<<} across')
    );
  })
);

// ---- R5.4 block comments ---------------------------------------------------------------------------------------

test(
  'R5.4/T15: a drag across two list items gives a block comment line after the list, quoting the selected text',full, 
  scenario({ author: 'Ada' }, async ({ page, served }) => {
    await drag(page, { text: 'First item', index: 0 }, { text: 'Second item', index: 6 });
    await openNote(page);
    // The box names the phrase only: how the comment is stored (a line after the list) is not the reader's concern.
    assert.equal((await page.locator('.comment-msg').textContent()).trim(), '');
    assert.equal(await quoteText(page), 'First item with the first point. Second', 'the quote shows before anything is typed');
    await page.keyboard.type('A note on the list.');
    const status = await saveVia(page, () => page.keyboard.press('Enter'));
    assert.equal(status, 200);
    assert.equal(
      served.read('ui.md'),
      ORIGINAL.replace(
        '- Second item with the second point.\n',
        '- Second item with the second point.\n\n{>>[c3] Ada: "First item with the first point. Second" → A note on the list.<<}\n'
      )
    );
  })
);

test(
  'T15: a phrase dragged in a table cell, then Comment and a note, gives a quoted block comment line after the table',full, 
  scenario({ author: 'Ada' }, async ({ page, served, saves }) => {
    await drag(page, { text: 'Proceed', index: 0 }, { text: 'Proceed', index: 7 });
    assert.equal(await selectedText(page), 'Proceed');
    await openNote(page);
    assert.equal(await quoteText(page), 'Proceed', 'the quote shows before anything is typed');
    await page.keyboard.type('Table note.');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    assert.equal(
      served.read('ui.md'),
      ORIGINAL.replace('| S3 | Proceed |\n', '| S3 | Proceed |\n\n{>>[c3] Ada: "Proceed" → Table note.<<}\n')
    );
    assert.equal(saves.length, 1, 'one save');
  })
);

// A phrase dragged in one cell of a table that repeats it (`nth` is which occurrence, in document order). The stored quote
// names that occurrence (decision 0041), and after the reload the page marks only that one table row.
function repeatedKeep({ nth }) {
  return scenario({ author: 'Ada', fixture: REPEAT, doc: 'repeat.md' }, async ({ page, served, saves }) => {
    await drag(page, { text: 'keep', index: 0, nth }, { text: 'keep', index: 4, nth });
    assert.equal(await selectedText(page), 'keep');
    await openNote(page);
    await page.keyboard.type('Table note.');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    assert.equal(
      served.read('repeat.md'),
      REPEAT_ORIGINAL.replace('| Parser | keep |\n', `| Parser | keep |\n\n{>>[c1] Ada: "keep" #${nth} → Table note.<<}\n`)
    );
    assert.equal(saves.length, 1, 'one save');
    // The save reloads the page, and the rail draws the reloaded card before the marks are read.
    await page.locator('article.c-card[data-c="c1"]').waitFor({ state: 'attached', timeout: 5000 });
    // Each range's body row (1-based), or null when the range is outside the table's body.
    const ranges = await page.evaluate(() => {
      const set = CSS.highlights.get('margent-quotes');
      return set ? [...set].map((r) => {
        const tr = r.startContainer.parentElement.closest('tr');
        return tr && tr.parentElement.tagName === 'TBODY' ? tr.sectionRowIndex + 1 : null;
      }) : [];
    });
    const where = `the highlight holds ${ranges.length} range(s), in body row(s) ${ranges.map((row) => row ?? 'outside the table').join(', ') || 'none'}`;
    assert.equal(ranges.length, 1, where);
    assert.deepEqual(ranges, [nth === 1 ? 2 : 6], where);
  });
}

test('F5: "keep" dragged in row 2 of a table that repeats it is stored as #1 and only row 2 is marked', repeatedKeep({ nth: 1 }));

test(
  'F5: "keep" dragged in row 6 of a table that repeats it is stored as #2 and only row 6 is marked',full,
  repeatedKeep({ nth: 2 })
);

test(
  'T15: a drag across two lines inside an island quotes them with a space between, as the page selection does',full, 
  scenario({ author: 'Ada', fixture: ISLAND, doc: 'island.md' }, async ({ page, served }) => {
    await drag(page, { text: 'Forum and Wiki are out', index: 15 }, { text: 'Blog and Docs stay in', index: 8 });
    await openNote(page);
    assert.equal(await quoteText(page), 'are out Blog and');
    await page.keyboard.type('Two lines.');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    assert.ok(served.read('island.md').includes('{>>[c1] Ada: "are out Blog and" → Two lines.<<}'), served.read('island.md'));
  })
);

test(
  'T15: a double or triple click on a line inside an island shows the Comment control by that line, not at the page corner',full, 
  scenario({ author: 'Ada', fixture: ISLAND, doc: 'island.md' }, async ({ page }) => {
    const line = 'Blog and Docs stay in';
    for (const clickCount of [2, 3]) {
      const p = await pointAt(page, { text: line, index: 3 });
      await page.mouse.click(p.x, p.y, { clickCount });
      const tool = page.locator('.comment-tool');
      await tool.waitFor();
      const box = await tool.boundingBox();
      assert.ok(box.y > p.y && box.y - p.y < 60, `${clickCount} clicks: the control sits just under the line (y ${box.y} vs ${p.y})`);
      assert.ok(Math.abs(box.x - p.x) < 400, `${clickCount} clicks: the control sits near the line horizontally (x ${box.x} vs ${p.x})`);
      await page.mouse.click(5, 300); // clear the selection
    }
  })
);

test(
  'T15: a phrase dragged inside an island, then Comment and a note, gives a quoted block comment line after the island',full, 
  scenario({ author: 'Ada', fixture: ISLAND, doc: 'island.md' }, async ({ page, served }) => {
    const phrase = 'Forum and Wiki are out';
    await drag(page, { text: phrase, index: 0 }, { text: phrase, index: phrase.length });
    await openNote(page);
    assert.equal(await quoteText(page), phrase, 'the quote shows before anything is typed');
    // The island's frame marks the phrase (M5 R6.2): the page cannot reach into it.
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await frame.waitForFunction(() => CSS.highlights.has('margent-quote'));
    const pending = await frame.evaluate(() => [...CSS.highlights.get('margent-quote')].map((r) => r.toString()));
    assert.deepEqual(pending, [phrase], 'the phrase stays marked in the island while the note is typed');
    await page.keyboard.type('Island note.');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    assert.equal(
      served.read('island.md'),
      ISLAND_ORIGINAL.replace('```\n\nA paragraph after', `\`\`\`\n\n{>>[c1] Ada: "${phrase}" → Island note.<<}\n\nA paragraph after`)
    );
  })
);

test(
  'T15: a quote holding <<} is refused when the note is sent: the box shows why, and nothing is saved',full, 
  scenario({ author: 'Ada', fixture: ISLAND, doc: 'island.md' }, async ({ page, served, saves }) => {
    const phrase = 'Stop marker <<} inside the island';
    await drag(page, { text: phrase, index: 0 }, { text: phrase, index: phrase.length });
    await openNote(page);
    await page.keyboard.type('Refused.');
    await page.keyboard.press('Enter');
    await page.locator('.comment-msg').filter({ hasText: "must not hold '<<}'" }).waitFor();
    assert.equal(await page.locator('.comment-box').isVisible(), true, 'the box stays open with the note');
    await settle(page);
    assert.deepEqual(saves, []);
    assert.equal(served.read('island.md'), ISLAND_ORIGINAL);
  })
);

test(
  'F5: a phrase dragged at its second place inside an island is stored as #2',full,
  scenario({ author: 'Ada', fixture: REPEAT_ISLAND, doc: 'island.md' }, async ({ page, served, saves }) => {
    // "quorum" occurs twice in one line the island draws, and nowhere else on the page: the drag picks the second.
    await drag(page, { text: 'quorum', index: 0, nth: 2 }, { text: 'quorum', index: 6, nth: 2 });
    await openNote(page);
    await page.keyboard.type('Second quorum.');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    assert.ok(
      served.read('island.md').includes('{>>[c1] Ada: "quorum" #2 → Second quorum.<<}'),
      served.read('island.md')
    );
    assert.equal(saves.length, 1, 'one save');
    // The save reloads the page: the rail draws the card, the island renders, then hovering the card marks the phrase
    // inside the frame. The mark must be the second match alone (decision 0041).
    await page.locator('article.c-card[data-c="c1"]').waitFor({ state: 'attached', timeout: 5000 });
    await page.locator('agent-island[data-state="rendered"]').waitFor({ state: 'attached', timeout: 10000 });
    await openCard(page, 'c1');
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await frame.waitForFunction(() => CSS.highlights.has('margent-quote'), null, { timeout: 5000 });
    const marked = await frame.evaluate(() => {
      const host = [...document.body.children].find((el) => el.shadowRoot);
      const matches = MargentQuote.find(host.shadowRoot, 'quorum');
      const which = (r) => matches.findIndex((m) => m.startContainer === r.startContainer && m.startOffset === r.startOffset) + 1;
      return {
        matches: matches.length,
        ranges: [...CSS.highlights.get('margent-quote')].map((r) => ({ text: r.toString(), which: which(r) })),
      };
    });
    const where = `the highlight holds ${marked.ranges.length} range(s) of ${marked.matches} match(es): ` +
      marked.ranges.map((r) => `${JSON.stringify(r.text)} is match ${r.which || 'none'}`).join(', ');
    assert.equal(marked.ranges.length, 1, where);
    assert.equal(marked.ranges[0].text, 'quorum', where);
    assert.equal(marked.ranges[0].which, 2, where);
  })
);

test(
  'R5.4: the block control on a table adds a line after it, and a second one goes after the first',full,
  scenario({ author: 'Ada' }, async ({ page, served }) => {
    const control = await blockControl(page, 'table');
    await control.click();
    await page.locator('.comment-box:not([hidden])').waitFor();
    await page.keyboard.type('Table first.');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    const first = ORIGINAL.replace('| S3 | Proceed |\n', '| S3 | Proceed |\n\n{>>[c3] Ada: Table first.<<}\n');
    assert.equal(served.read('ui.md'), first);

    const again = await blockControl(page, 'table');
    await again.click();
    await page.locator('.comment-box:not([hidden])').waitFor();
    await page.keyboard.type('Table second.');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    assert.equal(
      served.read('ui.md'),
      first.replace('{>>[c3] Ada: Table first.<<}\n', '{>>[c3] Ada: Table first.<<}\n\n{>>[c4] Ada: Table second.<<}\n')
    );
  })
);

// ---- R5.5 overlap ----------------------------------------------------------------------------------------------

test(
  'R5.5: a selection over an existing highlight is refused: the message names its comment and points to its Reply',full, 
  scenario({ author: 'Ada' }, async ({ page, served, saves }) => {
    await drag(page, { text: 'is marked', index: 0 }, { text: 'is marked', index: 9 });
    assert.equal(await selectedText(page), 'is marked');
    await openNote(page);
    const message = page.locator('.comment-msg');
    assert.match(await message.textContent(), /touches comment c1/);
    assert.equal(await page.locator('.comment-input:visible').isVisible(), false, 'no note can be typed over it');
    await page.locator('.comment-action').click();
    const focused = await page.evaluate(() => document.activeElement.className);
    assert.equal(focused, 'comment-reply', 'the action focuses the Reply of that thread');
    await settle(page);
    assert.deepEqual(saves, []);
    assert.equal(served.read('ui.md'), ORIGINAL);
  })
);

// ---- R5.6 and A10 the author -----------------------------------------------------------------------------------

test(
  'R5.6/A10: with no author, the note box refuses to save and names both ways to set one',full, 
  scenario({ noAuthor: true }, async ({ page, served, saves }) => {
    await drag(page, { text: 'plain', index: 0 }, { text: 'plain', index: 5 });
    await openNote(page);
    const message = await page.locator('.comment-msg').textContent();
    assert.match(message, /--author \{name\}/);
    assert.match(message, /git config user\.name \{name\}/);
    await page.keyboard.type('Cannot be saved.');
    await page.keyboard.press('Enter');
    await settle(page);
    assert.deepEqual(saves, []);
    assert.equal(served.read('ui.md'), ORIGINAL);
    assert.equal(await page.locator('.comment-box').isVisible(), true, 'the box stays open, with its text');
  })
);

// ---- 0033 editing your own notes ------------------------------------------------------------------------------------

const EDIT_DOCS = join(REPO, 'test', 'edit-corpus', 'docs');
const CTRL = process.platform === 'darwin' ? 'Meta' : 'Control';
const EMPTY_NOTE = "A note can't be empty. Resolve removes the thread.";
// The Edit control of the thread's nth owner note (1-based), in its note header. It shows on hover, as the card's footer does.
const editButtons = (page, id) => page.locator(`.c-card[data-c="${id}"] button.comment-edit`);

// Opens the rail's drawer when it is closed (below 1100px), and hovers the thread's card, where its footer and Edit show.
async function openCard(page, id) {
  const toggle = page.locator('.c-toggle');
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await page.locator(`.c-card[data-c="${id}"]`).hover();
}

test(
  '0033: Edit is on the header of each owner note, and on no other author\'s note',full,
  scenario({ author: 'Quy', fixture: EDIT_DOCS, doc: 'reviewed.md' }, async ({ page }) => {
    const notes = await page.evaluate(() =>
      [...document.querySelectorAll('.c-card p.c-note')].map((p) => ({
        author: p.querySelector('.c-author').textContent.trim(),
        own: p.hasAttribute('data-own'),
        edit: p.querySelector(':scope > .c-note-head > button.comment-edit') !== null,
      }))
    );
    assert.deepEqual(
      notes.filter((n) => n.own !== (n.author === 'Quy') || n.edit !== n.own),
      [],
      'a note is data-own, and has an Edit, exactly when its author is the owner'
    );
    assert.ok(notes.some((n) => !n.own), 'the page has a note by another author');
    const c1 = await page.evaluate(() =>
      [...document.querySelectorAll('.c-card[data-c="c1"] p.c-note')].map((p) => p.querySelector('.c-author').textContent.trim())
    );
    assert.deepEqual(c1, ['Quy', 'Claude']);
    // The footer keeps Reply and Resolve only: Edit is no longer in the action row.
    const rows = await page.evaluate(() =>
      ['c2', 'c3'].map((id) => [...document.querySelectorAll(`.c-card[data-c="${id}"] .c-actions button`)].map((b) => b.textContent))
    );
    assert.deepEqual(rows, [
      ['Reply', 'Resolve'],
      ['Reply', 'Resolve'],
    ]);
  })
);

test(
  '0033: with no author, no note has an Edit control',full,
  scenario({ noAuthor: true, fixture: EDIT_DOCS, doc: 'reviewed.md' }, async ({ page }) => {
    await page.locator('.c-note').first().waitFor({ state: 'attached' });
    assert.ok((await page.locator('.c-note').count()) > 0, 'the rail shows notes');
    assert.equal(await page.locator('.c-note[data-own]').count(), 0);
    assert.equal(await page.locator('button.comment-edit').count(), 0);
  })
);

test(
  '0033: Edit, Save after a change: the note is saved, and the field and Edit go back',full,
  scenario({ author: 'Quy', fixture: EDIT_DOCS, doc: 'reviewed.md' }, async ({ page, served, saves }) => {
    const reviewed = served.read('reviewed.md');
    await openCard(page, 'c1');
    await editButtons(page, 'c1').click();
    const field = page.locator('.comment-input:visible');
    await field.waitFor();
    assert.equal(await field.inputValue(), 'is this still true?', 'the field is prefilled with the note');
    await page.keyboard.press('End');
    await page.keyboard.type(' Still true.');
    assert.equal(await saveVia(page, () => page.locator('.comment-save:visible').click()), 200);
    assert.equal(
      served.read('reviewed.md'),
      reviewed.replace('{>>[c1] Quy: is this still true?<<}', '{>>[c1] Quy: is this still true? Still true.<<}')
    );
    assert.equal(saves.length, 1, 'one save');
  })
);

test(
  '0033: Edit with the field emptied, then Enter, shows the empty message and sends nothing',full,
  scenario({ author: 'Quy' }, async ({ page, served, saves }) => {
    await openCard(page, 'c1');
    await editButtons(page, 'c1').click();
    await page.locator('.comment-input:visible').waitFor();
    await page.keyboard.press(`${CTRL}+a`);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await settle(page);
    assert.equal(await page.locator('.comment-msg:not([hidden])').textContent(), EMPTY_NOTE);
    assert.equal(await page.locator('.comment-input:visible').isVisible(), true, 'the field stays open');
    assert.deepEqual(saves, []);
    assert.equal(served.read('ui.md'), ORIGINAL);
  })
);

test(
  '0033: Edit, then Esc, puts the note back and sends nothing',full,
  scenario({ author: 'Quy' }, async ({ page, served, saves }) => {
    await openCard(page, 'c1');
    await editButtons(page, 'c1').click();
    await page.locator('.comment-input:visible').waitFor();
    // The field takes the note's text in its header's place, in the same card.
    const inCard = await page.evaluate(() => [...document.querySelectorAll('.comment-input')].find((f) => f.offsetParent !== null)?.closest('.c-card')?.dataset.c);
    assert.equal(inCard, 'c1', 'the field is in the note\'s card');
    await page.keyboard.press('End');
    await page.keyboard.type(' Never sent.');
    await page.keyboard.press('Escape');
    await settle(page);
    assert.equal(await page.locator('.comment-input:visible').count(), 0, 'the field is gone');
    assert.equal(await page.locator('.c-card[data-c="c1"] .c-text').first().textContent(), 'is this still true?', 'the note is back');
    assert.deepEqual(saves, []);
    assert.equal(served.read('ui.md'), ORIGINAL);
  })
);

test(
  '0033: Edit, then Save button click, saves the note',full,
  scenario({ author: 'Quy' }, async ({ page, served, saves }) => {
    await openCard(page, 'c1');
    await editButtons(page, 'c1').click();
    await page.locator('.comment-input:visible').waitFor();
    await page.keyboard.press('End');
    await page.keyboard.type(' Saved by button.');
    assert.equal(await saveVia(page, () => page.locator('.comment-save:visible').click()), 200);
    assert.equal(
      served.read('ui.md'),
      ORIGINAL.replace('{>>[c1] Quy: is this still true?<<}', '{>>[c1] Quy: is this still true? Saved by button.<<}')
    );
    assert.equal(saves.length, 1, 'one save');
  })
);

test(
  '0033: Edit, then a click elsewhere, neither saves nor closes the field',full,
  scenario({ author: 'Quy' }, async ({ page, served, saves }) => {
    await openCard(page, 'c1');
    await editButtons(page, 'c1').click();
    await page.locator('.comment-input:visible').waitFor();
    await page.keyboard.press('End');
    await page.keyboard.type(' Not yet.');
    await page.mouse.click(990, 880);
    await settle(page);
    assert.equal(await page.locator('.comment-input:visible').isVisible(), true, 'the field stays open with the change');
    assert.deepEqual(saves, []);
    assert.equal(served.read('ui.md'), ORIGINAL);
  })
);

test(
  '0033: a reply by the owner, after the page reloads with it, is edited in place and keeps the thread',full,
  scenario({ author: 'Quy', fixture: EDIT_DOCS, doc: 'reviewed.md' }, async ({ page, served, saves }) => {
    const reviewed = served.read('reviewed.md');
    await (await threadButton(page, 'c1', 'Reply')).click();
    await page.locator('.comment-input:visible').waitFor();
    await page.keyboard.type('Agreed, keep it.');
    const reloaded = page.waitForEvent('load');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    await reloaded;
    const edits = editButtons(page, 'c1');
    assert.equal(await edits.count(), 2, 'the reply gets an Edit after the Quy note');
    await threadButton(page, 'c1', 'Reply'); // opens the rail's drawer below 1100px, and hovers the card
    await edits.nth(1).click();
    await page.locator('.comment-input:visible').waitFor();
    await page.keyboard.press(`${CTRL}+a`);
    await page.keyboard.type('Agreed, keep it for now.');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    assert.equal(
      served.read('reviewed.md'),
      reviewed.replace('{>>[c1] Claude: Checked against the API docs.<<}', '{>>[c1] Claude: Checked against the API docs.<<}{>>[c1] Quy: Agreed, keep it for now.<<}')
    );
    assert.equal(saves.length, 2, 'the reply and its edit are two saves');
  })
);

test(
  '0037: Edit shows a note with a <br> on two lines, and Enter with no change sends no save',full,
  scenario(
    {
      author: 'Quy',
      fixture: EDIT_DOCS,
      doc: 'reviewed.md',
      prepare: (text) => text.replace('Quy: is this still true?', 'Quy: first<br>second'),
    },
    async ({ page, served, saves }) => {
      const reviewed = served.read('reviewed.md');
      await openCard(page, 'c1');
      await editButtons(page, 'c1').click();
      const field = page.locator('.comment-input:visible');
      await field.waitFor();
      assert.equal(await field.inputValue(), 'first\nsecond', 'the field shows the break as a line');
      assert.equal(await page.evaluate(() => window.margent.dirty()), false, 'an unchanged edit is not unsaved text');
      await page.keyboard.press('Enter');
      await page.locator('.comment-input:visible').waitFor({ state: 'hidden' });
      await settle(page);
      assert.deepEqual(saves, []);
      assert.equal(served.read('reviewed.md'), reviewed);
    }
  )
);

test(
  '0037: Shift+Enter in a reply starts a new line, and the reply is saved with a <br>',full,
  scenario({ author: 'Quy', fixture: EDIT_DOCS, doc: 'reviewed.md' }, async ({ page, served, saves }) => {
    const reviewed = served.read('reviewed.md');
    await (await threadButton(page, 'c1', 'Reply')).click();
    await page.locator('.comment-input:visible').waitFor();
    await page.keyboard.type('First line.');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('Second line.');
    const reloaded = page.waitForEvent('load');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    await reloaded;
    assert.equal(
      served.read('reviewed.md'),
      reviewed.replace(
        '{>>[c1] Claude: Checked against the API docs.<<}',
        '{>>[c1] Claude: Checked against the API docs.<<}{>>[c1] Quy: First line.<br>Second line.<<}'
      )
    );
    assert.equal(saves.length, 1, 'one save');
  })
);

test(
  '0037: a paste of two lines into a new note is saved as one line with a <br>',full,
  scenario({ author: 'Ada' }, async ({ page, served, saves }) => {
    await drag(page, { text: 'plain', index: 0 }, { text: 'plain', index: 5 });
    await openNote(page);
    await page.keyboard.insertText('first\nsecond');
    assert.equal(await page.locator('.comment-box .comment-input').inputValue(), 'first\nsecond', 'the paste keeps its line');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    assert.equal(
      served.read('ui.md'),
      ORIGINAL.replace('The plain paragraph', 'The {==plain==}{>>[c3] Ada: first<br>second<<} paragraph')
    );
    assert.equal(saves.length, 1, 'one save');
  })
);

// An owner note long enough to wrap to several lines in the 280px rail card (decision 0033).
const LONG_NOTE =
  'This note is long enough to wrap over several lines in the narrow rail card, so the field that Edit opens on it must show every line of the text, with none clipped away at the bottom.';

for (const [label, viewport] of [
  ['the default viewport', undefined],
  ['1400px wide', { width: 1400, height: 900 }],
]) {
  test(
    `0033: Edit on a long owner note shows all of its text in the field, at ${label}`,
    full,
    async () => {
      const served = await serveCopy(EDIT_DOCS, { author: 'Quy' });
      try {
        const reviewed = served.read('reviewed.md');
        writeFileSync(join(served.root, 'reviewed.md'), reviewed.replace('Quy: is this still true?', `Quy: ${LONG_NOTE}`));
        await withBrowser(async (browser) => {
          const { page, errors, close } = await openServedPage(browser, served, 'reviewed.md', viewport ? { viewport } : {});
          try {
            await openCard(page, 'c1');
            await editButtons(page, 'c1').click();
            const field = page.locator('.comment-input:visible');
            await field.waitFor();
            const m = await field.evaluate((el) => {
              const cs = getComputedStyle(el);
              const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
              return { scroll: el.scrollHeight, client: el.clientHeight, line };
            });
            assert.ok(m.scroll <= m.client, `the field shows all its text (scroll ${m.scroll}, client ${m.client})`);
            assert.ok(m.client > 2 * m.line, `the field is several lines tall (client ${m.client}, line ${m.line})`);
            assert.equal(await field.inputValue(), LONG_NOTE, 'the field holds the whole note');
            assert.deepEqual(errors, [], 'the page logs no errors');
          } finally {
            await close();
          }
        });
      } finally {
        await served.close();
      }
    }
  );
}

// Opens a served copy of a fixture at a viewport (the default one when undefined), runs fn, and closes everything.
async function withPage(fixture, doc, viewport, fn, options = { author: 'Ada' }) {
  const served = await serveCopy(fixture, options);
  try {
    await withBrowser(async (browser) => {
      const { page, errors, close } = await openServedPage(browser, served, doc, viewport ? { viewport } : {});
      try {
        await fn(page);
        assert.deepEqual(errors, [], 'the page logs no errors');
      } finally {
        await close();
      }
    });
  } finally {
    await served.close();
  }
}

// The field that is open and empty is at least one line tall, and shows its placeholder (decision 0033 and the draft card).
async function assertEmptyField(page, placeholder, what) {
  const field = page.locator('.comment-input:visible');
  await field.waitFor();
  const m = await field.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { client: el.clientHeight, line: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2, value: el.value, placeholder: el.placeholder };
  });
  assert.ok(m.client >= m.line, `${what}: the empty field is at least a line tall (client ${m.client}, line ${m.line})`);
  assert.equal(m.value, '', `${what}: the field is empty`);
  assert.equal(m.placeholder, placeholder, `${what}: the field shows its placeholder`);
}

for (const [label, viewport] of [
  ['the default viewport', undefined],
  ['1400px wide', { width: 1400, height: 900 }],
]) {
  test(`0023: the empty field of a new comment from a block's Comment control is a line tall, at ${label}`, full, () =>
    withPage(FIXTURE, 'ui.md', viewport, async (page) => {
      const control = await blockControl(page, 'table');
      await control.click();
      await page.locator('.comment-box:not([hidden])').waitFor();
      await assertEmptyField(page, 'Add a comment', 'the block comment');
    }));

  test(`0023: the empty field of a new comment from a selection's Comment tool is a line tall, at ${label}`, full, () =>
    withPage(FIXTURE, 'ui.md', viewport, async (page) => {
      await drag(page, { text: 'plain', index: 0 }, { text: 'plain', index: 5 });
      await openNote(page);
      await assertEmptyField(page, 'Add a comment', 'the selection comment');
    }));

  test(`0033: the empty reply field is a line tall, at ${label}`, full, () =>
    withPage(FIXTURE, 'ui.md', viewport, async (page) => {
      await openCard(page, 'c1');
      await page.locator('.c-card[data-c="c1"] .comment-reply').click();
      await assertEmptyField(page, 'Reply', 'the reply');
    }));
}

// ---- R6 replying and resolving ---------------------------------------------------------------------------------

test(
  'R6.1: Reply on a thread appends a note after its last note',
  scenario({ author: 'Ada' }, async ({ page, served }) => {
    const reply = await threadButton(page, 'c1', 'Reply');
    await reply.click();
    await page.locator('.comment-input:visible').waitFor();
    await page.keyboard.type('Rechecked, still true.');
    assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
    assert.equal(
      served.read('ui.md'),
      ORIGINAL.replace(
        '{>>[c1] Quy: is this still true?<<}',
        '{>>[c1] Quy: is this still true?<<}{>>[c1] Ada: Rechecked, still true.<<}'
      )
    );
  })
);

test(
  'R6.2: Resolve on an inline thread drops its notes and markers and keeps the highlighted text',full, 
  scenario({ author: 'Ada' }, async ({ page, served }) => {
    const resolve = await threadButton(page, 'c1', 'Resolve');
    assert.equal(await saveVia(page, () => resolve.click()), 200);
    assert.equal(served.read('ui.md'), ORIGINAL.replace('{==here is marked==}{>>[c1] Quy: is this still true?<<}', 'here is marked'));
  })
);

test(
  'R6.2: Resolve on a block comment line drops the line and one blank line',full, 
  scenario({ author: 'Ada' }, async ({ page, served }) => {
    const resolve = await threadButton(page, 'c2', 'Resolve');
    assert.equal(await saveVia(page, () => resolve.click()), 200);
    assert.equal(served.read('ui.md'), ORIGINAL.replace('A paragraph that holds a block comment.\n\n{>>[c2] Quy: Cite a source for this.<<}\n', 'A paragraph that holds a block comment.\n'));
  })
);

// ---- R7 a block that holds comments still edits in place, and its buttons are not its text ------------------

test(
  'R7: a paragraph holding a comment still edits in place, and its buttons add no words to the saved markdown',full, 
  scenario({ author: 'Ada' }, async ({ page, served }) => {
    // The paragraph's markdown, read back from its DOM, is its source: its buttons are not part of it.
    const sameAsSource = await page.evaluate(() => {
      const el = document.querySelector('mark.c-hl[data-c="c1"]').closest('[data-src]');
      return { gate: el.getAttribute('data-gate'), same: window.margent.toMarkdown(el) === window.margent.sourceOf(el.dataset.src) };
    });
    assert.deepEqual(sameAsSource, { gate: 'pass', same: true });
    const p = await pointAt(page, { text: 'A paragraph with', index: 0 });
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('Big ');
    assert.equal(await saveVia(page, () => page.mouse.click(990, 880)), 200);
    assert.equal(
      served.read('ui.md'),
      ORIGINAL.replace('A paragraph with an existing', 'Big A paragraph with an existing')
    );
  })
);

// ---- 422: the save is refused by the renderer -----------------------------------------------------------------

test(
  '422: a comment the renderer refuses is not saved, and the panel shows the refusal with its file and line',full, 
  scenario({ author: 'Ada', fixture: REFUSAL, doc: 'refusal.md' }, async ({ page, served }) => {
    const original = readFileSync(join(REFUSAL, 'refusal.md'), 'utf8');
    // The selected text is the highlight's own closing marker, so the marked text ends too early and the note has no
    // highlight after it.
    await drag(page, { text: '==}', index: 0 }, { text: '==}', index: 3 });
    assert.equal(await selectedText(page), '==}');
    await openNote(page);
    await page.keyboard.type('Oops');
    const status = await saveVia(page, () => page.keyboard.press('Enter'));
    assert.equal(status, 422);
    assert.equal(served.read('refusal.md'), original, 'the file is unchanged');
    const error = page.locator('.edit-panel:not([hidden]) .edit-panel-errors code').first();
    await error.waitFor();
    assert.match(await error.textContent(), /refusal\.md:7: /);
  })
);

// ---- R5.7 and A7 unsaved notes hold the reload -----------------------------------------------------------------

test(
  'R5.7/A7: a note being typed holds the reload of an external write; Enter then gets 409 and the panel holds the note\'s block',full, 
  scenario({ author: 'Ada' }, async ({ page, served }) => {
    await drag(page, { text: 'plain', index: 0 }, { text: 'plain', index: 5 });
    await openNote(page);
    await page.keyboard.type('Held note.');
    await page.evaluate(() => {
      window.__marker = 'held';
    });
    const external = ORIGINAL.replace('A filter keeps', 'A filter still keeps');
    writeFileSync(join(served.root, 'ui.md'), external);
    await page.locator('.edit-banner[data-kind="changed"]').waitFor();
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.__marker), 'held', 'the page did not reload');
    assert.equal(await page.locator('.comment-input:visible').inputValue(), 'Held note.');

    const status = await saveVia(page, () => page.keyboard.press('Enter'));
    assert.equal(status, 409);
    assert.equal(served.read('ui.md'), external, 'the file holds only the external write');
    const panelText = page.locator('.edit-panel:not([hidden]) .edit-panel-text');
    await panelText.waitFor();
    assert.equal(
      await panelText.inputValue(),
      PLAIN.replace('The plain paragraph', 'The {==plain==}{>>[c3] Ada: Held note.<<} paragraph')
    );
  })
);

// ---- screenshots for docs/results/m3 (UPDATE_SHOTS=1 npm test -- test/comments-ui.test.mjs) ----------------------

// Opens a served copy of the UI fixture at 1280px wide, where the rail sits beside the content.
async function wide(fn, { fixture = FIXTURE, doc = 'ui.md' } = {}) {
  const served = await serveCopy(fixture, { author: 'Ada' });
  try {
    await withBrowser(async (browser) => {
      const { page, errors, close } = await openServedPage(browser, served, doc, { viewport: { width: 1280, height: 800 } });
      try {
        await fn(page);
        assert.deepEqual(errors, []);
      } finally {
        await close();
      }
    });
  } finally {
    await served.close();
  }
}

const boxIn = (page) =>
  page.evaluate(() => {
    const box = document.querySelector('.comment-box');
    const r = box.getBoundingClientRect();
    return { inRail: box.parentElement?.classList.contains('c-rail') ?? false, top: r.top, left: r.left };
  });

test('0023: at 1280px a new comment opens as a draft card in the rail, level with the selection', () =>
  wide(async (page) => {
    await drag(page, { text: 'plain', index: 0 }, { text: 'plain', index: 5 });
    await openNote(page);
    const box = await boxIn(page);
    const sel = await pointAt(page, { text: 'plain', index: 0 });
    assert.equal(box.inRail, true, 'the box is in the rail');
    assert.ok(Math.abs(box.top - sel.y) < 20, `the box is level with the selection (box ${box.top}, selection ${sel.y})`);
    const content = await page.evaluate(() => document.querySelector('main p').getBoundingClientRect().right);
    assert.ok(box.left > content, 'the box sits right of the content');
    await page.keyboard.press('Escape');
    assert.equal((await boxIn(page)).inRail, false, 'Esc puts the box away');
  }));

test('0023: at 1280px a reply is typed in its thread card, inside it, under the notes', full, () =>
  wide(async (page) => {
    const card = page.locator('.c-card[data-c="c1"]');
    await card.hover();
    await card.locator('.comment-reply').click();
    const field = card.locator('.comment-input');
    await field.waitFor();
    assert.equal(await field.getAttribute('placeholder'), 'Reply');
    const inRail = await page.evaluate(() => document.querySelector('.c-card[data-c="c1"]').parentElement.classList.contains('c-rail'));
    assert.equal(inRail, true, 'the card is in the rail');
    const cardBox = await card.boundingBox();
    const fieldBox = await field.boundingBox();
    assert.ok(
      fieldBox.y >= cardBox.y && fieldBox.y + fieldBox.height <= cardBox.y + cardBox.height,
      `the reply field is inside its card (field ${fieldBox.y}, card ${cardBox.y} to ${cardBox.y + cardBox.height})`
    );
    assert.equal(await page.locator('.comment-box').isVisible(), false, 'no new-comment card opens for a reply');
    assert.equal(await card.locator('.c-actions').isVisible(), false, 'the footer hides while the reply is typed');
  }));

test('0023: on a served doc with no comments yet, the first note still opens in the rail', full, () =>
  wide(
    async (page) => {
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('c-rail-on')), false, 'no rail before');
      const phrase = 'Forum and Wiki are out';
      await drag(page, { text: phrase, index: 0 }, { text: phrase, index: phrase.length });
      await openNote(page);
      assert.equal((await boxIn(page)).inRail, true, 'the draft is in the rail');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('c-rail-on')), false, 'no rail after');
    },
    { fixture: ISLAND, doc: 'island.md' }
  ));

test('0023: a long note wraps in the field, which grows, and Enter still saves it as one line', full, async () => {
  const served = await serveCopy(FIXTURE, { author: 'Ada' });
  try {
    await withBrowser(async (browser) => {
      const { page, close } = await openServedPage(browser, served, 'ui.md', { viewport: { width: 1280, height: 800 } });
      try {
        await drag(page, { text: 'plain', index: 0 }, { text: 'plain', index: 5 });
        await openNote(page);
        const before = (await page.locator('.comment-input:visible').boundingBox()).height;
        const note = 'This note is long enough to wrap over several lines in the narrow rail card, so the box must grow to show it.';
        await page.keyboard.type(note);
        const after = (await page.locator('.comment-input:visible').boundingBox()).height;
        assert.ok(after > before, `the field grew with the text (${before} to ${after})`);
        const hidden = await page.locator('.comment-input:visible').evaluate((el) => el.scrollHeight - el.clientHeight);
        assert.ok(hidden <= 1, `all of the note shows, none scrolled out of view (${hidden}px hidden)`);
        assert.equal(await saveVia(page, () => page.keyboard.press('Enter')), 200);
        assert.ok(served.read('ui.md').includes(`{==plain==}{>>[c3] Ada: ${note}<<}`), served.read('ui.md'));
      } finally {
        await close();
      }
    });
  } finally {
    await served.close();
  }
});

test('0023: below 1100px the note box stays docked at the bottom of the window', full, () =>
  scenario({ author: 'Ada' }, async ({ page }) => {
    await drag(page, { text: 'plain', index: 0 }, { text: 'plain', index: 5 });
    await openNote(page);
    assert.equal((await boxIn(page)).inRail, false);
  })());

test(
  'screenshots: the control, the note box and a thread (light, 1280px), into the UPDATE_SHOTS folder',
  { skip: !SHOTS },
  async (t) => {
    mkdirSync(SHOTS, { recursive: true });
    const served = await serveCopy(FIXTURE, { author: 'Ada' });
    t.after(() => served.close());
    await withBrowser(async (browser) => {
      const { page, close } = await openServedPage(browser, served, 'ui.md', { viewport: { width: 1280, height: 800 } });
      try {
        await drag(page, { text: 'plain', index: 0 }, { text: 'plain', index: 5 });
        await page.locator('.comment-tool').waitFor();
        await page.mouse.move(1270, 790);
        await page.screenshot({ path: join(SHOTS, 'ui-control.png') });
        await openNote(page);
        await page.keyboard.type('Check the wording.');
        await page.screenshot({ path: join(SHOTS, 'ui-notebox.png') });
        await page.keyboard.press('Escape');
        // At 1280px the rail sits beside the content, so its cards show without the drawer toggle.
        const thread = page.locator('.c-card[data-c="c1"]');
        await thread.hover();
        // The actions fade in over 150ms; the shot waits for them to settle.
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(SHOTS, 'ui-thread.png') });
      } finally {
        await close();
      }
    });
  }
);
