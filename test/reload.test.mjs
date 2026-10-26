// Live reload tests (T7, spec R7.2 to R7.5, acceptance A6, A7 and A11). Real keyboard and mouse input in installed
// Chrome. External writes go to the served temp copy with plain file writes, as an editor or an agent would make them.
// Timings are measured from the write (or keypress) to the reloaded page's `margent` being ready. Run `npm run build`
// first (or `npm test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { islandFrameByName, islandsSettled, withBrowser } from './helpers/browser.mjs';
import { openServedPage, serveCopy } from './helpers/serve-page.mjs';
import { MARGENT_CORPUS } from './helpers/corpus.mjs';
import { full } from './helpers/tier.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(REPO, 'test', 'fixtures', 'panel', 'docs');
const ORIGINAL = readFileSync(join(FIXTURE, 'panel.md'), 'utf8');
const INTRO = 'Intro paragraph for the panel tests.';

// A served copy of the fixture, closed when the test ends.
async function site(t) {
  const served = await serveCopy(FIXTURE);
  t.after(() => served.close());
  return served;
}

// Resolves when the page has reloaded: the marker set before the change is gone and the runtime is up.
async function waitReloaded(page) {
  await page.waitForFunction(() => window.margent !== undefined && window.__marker === undefined, null, {
    timeout: 5000,
  });
}

async function setMarker(page) {
  await page.evaluate(() => {
    window.__marker = 'survives-if-no-reload';
  });
}

async function openEdit(page, blockRange, name) {
  await page.locator(`[data-src="${blockRange}"]`).hover();
  await page.getByRole('button', { name, exact: true }).click();
  await page.locator('.edit-panel:not([hidden]) .edit-panel-text').waitFor();
}

async function typeIntoPanel(page, text) {
  await page.locator('.edit-panel-text').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
}

const elapsedMs = (from) => Number(process.hrtime.bigint() - from) / 1e6;

test('A6: an external write holds the reload under a banner; saving then gets 409 and the text reopens after the reload', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    await openEdit(page, '10-13', 'Edit table, lines 10–13');
    await typeIntoPanel(page, '| Item | Count |\n|---|---|\n| alpha | 9 |');
    await setMarker(page);

    const external = ORIGINAL.replace(INTRO, 'Intro, changed by an external write.');
    writeFileSync(join(served.root, 'panel.md'), external);
    const banner = page.locator('.edit-banner[data-kind="changed"]');
    await banner.waitFor();
    const message = await banner.textContent();
    assert.match(message, /changed on disk/);
    assert.match(message, /refused as stale/);
    assert.match(message, /Cancel the edit to reload/);

    // The page did not reload: the marker is still there, and the panel still holds the typed text.
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.__marker), 'survives-if-no-reload');
    assert.equal(await page.locator('.edit-panel-text').inputValue(), '| Item | Count |\n|---|---|\n| alpha | 9 |');

    const response = page.waitForResponse((r) => r.url().endsWith('/_save') && r.request().method() === 'POST');
    await page.keyboard.press('ControlOrMeta+s');
    assert.equal((await response).status(), 409);
    await waitReloaded(page);

    assert.equal(served.read('panel.md'), external, 'the file holds only the external write');
    const panelText = page.locator('.edit-panel:not([hidden]) .edit-panel-text');
    await panelText.waitFor();
    assert.equal(await panelText.inputValue(), '| Item | Count |\n|---|---|\n| alpha | 9 |');
    assert.match(await page.locator('.edit-panel-notice').textContent(), /lines 10–13/);
    assert.deepEqual(errors, []);
  });
});

test('R7.3: cancelling a held edit releases the reload', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    await openEdit(page, '26-26', 'Edit blockquote, lines 26–26');
    await typeIntoPanel(page, '> Typed, then cancelled.');
    await setMarker(page);
    const external = ORIGINAL.replace(INTRO, 'Released by cancel.');
    writeFileSync(join(served.root, 'panel.md'), external);
    await page.locator('.edit-banner[data-kind="changed"]').waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await waitReloaded(page);
    assert.equal(await page.locator('.edit-banner').count(), 0);
    assert.equal(await page.locator('.edit-panel:not([hidden])').count(), 0);
    assert.match(await page.locator('.intro, p').first().textContent(), /Released by cancel|Intro|/);
    assert.deepEqual(errors, []);
  });
});

test('A7: external edits to the .md, the island module and the SVG each reload within 1 second, keeping scroll', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md', {
      viewport: { width: 1000, height: 300 },
    });
    t.after(close);
    await page.evaluate(() => window.scrollTo(0, 260));
    await page.waitForFunction(() => window.scrollY > 100);
    const scrollBefore = await page.evaluate(() => window.scrollY);

    // 1. The served .md.
    await setMarker(page);
    let start = process.hrtime.bigint();
    writeFileSync(join(served.root, 'panel.md'), ORIGINAL.replace(INTRO, 'Intro after an edit to the md.'));
    await waitReloaded(page);
    let ms = elapsedMs(start);
    console.log(`A7 md reload ms: ${ms.toFixed(0)}`);
    assert.ok(ms < 1000, `md reload took ${ms.toFixed(0)} ms`);
    assert.match(await page.locator('body').textContent(), /Intro after an edit to the md/);
    const scrollMd = await page.evaluate(() => window.scrollY);
    assert.ok(Math.abs(scrollMd - scrollBefore) <= 4, `scroll ${scrollBefore} became ${scrollMd}`);

    // 2. The island module the page uses. The fixture's island has no data-v, so the change is visible in the shadow.
    const islandPath = join(served.root, 'islands', 'tally.island.js');
    const island = readFileSync(islandPath, 'utf8');
    assert.ok(island.includes('<ul>${'), 'test setup: the island renders a <ul>');
    await setMarker(page);
    start = process.hrtime.bigint();
    writeFileSync(islandPath, island.replace('<ul>${', '<ul data-v="2">${'));
    await waitReloaded(page);
    ms = elapsedMs(start);
    console.log(`A7 island reload ms: ${ms.toFixed(0)}`);
    assert.ok(ms < 1000, `island reload took ${ms.toFixed(0)} ms`);
    // The island's shadow content lives inside its srcdoc frame (M5 R3).
    const islandV = await (await islandFrameByName(page, 'tally')).evaluate(() => {
      const host = [...document.body.children].find((e) => e.shadowRoot);
      return host.shadowRoot.querySelector('ul').getAttribute('data-v');
    });
    assert.equal(islandV, '2');
    const scrollIsland = await page.evaluate(() => window.scrollY);
    assert.ok(Math.abs(scrollIsland - scrollBefore) <= 4, `scroll ${scrollBefore} became ${scrollIsland}`);

    // 3. The SVG the page inlines.
    const svgPath = join(served.root, 'chart.svg');
    const svg = readFileSync(svgPath, 'utf8');
    await setMarker(page);
    start = process.hrtime.bigint();
    writeFileSync(svgPath, svg.replace('#0062a8', '#00aa00'));
    await waitReloaded(page);
    ms = elapsedMs(start);
    console.log(`A7 svg reload ms: ${ms.toFixed(0)}`);
    assert.ok(ms < 1000, `svg reload took ${ms.toFixed(0)} ms`);
    assert.equal(await page.locator('figure svg rect').getAttribute('fill'), '#00aa00');
    const scrollSvg = await page.evaluate(() => window.scrollY);
    assert.ok(Math.abs(scrollSvg - scrollBefore) <= 4, `scroll ${scrollBefore} became ${scrollSvg}`);
    assert.deepEqual(errors, []);
  });
});

test('A7: a broken .md shows the error page with file:line, and fixing it brings the page back with no manual reload', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    // An island that names a missing module still fails in Node, so the page is an error page (M5 R1.2). A schema
    // error would not: it renders inside the island's frame instead.
    const broken = ORIGINAL.replace('<!-- island tally -->', '<!-- island nosuch -->');
    assert.notEqual(broken, ORIGINAL, 'test setup: line 19 is the tally island comment');
    writeFileSync(join(served.root, 'panel.md'), broken);
    const errorBox = page.locator('.render-errors');
    await errorBox.waitFor({ timeout: 5000 });
    assert.match(await errorBox.textContent(), /panel\.md:19: island "nosuch" has no module islands\/nosuch/);
    assert.match(await page.locator('h1').textContent(), /did not render/);

    const start = process.hrtime.bigint();
    writeFileSync(join(served.root, 'panel.md'), ORIGINAL);
    await page.waitForFunction(() => window.margent !== undefined, null, { timeout: 5000 });
    const ms = elapsedMs(start);
    console.log(`A7 broken-md recovery ms: ${ms.toFixed(0)}`);
    assert.ok(ms < 1000, `recovery took ${ms.toFixed(0)} ms`);
    assert.match(await page.locator('[data-src="19-22"]').textContent(), /Proceed/);
  });
});

test('R7.1: a save reloads the saving page once: the change event for its own write is not sent', async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    let navigations = 0;
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) navigations++;
    });
    await setMarker(page);
    const intro = page.locator('p', { hasText: INTRO });
    await intro.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Saved once.');
    await page.keyboard.press('ControlOrMeta+s');
    await waitReloaded(page);
    // Well past the server's 50 ms debounce and the watcher's delivery.
    await page.waitForTimeout(1000);
    assert.equal(navigations, 1);
    assert.equal(served.read('panel.md'), ORIGINAL.replace(INTRO, `${INTRO} Saved once.`));
    assert.deepEqual(errors, []);
  });
});

test('decision 0038: a changed margent script shows the out-of-date banner without reloading the page', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'margent-self-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const self = join(dir, 'cli.js');
  writeFileSync(self, 'v1\n');
  const served = await serveCopy(FIXTURE, { self });
  t.after(() => served.close());
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    await setMarker(page);
    writeFileSync(self, 'v2\n');
    const banner = page.locator('.edit-banner[data-kind="outdated"]');
    await banner.waitFor({ timeout: 5000 });
    assert.equal(
      await banner.textContent(),
      'margent was updated after this server started, so this page shows the old version. Restart margent serve, then reload the page.'
    );
    assert.equal(await banner.getAttribute('role'), 'status');
    assert.equal(await page.evaluate(() => window.__marker), 'survives-if-no-reload');
    assert.deepEqual(errors, []);
  });
});

test('R7.5: a lost live stream is shown in a banner and logged, not swallowed', full, async (t) => {
  const served = await serveCopy(FIXTURE);
  // The test stops the server itself. Until it has, t.after closes it, so a page that fails to open cannot leak it.
  let stopped = false;
  t.after(() => (stopped ? rmSync(served.root, { recursive: true, force: true }) : served.close()));
  await withBrowser(async (browser) => {
    const { page, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    await served.server.close();
    stopped = true;
    const banner = page.locator('.edit-banner[data-kind="connection"]');
    await banner.waitFor({ timeout: 10000 });
    assert.match(await banner.textContent(), /Live reload/);
  });
});

test('R7.3: margent.reload() holds while text is unsaved, as a changed event does', async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    await openEdit(page, '10-13', 'Edit table, lines 10–13');
    await typeIntoPanel(page, '| Item | Count |\n|---|---|\n| typed | 0 |');
    await setMarker(page);
    await page.evaluate(() => window.margent.reload());
    await page.locator('.edit-banner[data-kind="changed"]').waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__marker), 'survives-if-no-reload');
    assert.equal(await page.locator('.edit-panel-text').inputValue(), '| Item | Count |\n|---|---|\n| typed | 0 |');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await waitReloaded(page);
    assert.deepEqual(errors, []);
  });
});

test('R7.3: a navigation away with unsaved text asks first, and dismissing the question keeps the text', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    await openEdit(page, '10-13', 'Edit table, lines 10–13');
    await typeIntoPanel(page, '| Item | Count |\n|---|---|\n| kept | 1 |');
    await setMarker(page);
    const dialogs = [];
    page.on('dialog', (d) => {
      dialogs.push(d.type());
      d.dismiss();
    });
    await page.evaluate(() => {
      location.assign('/elsewhere.html');
    });
    for (let i = 0; i < 100 && dialogs.length === 0; i++) await page.waitForTimeout(20);
    assert.deepEqual(dialogs, ['beforeunload']);
    assert.equal(await page.evaluate(() => window.__marker), 'survives-if-no-reload', 'the navigation was cancelled');
    assert.equal(await page.locator('.edit-panel-text').inputValue(), '| Item | Count |\n|---|---|\n| kept | 1 |');
    assert.deepEqual(errors, []);
  });
});

// Island heights are remembered per page, so a reload starts each frame at its last height (host.js). These tests are
// about layout, not timing: the shift is measured by the browser's layout-shift entries.
const SHIFT_INIT = `
  window.__shift = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__shift += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
  // What each island's frame looked like when the document was parsed: reserved, and at what height.
  document.addEventListener('DOMContentLoaded', () => {
    window.__atStart = [...document.querySelectorAll('agent-island')].map((el) => ({
      reserved: el.hasAttribute('data-reserved'),
      height: el.querySelector('iframe') ? el.querySelector('iframe').style.height : null,
    }));
  });
`;

async function islandBoxHeights(page) {
  return page.evaluate(() => [...document.querySelectorAll('agent-island iframe')].map((f) => f.getBoundingClientRect().height));
}

test('R3.6: a reload starts each island at its remembered height, with no layout shift', async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md', { initScript: SHIFT_INIT });
    t.after(close);
    const first = await islandBoxHeights(page);
    assert.ok(first.length > 0 && first.every((h) => h > 0), `first load heights: ${first}`);

    await page.reload();
    await page.waitForFunction(() => window.margent !== undefined);
    await islandsSettled(page);
    const atStart = await page.evaluate(() => window.__atStart);
    assert.equal(atStart.length, first.length);
    atStart.forEach((s, i) => {
      assert.equal(s.reserved, true, `island ${i} was not reserved at parse`);
      assert.ok(Math.abs(parseFloat(s.height) - first[i]) < 1, `island ${i} started at ${s.height}, was ${first[i]}`);
    });
    assert.deepEqual(await islandBoxHeights(page), first);
    assert.ok((await page.evaluate(() => window.__shift)) < 0.01, `layout shift ${await page.evaluate(() => window.__shift)}`);
    assert.deepEqual(errors, []);
  });
});

test('R3.6: an island that errors after a remembered height shows its fallback again, not a reserved box', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    assert.ok((await islandBoxHeights(page)).every((h) => h > 0), 'test setup: the height was remembered');

    // The module throws when it loads. serve reloads the page on the change, and the page must then show the error.
    const islandPath = join(served.root, 'islands', 'tally.island.js');
    writeFileSync(islandPath, `throw new Error('tally broke at load');\n` + readFileSync(islandPath, 'utf8'));
    await page.waitForFunction(() => window.margent !== undefined &&
      document.querySelector('agent-island')?.getAttribute('data-state') === 'error', null, { timeout: 10000 });
    await islandsSettled(page);
    const island = page.locator('agent-island[name="tally"]');
    assert.equal(await island.getAttribute('data-state'), 'error');
    assert.equal(await island.getAttribute('data-reserved'), null);
    const display = await island.locator(':scope > .island-fallback').evaluate((el) => getComputedStyle(el).display);
    assert.notEqual(display, 'none', 'the fallback is visible after the error');
    assert.match(await island.getAttribute('data-error'), /tally broke at load/);
    assert.deepEqual(errors.filter((e) => !/tally broke/.test(e)), []);
  });
});

test('R3.6: when sessionStorage is blocked the islands still render, and the warning is logged once', full, async (t) => {
  const served = await site(t);
  // Records every console.warn the page makes, from the first script on.
  const WARN_INIT = `
    window.__warns = [];
    const warn = console.warn.bind(console);
    console.warn = (...args) => { window.__warns.push(String(args[0])); warn(...args); };
    Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } });
  `;
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openServedPage(browser, served, 'panel.md', { initScript: WARN_INIT });
    t.after(close);
    await page.reload();
    await page.waitForFunction(() => window.margent !== undefined);
    await islandsSettled(page);
    assert.deepEqual(await page.locator('agent-island').evaluateAll((els) => els.map((e) => e.getAttribute('data-state'))), ['rendered']);
    const warnings = await page.evaluate(() => window.__warns.filter((m) => m.includes('island heights could not be remembered')));
    assert.equal(warnings.length, 1, `warnings: ${warnings}`);
    assert.match(warnings[0], /island heights could not be remembered \(blocked\)\./);
    // The edit runtime's reload.js throws on blocked storage too (its own error, not this feature's). Only that is excused.
    assert.deepEqual(errors.filter((e) => !/could not read the unsaved text kept across the reload/.test(e)), []);
  });
});

test('R3.6: a guest that never reports drops the reserved box after the state wait, and the fallback shows again', full, async (t) => {
  const served = await site(t);
  await withBrowser(async (browser) => {
    const { page, close } = await openServedPage(browser, served, 'panel.md');
    t.after(close);
    assert.ok((await islandBoxHeights(page)).every((h) => h > 0), 'test setup: the height was remembered');

    // The guest runtime's text no longer matches its script-src hash in the page policy (as cli.test.mjs does on disk),
    // so the frame never runs it. The page is changed on the way from the server.
    await page.route('**/panel.html', async (route) => {
      const response = await route.fetch();
      const text = await response.text();
      const start = text.indexOf('id="margent-guest-runtime"');
      const marker = "'use strict';";
      const at = text.indexOf(marker, start);
      assert.ok(start >= 0 && at > start, 'test setup: the page carries the guest runtime');
      await route.fulfill({ response, body: text.slice(0, at) + "'use strict'; " + text.slice(at + marker.length) });
    });
    await page.reload();
    await page.waitForFunction(() => window.margent !== undefined);
    // The state wait is 10 s in host.js, so the island gives up after that.
    await page.waitForTimeout(11000);
    const island = page.locator('agent-island[name="tally"]');
    assert.equal(await island.getAttribute('data-state'), null, 'the guest never reported a state');
    assert.equal(await island.getAttribute('data-reserved'), null);
    const display = await island.locator(':scope > .island-fallback').evaluate((el) => getComputedStyle(el).display);
    assert.notEqual(display, 'none', 'the fallback is visible again');
    assert.equal(await island.locator('iframe').evaluate((f) => f.style.height), '0px');
  });
});

// A11: an edit of system-design.md saves and reloads in under 500 ms (R7.5). Each run is one panel save of a table,
// keypress to the reloaded page. The frozen margent docs are copied, never written.
test('A11: panel save of a table in the margent design/system-design.md reloads under 500 ms (median of 5)', full, async (t) => {
  const served = await serveCopy(MARGENT_CORPUS);
  t.after(() => served.close());
  await withBrowser(async (browser) => {
    const { page, close } = await openServedPage(browser, served, 'design/system-design.md');
    t.after(close);
    const times = [];
    for (let run = 0; run < 5; run++) {
      const control = page.locator('.edit-control[aria-label^="Edit table"]').first();
      const label = await control.getAttribute('aria-label');
      const range = await control.evaluate((el) => el.closest('[data-src]').getAttribute('data-src'));
      await page.locator(`[data-src="${range}"]`).hover();
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.locator('.edit-panel:not([hidden]) .edit-panel-text').waitFor();
      await page.locator('.edit-panel-text').click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.type(' ');
      await setMarker(page);
      const response = page.waitForResponse((r) => r.url().endsWith('/_save') && r.request().method() === 'POST');
      const start = process.hrtime.bigint();
      await page.keyboard.press('ControlOrMeta+s');
      assert.equal((await response).status(), 200, `run ${run}: save of ${range} was not 200`);
      await waitReloaded(page);
      times.push(elapsedMs(start));
    }
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[2];
    console.log(`A11 keypress to reloaded page, ms: ${times.map((x) => x.toFixed(0)).join(', ')} (median ${median.toFixed(0)})`);
    assert.ok(median < 500, `median ${median.toFixed(0)} ms is not under 500 ms`);
  });
});
