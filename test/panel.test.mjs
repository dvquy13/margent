// Side panel tests (T7, spec R5, acceptance A4 and A5, plus the keyboard and focus rules of R5.2). Real keyboard and
// mouse input in installed Chrome, on a temp copy of test/fixtures/panel/docs served by the real `margent serve`
// server. Expected files are written out by hand: each save changes the lines named in the test and nothing else.
// Run `npm run build` first (or `npm test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { islandFrameByName, withBrowser } from './helpers/browser.mjs';
import { openServedPage, serveCopy } from './helpers/serve-page.mjs';
import { full } from './helpers/tier.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(REPO, 'test', 'fixtures', 'panel', 'docs');
const ORIGINAL = readFileSync(join(FIXTURE, 'panel.md'), 'utf8');

// Lines 1-based, inclusive. Replaces lines start..end of `file` with `block` (a hand-written string, LF line endings;
// null removes the lines),
// and asserts the lines it replaces are the ones the test names, so a wrong range fails loudly.
function replaceLines(file, start, end, expectedOld, block) {
  const lines = file.split('\n');
  const old = lines.slice(start - 1, end).join('\n');
  assert.equal(old, expectedOld, `test setup: lines ${start}-${end} are not the block the test expects`);
  const middle = block === null ? [] : block.split('\n');
  return [...lines.slice(0, start - 1), ...middle, ...lines.slice(end)].join('\n');
}

// A served copy of the fixture, closed when the test ends.
async function site(t) {
  const served = await serveCopy(FIXTURE);
  t.after(() => served.close());
  return served;
}

// Waits until the page has reloaded: the marker set before the action is gone, and the runtime is up.
async function waitReloaded(page) {
  await page.waitForFunction(() => window.margent !== undefined && window.__marker === undefined, null, {
    timeout: 5000,
  });
}

// Clicks the edit control named `name` after hovering its block, the way a mouse user reaches it.
async function openEdit(page, blockRange, name) {
  await page.locator(`[data-src="${blockRange}"]`).hover();
  await page.getByRole('button', { name, exact: true }).click();
  await page.locator('.edit-panel:not([hidden]) .edit-panel-text').waitFor();
}

// Replaces the whole text of the panel, by keyboard: select all, then type.
async function typeIntoPanel(page, text) {
  await page.locator('.edit-panel-text').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
}

// Saves with Cmd+S and resolves with the save response's status. A 200 reloads the page, which drops the response
// body, so the body is not read here: a 422's errors are checked in the panel, and the file is checked on disk.
async function saveWithKeyboard(page) {
  await page.evaluate(() => {
    window.__marker = 'before-save';
  });
  const response = page.waitForResponse((r) => r.url().endsWith('/_save') && r.request().method() === 'POST');
  await page.keyboard.press('ControlOrMeta+s');
  return { status: (await response).status() };
}

test('A4: the panel saves a table and the file holds exactly the new lines', async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    await openEdit(page, '10-13', 'Edit table, lines 10–13');
    await typeIntoPanel(page, '| Item | Count |\n|---|---|\n| alpha | 7 |\n| beta | 2 |\n| gamma | 3 |');
    const save = await saveWithKeyboard(page);
    assert.equal(save.status, 200);
    await waitReloaded(page);
    const expected = replaceLines(
      ORIGINAL,
      10,
      13,
      '| Item | Count |\n|---|---|\n| alpha | 1 |\n| beta | 2 |',
      '| Item | Count |\n|---|---|\n| alpha | 7 |\n| beta | 2 |\n| gamma | 3 |'
    );
    assert.equal(served.read('panel.md'), expected);
    assert.equal(await page.locator('.edit-panel:not([hidden])').count(), 0, 'the panel closes after a save');
    assert.deepEqual(errors, []);
  });
});

test('A4: the panel saves a fenced code block', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    await openEdit(page, '15-17', 'Edit code block, lines 15–17');
    await typeIntoPanel(page, '```js\nconst answer = 43;\n```');
    const save = await saveWithKeyboard(page);
    assert.equal(save.status, 200);
    await waitReloaded(page);
    const expected = replaceLines(ORIGINAL, 15, 17, '```js\nconst answer = 42;\n```', '```js\nconst answer = 43;\n```');
    assert.equal(served.read('panel.md'), expected);
    assert.equal(await page.locator('pre code').textContent(), 'const answer = 43;\n');
    assert.deepEqual(errors, []);
  });
});

test('A4: the panel saves an island table, and the island shows the new data after reload', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    // Stacking: the island's edit control is the element at its center, not the island's frame. Its pointer-events
    // depend on the block's :hover, which does not reach the frame reliably in headless Chrome, so they are forced on
    // for this one query and restored at once. The check is about stacking only.
    const hit = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button.edit-control')].find(
        (b) => b.getAttribute('aria-label') === 'Edit island tally, lines 19–22'
      );
      const saved = btn.style.pointerEvents;
      btn.style.pointerEvents = 'auto';
      const r = btn.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      btn.style.pointerEvents = saved;
      return top === btn;
    });
    assert.equal(hit, true, 'the edit control is the element at its center, not the island frame');
    await openEdit(page, '19-22', 'Edit island tally, lines 19–22');
    await typeIntoPanel(page, '<!-- island tally -->\n| Verdict |\n|---|\n| Adjust |\n| Stop |');
    const save = await saveWithKeyboard(page);
    assert.equal(save.status, 200);
    await waitReloaded(page);
    const expected = replaceLines(
      ORIGINAL,
      19,
      22,
      '<!-- island tally -->\n| Verdict |\n|---|\n| Proceed |',
      '<!-- island tally -->\n| Verdict |\n|---|\n| Adjust |\n| Stop |'
    );
    assert.equal(served.read('panel.md'), expected);
    const rows = await page.evaluate(() => {
      const data = JSON.parse(document.querySelector('agent-island[name="tally"] script.island-data').textContent);
      return data.data.rows.map((r) => r.verdict);
    });
    assert.deepEqual(rows, ['Adjust', 'Stop']);
    // The island's shadow content lives inside its srcdoc frame (M5 R3).
    const shown = await (await islandFrameByName(page, 'tally')).evaluate(() => {
      const host = [...document.body.children].find((e) => e.shadowRoot);
      return [...host.shadowRoot.querySelectorAll('li')].map((li) => li.textContent.trim());
    });
    assert.deepEqual(shown, ['Adjust', 'Stop']);
    assert.deepEqual(errors, []);
  });
});

test('A4: the header meta line opens the frontmatter, and the saved status shows after reload', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    assert.equal(await page.locator('.top-meta').textContent(), 'draft');
    await page.getByRole('button', { name: 'Edit frontmatter, lines 1–4', exact: true }).click();
    await page.locator('.edit-panel:not([hidden]) .edit-panel-text').waitFor();
    assert.equal(await page.locator('.edit-panel-title').textContent(), 'Lines 1–4');
    await typeIntoPanel(page, '---\ntitle: Panel doc\nstatus: final\n---');
    const save = await saveWithKeyboard(page);
    assert.equal(save.status, 200);
    await waitReloaded(page);
    const expected = replaceLines(ORIGINAL, 1, 4, '---\ntitle: Panel doc\nstatus: draft\n---', '---\ntitle: Panel doc\nstatus: final\n---');
    assert.equal(served.read('panel.md'), expected);
    assert.equal(await page.locator('.top-meta').textContent(), 'final');
    assert.deepEqual(errors, []);
  });
});

test('A4: saving empty text deletes the block and the blank line it leaves double goes too', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    await openEdit(page, '15-17', 'Edit code block, lines 15–17');
    await page.locator('.edit-panel-text').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    assert.equal(await page.locator('.edit-panel-text').inputValue(), '');
    const save = await saveWithKeyboard(page);
    assert.equal(save.status, 200);
    await waitReloaded(page);
    // Lines 15-17 go. Line 14 and line 18 were both blank, so one of them goes too.
    const expected = replaceLines(ORIGINAL, 15, 18, '```js\nconst answer = 42;\n```\n', null);
    assert.equal(served.read('panel.md'), expected);
    assert.equal(await page.locator('pre').count(), 0);
    assert.deepEqual(errors, []);
  });
});

// The point of A5 is the save refusal: a save that Node cannot render is a 422, shows file:line in the panel and leaves
// the file alone. A schema error no longer refuses a save (M5 R1.3: it renders inside the island's frame), so the
// broken line here names a module that does not exist, an error Node still raises.
test('A5: a save that breaks the island lookup shows file:line in the panel and leaves the file unchanged', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    const before = served.read('panel.md');
    await openEdit(page, '19-22', 'Edit island tally, lines 19–22');
    const typed = '<!-- island nosuch -->\n| Verdict |\n|---|\n| Proceed |';
    await typeIntoPanel(page, typed);
    const save = await saveWithKeyboard(page);
    assert.equal(save.status, 422);
    const alert = page.locator('.edit-panel-errors[role="alert"]');
    await alert.waitFor();
    const message = await alert.textContent();
    assert.match(message, /panel\.md:19: island "nosuch" has no module islands\/nosuch/);
    assert.equal(await page.locator('.edit-panel-text').inputValue(), typed);
    assert.equal(await page.locator('.edit-panel:not([hidden])').count(), 1, 'the panel stays open with the text');
    assert.equal(served.read('panel.md'), before, 'the file is unchanged, byte for byte');
    assert.deepEqual(errors, []);
  });
});

test('R5.2: the panel opens with focus in its text, Esc cancels without writing, and focus returns to the control', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    const before = served.read('panel.md');
    const control = page.getByRole('button', { name: 'Edit table, lines 10–13', exact: true });
    await page.locator('[data-src="10-13"]').hover();
    await control.click();
    const focused = await page.evaluate(() => document.activeElement.className);
    assert.equal(focused, 'edit-panel-text', 'focus moves into the text on open');
    await page.keyboard.type('unsaved');
    await page.keyboard.press('Escape');
    await page.locator('.edit-panel[hidden]').waitFor({ state: 'attached' });
    assert.equal(served.read('panel.md'), before, 'Esc writes nothing');
    const back = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    assert.equal(back, 'Edit table, lines 10–13', 'focus returns to the control that opened the panel');
    assert.deepEqual(errors, []);
  });
});

test('R5.2: Cancel closes the panel without writing, and reopening shows the file text again', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    const before = served.read('panel.md');
    await openEdit(page, '26-26', 'Edit blockquote, lines 26–26');
    await typeIntoPanel(page, '> Changed but cancelled.');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.locator('.edit-panel[hidden]').waitFor({ state: 'attached' });
    assert.equal(served.read('panel.md'), before);
    await openEdit(page, '26-26', 'Edit blockquote, lines 26–26');
    assert.equal(await page.locator('.edit-panel-text').inputValue(), '> A quoted note.');
    assert.deepEqual(errors, []);
  });
});

test('R5.1: blocks that pass the gate get no edit control; every other block gets one; 390px is full width', async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md', { viewport: { width: 390, height: 800 } });
    t.after(close);
    const labels = await page.locator('.edit-control').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    assert.deepEqual(labels, [
      'Edit frontmatter, lines 1–4',
      'Edit table, lines 10–13',
      'Edit code block, lines 15–17',
      'Edit island tally, lines 19–22',
      'Edit figure, lines 24–24',
      'Edit blockquote, lines 26–26',
    ]);
    const passed = await page.locator('[data-gate="pass"] .edit-control').count();
    assert.equal(passed, 0);
    await page.locator('[data-src="10-13"]').hover();
    await page.getByRole('button', { name: 'Edit table, lines 10–13', exact: true }).click();
    const box = await page.locator('.edit-panel').boundingBox();
    assert.equal(Math.round(box.width), 390, 'the panel fills a 390px screen');
    assert.equal(Math.round(box.x), 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `no horizontal page scroll (overflow ${overflow}px)`);
    assert.deepEqual(errors, []);
  });
});
