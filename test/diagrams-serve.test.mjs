// Mermaid diagrams under `serve` (M8 spec D6.1). A diagram's edit control opens the side panel with its fence source, a
// save writes the fence back and the page shows the new diagram, and a save that leaves a pele error is refused the way
// any render error is (A5): 422, the error in the panel with file:line, and the file unchanged. Real keyboard and mouse input
// in installed Chrome, on a temp copy of test/fixtures/diagrams/serve/docs served by the real `margent serve` server.
// Run `npm run build` first (or `npm test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBrowser } from './helpers/browser.mjs';
import { openServedPage, serveCopy } from './helpers/serve-page.mjs';
import { full } from './helpers/tier.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(REPO, 'test', 'fixtures', 'diagrams', 'serve', 'docs');
const ORIGINAL = readFileSync(join(FIXTURE, 'flow.md'), 'utf8');
const FENCE = '```mermaid\nflowchart LR\n  A[Write the doc] --> B[Render the page]\n```';

// A served copy of the fixture, closed when the test ends.
async function site(t) {
  const served = await serveCopy(FIXTURE);
  t.after(() => served.close());
  return served;
}

// Waits until the page has reloaded: the marker set before the save is gone, and the runtime is up.
async function waitReloaded(page) {
  await page.waitForFunction(() => window.margent !== undefined && window.__marker === undefined, null, { timeout: 5000 });
}

// Hovers the diagram, then clicks its edit control by name, the way a mouse user reaches it.
async function openDiagramEdit(page, blockRange, name) {
  await page.locator(`figure.diagram[data-src="${blockRange}"]`).hover();
  await page.getByRole('button', { name, exact: true }).click();
  await page.locator('.edit-panel:not([hidden]) .edit-panel-text').waitFor();
}

// Replaces the whole text of the panel, by keyboard: select all, then type.
async function typeIntoPanel(page, text) {
  await page.locator('.edit-panel-text').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
}

// Saves with Cmd+S and resolves with the save response's status. A 200 reloads the page, so the body is read only on
// a refusal, where the panel shows the errors and the file is checked on disk.
async function saveWithKeyboard(page) {
  await page.evaluate(() => {
    window.__marker = 'before-save';
  });
  const response = page.waitForResponse((r) => r.url().endsWith('/_save') && r.request().method() === 'POST');
  await page.keyboard.press('ControlOrMeta+s');
  return { status: (await response).status() };
}

test('D6.1: a diagram opens the panel with its fence source, and a saved edit shows in the page SVG', async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'flow.md');
    t.after(close);
    await openDiagramEdit(page, '10-13', 'Edit diagram, lines 10–13');
    assert.equal(await page.locator('.edit-panel-title').textContent(), 'Lines 10–13');
    assert.equal(await page.locator('.edit-panel-text').inputValue(), FENCE, 'the panel holds the fence source');
    const changed = FENCE.replace('[Render the page]', '[Render the diagram]');
    await typeIntoPanel(page, changed);
    const save = await saveWithKeyboard(page);
    assert.equal(save.status, 200);
    await waitReloaded(page);
    assert.equal(served.read('flow.md'), ORIGINAL.replace(FENCE, changed), 'the file holds the new fence and nothing else');
    const label = await page.locator('figure.diagram[data-src="10-13"]').textContent();
    assert.match(label, /Render the diagram/, 'the diagram shows the new label after reload');
    assert.doesNotMatch(label, /Render the page/);
    assert.deepEqual(errors, []);
  });
});

test('D6.2: a save that leaves a pele error is refused with the error in the panel, and the file is unchanged', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'flow.md');
    t.after(close);
    const before = served.read('flow.md');
    await openDiagramEdit(page, '10-13', 'Edit diagram, lines 10–13');
    // An edge with no target: pele cannot draw it.
    const typed = '```mermaid\nflowchart LR\n  A[Write the doc] --> \n```';
    await typeIntoPanel(page, typed);
    const save = await saveWithKeyboard(page);
    assert.equal(save.status, 422);
    const alert = page.locator('.edit-panel-errors[role="alert"]');
    await alert.waitFor();
    const message = await alert.textContent();
    // The fence opens on line 10 and the bad edge is its content line 2, so pele's error is reported at line 12 (D2.1).
    assert.match(message, /flow\.md:12: mermaid syntax: Parse error on line 2/, 'the error names the doc line and pele\'s message');
    assert.equal(await page.locator('.edit-panel-text').inputValue(), typed, 'the typed text stays in the panel');
    assert.equal(await page.locator('.edit-panel:not([hidden])').count(), 1, 'the panel stays open');
    assert.equal(served.read('flow.md'), before, 'the file is unchanged, byte for byte');
    assert.deepEqual(errors, []);
  });
});
