// Runtime tests for the island kit, the sandboxed frame (guest and host) and the theme toggle. Browser checks use Chrome
// via playwright-core and read each island inside its frame (M5 T3); kit checks run runtime/kit.js in an empty node:vm
// context, as `check` does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { openPage, withBrowser, islandInfo, islandFrame, clickCandidates, clickCandidate } from './helpers/browser.mjs';
import { buildPage, DUMMY_ISLANDS, BARS_DATA, BARS_FALLBACK } from './fixtures/runtime/build.mjs';
import { full } from './helpers/tier.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = join(HERE, '..', 'runtime');
const FIXTURES = join(HERE, 'fixtures', 'runtime');

// Island heights measured in the island-height spike (since removed; 1000x900, light scheme): 123 for bars and 126 for steps.
const S4_HEIGHT = { bars: 123, steps: 126 };
const HEIGHT_TOL = 2;

const workdir = mkdtempSync(join(tmpdir(), 'margent-runtime-'));
function writePage(name, html) {
  const file = join(workdir, name);
  writeFileSync(file, html);
  return file;
}
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

function readRuntimeFile(name) {
  return readFileSync(join(RUNTIME, name), 'utf8');
}

// Index of the island named `name`, in document order.
async function indexOf(page, name) {
  const names = await page.$$eval('agent-island', (els) => els.map((e) => e.getAttribute('name')));
  const i = names.indexOf(name);
  assert.ok(i >= 0, `no island "${name}"`);
  return i;
}

// Computed style of an element inside island `name`'s guest shadow root, read in its frame.
async function guestStyle(page, name, selector, prop) {
  const frame = await islandFrame(page, await indexOf(page, name));
  return frame.evaluate(([selector, prop]) => {
    const host = [...document.body.children].find((e) => e.shadowRoot);
    return getComputedStyle(host.shadowRoot.querySelector(selector))[prop];
  }, [selector, prop]);
}

// Bars data whose count column has two cells that break its pattern: "<b>3O</b>" (row 2) and "x7" (row 3).
const PATTERNED_DATA = {
  columns: BARS_DATA.columns,
  rows: [
    { item: 'Alpha', count: '12', note: '' },
    { item: 'Beta', count: '<b>3O</b>', note: '' },
    { item: 'Gamma', count: 'x7', note: '' }
  ],
  attrs: {}
};

// ---- browser: dummy islands

test('dummy islands render in their frames with no errors, nothing clipped, and S4 heights', async () => {
  const file = writePage('dummy.html', buildPage({ islands: DUMMY_ISLANDS }));
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openPage(browser, file);
    try {
      const info = await islandInfo(page);
      assert.deepEqual(info.map((i) => i.name), ['bars', 'steps']);
      for (const i of info) {
        assert.equal(i.state, 'rendered', `${i.name} state`);
        assert.equal(i.errorBox, false, `${i.name} error box`);
        assert.ok(i.textLength > 0, `${i.name} has text`);
        assert.deepEqual(i.clipped, [], `${i.name} clipped at rest`);
        assert.ok(
          Math.abs(i.height - S4_HEIGHT[i.name]) <= HEIGHT_TOL,
          `${i.name} height ${i.height} vs S4 ${S4_HEIGHT[i.name]}`
        );
      }
      // A link click opens a real tab through the page's open handler. Left open, it starves the next clicks when the
      // machine is loaded. The link path has its own test (window.open is recorded below), so close each tab as it opens.
      page.context().on('page', (tab) => tab.close());
      // Interact with every candidate; the islands must keep working without errors.
      for (let i = 0; i < info.length; i++) {
        const candidates = await clickCandidates(page, i);
        assert.ok(candidates.length > 0, `${info[i].name} has click targets`);
        for (let c = 0; c < candidates.length; c++) {
          await clickCandidate(page, i, c);
        }
      }
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });
});

test('each island is a sandboxed frame with a srcdoc, a title and no same-origin access', full, async () => {
  const file = writePage('frames.html', buildPage({ islands: DUMMY_ISLANDS }));
  await withBrowser(async (browser) => {
    const { page, close } = await openPage(browser, file);
    try {
      const frames = await page.$$eval('agent-island iframe', (els) => els.map((f) => ({
        sandbox: f.getAttribute('sandbox'),
        title: f.getAttribute('title'),
        hasSrcdoc: f.hasAttribute('srcdoc') || f.srcdoc.length > 0,
        inMount: f.parentElement.classList.contains('island-mount')
      })));
      assert.deepEqual(frames, [
        { sandbox: 'allow-scripts', title: 'bars', hasSrcdoc: true, inMount: true },
        { sandbox: 'allow-scripts', title: 'steps', hasSrcdoc: true, inMount: true }
      ]);
    } finally {
      await close();
    }
  });
});

test('theme toggle flips data-theme, restyles guest content and fires onTheme', full, async () => {
  const file = writePage('theme.html', buildPage({ islands: DUMMY_ISLANDS }));
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openPage(browser, file);
    try {
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), null);
      assert.equal(await page.textContent('#theme-toggle'), 'Dark');
      assert.equal(await guestStyle(page, 'bars', '.item', 'color'), 'rgb(10, 10, 10)');
      assert.equal(await guestStyle(page, 'steps', '.swatch', 'backgroundColor'), 'rgb(0, 98, 168)');

      await page.click('#theme-toggle');
      await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
      // Tokens reach each frame by message, so wait for the swatch set by kit.onTheme.
      const steps = await islandFrame(page, await indexOf(page, 'steps'));
      await steps.waitForFunction(() => {
        const host = [...document.body.children].find((e) => e.shadowRoot);
        return getComputedStyle(host.shadowRoot.querySelector('.swatch')).backgroundColor === 'rgb(90, 174, 232)';
      });
      assert.equal(await page.textContent('#theme-toggle'), 'Light');
      assert.equal(await page.getAttribute('#theme-toggle', 'aria-label'), 'Switch to light theme');
      assert.equal(await guestStyle(page, 'bars', '.item', 'color'), 'rgb(242, 242, 242)');
      // The frame's color scheme follows the page, so an empty frame is not painted white.
      assert.equal(await steps.evaluate(() => document.documentElement.style.colorScheme), 'dark');

      await page.click('#theme-toggle');
      await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light');
      const bars = await islandFrame(page, await indexOf(page, 'bars'));
      await bars.waitForFunction(() => {
        const host = [...document.body.children].find((e) => e.shadowRoot);
        return getComputedStyle(host.shadowRoot.querySelector('.item')).color === 'rgb(10, 10, 10)';
      });
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });
});

test('a render that throws shows the error box in the frame, the data-error, and the fallback', full, async () => {
  const file = writePage('throws.html', buildPage({
    islands: [{ name: 'throws', data: { title: 'x' }, fallback: '<p>Fallback text for the throws island</p>' }]
  }));
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openPage(browser, file);
    try {
      const [info] = await islandInfo(page);
      assert.equal(info.state, 'error');
      assert.equal(info.errorBox, true);
      assert.equal(await page.getAttribute('agent-island', 'data-error'), 'island throws: boom from the throws fixture island');
      const frame = await islandFrame(page, 0);
      const box = await frame.evaluate(() => {
        const host = [...document.body.children].find((e) => e.shadowRoot);
        return host.shadowRoot.querySelector('[data-island-error]').textContent;
      });
      assert.match(box, /island "throws" failed/);
      assert.match(box, /boom from the throws fixture island/);
      assert.equal(await page.locator('agent-island .island-fallback').isVisible(), true);
      assert.equal(await page.locator('agent-island .island-fallback p').isVisible(), true);
      // The failure is logged. Every reported error must be about this island.
      assert.ok(errors.length > 0, 'the failure is logged to the console');
      for (const e of errors) assert.match(e, /throws/, `unexpected error: ${e}`);
    } finally {
      await close();
    }
  });
});

test('cells that break a column pattern show a badge, set data-mismatches, and the island still renders (A5)', full, async () => {
  const file = writePage('mismatch.html', buildPage({
    islands: [{ name: 'patterned', data: PATTERNED_DATA, fallback: BARS_FALLBACK }]
  }));
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openPage(browser, file);
    try {
      const [info] = await islandInfo(page);
      assert.equal(info.state, 'rendered');
      assert.match(info.badge, /2 cells do not match their column patterns/);
      assert.match(info.badge, /row 2, count: "<b>3O<\/b>"/);
      assert.match(info.badge, /row 3, count: "x7"/);
      assert.deepEqual(
        JSON.parse(await page.getAttribute('agent-island', 'data-mismatches')),
        [{ row: 1, column: 'count', text: '<b>3O</b>' }, { row: 2, column: 'count', text: 'x7' }]
      );
      const badgeHasBold = await page.evaluate(() => !!document.querySelector('agent-island > .island-badge b'));
      assert.equal(badgeHasBold, false, 'cell text is escaped, not parsed as markup');
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });
});

test('with JavaScript disabled the fallback tables show', async () => {
  const file = writePage('nojs.html', buildPage({ islands: DUMMY_ISLANDS }));
  await withBrowser(async (browser) => {
    const { page, close } = await openPage(browser, file, { javaScriptEnabled: false });
    try {
      assert.equal(await page.locator('agent-island').count(), 2);
      assert.equal(await page.getAttribute('agent-island[name="bars"]', 'data-state'), null);
      const table = page.locator('agent-island[name="bars"] .island-fallback table');
      assert.equal(await table.isVisible(), true);
      assert.match(await table.textContent(), /Alpha/);
      assert.equal(await page.locator('agent-island[name="steps"] .island-fallback pre').isVisible(), true);
    } finally {
      await close();
    }
  });
});

test('print shows the fallback and hides the frame mount and badge', full, async () => {
  const file = writePage('print.html', buildPage({
    islands: [{ name: 'patterned', data: PATTERNED_DATA, fallback: BARS_FALLBACK }]
  }));
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openPage(browser, file);
    try {
      await page.emulateMedia({ media: 'print' });
      const display = await page.evaluate(() => ({
        mount: getComputedStyle(document.querySelector('agent-island > .island-mount')).display,
        badge: getComputedStyle(document.querySelector('agent-island > .island-badge')).display,
        fallback: getComputedStyle(document.querySelector('agent-island > .island-fallback')).display
      }));
      assert.deepEqual(display, { mount: 'none', badge: 'none', fallback: 'block' });
      assert.equal(await page.locator('agent-island .island-fallback table').isVisible(), true);
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });
});

test('the guest cannot reach the page, cookies or the network: every probe is blocked', async () => {
  const file = writePage('probe.html', buildPage({
    islands: [{ name: 'probe', data: {}, fallback: '<p>probe</p>' }]
  }));
  await withBrowser(async (browser) => {
    const { page, close } = await openPage(browser, file);
    try {
      const frame = await islandFrame(page, 0);
      const probeText = () => {
        const host = [...document.body.children].find((e) => e.shadowRoot);
        return host.shadowRoot.querySelector('[data-probe]')?.textContent ?? '';
      };
      await frame.waitForFunction(() => {
        const host = [...document.body.children].find((e) => e.shadowRoot);
        return /fetch: /.test(host.shadowRoot.querySelector('[data-probe]')?.textContent ?? '');
      });
      const lines = (await frame.evaluate(probeText)).split('\n');
      assert.equal(lines.length, 5, lines.join(' | '));
      for (const line of lines) {
        assert.doesNotMatch(line, /reached/, `reached: ${line}`);
        assert.match(line, /blocked|empty/, line);
      }
      assert.ok(lines.some((l) => l.startsWith('fetch: blocked')), lines.join(' | '));
      assert.equal(await page.evaluate(() => document.title), 'Runtime fixture', 'the page is untouched');
    } finally {
      await close();
    }
  });
});

test('a link in an island opens a new tab with noopener, and a javascript: link opens nothing', full, async () => {
  const file = writePage('links.html', buildPage({
    islands: [{ name: 'links', data: {}, fallback: '<p>links</p>' }]
  }));
  await withBrowser(async (browser) => {
    const { page, close } = await openPage(browser, file);
    const context = page.context();
    let opened = 0;
    context.on('page', () => { opened += 1; });
    try {
      // Record the page's own window.open calls (the page opens links; the guest never does).
      await page.evaluate(() => {
        window.__opens = [];
        const open = window.open.bind(window);
        window.open = (...args) => { window.__opens.push(args); return open(...args); };
      });
      const frame = await islandFrame(page, 0);
      await frame.locator('a', { hasText: 'Run script' }).click();
      await page.waitForTimeout(800);
      assert.equal(opened, 0, 'a javascript: URL opens no tab');
      assert.deepEqual(await page.evaluate(() => window.__opens), [], 'a javascript: URL never reaches window.open');
      assert.equal(await frame.evaluate(() => window.__ran === true), false, 'the script link does not run');

      const newPage = context.waitForEvent('page', { timeout: 5000 });
      await frame.locator('a', { hasText: 'Open the doc' }).click();
      const tab = await newPage;
      assert.equal(opened, 1, 'one tab opened');
      assert.deepEqual(await page.evaluate(() => window.__opens), [['https://example.com/doc', '_blank', 'noopener']]);
      assert.match(tab.url(), /^https:\/\/example\.com\/doc|^about:blank$/, 'the tab is the link target');
      await tab.close();
    } finally {
      await close();
    }
  });
});

test('window.margentIslands.report() lists each island, and measures overflow at the frame width', full, async () => {
  const file = writePage('report.html', buildPage({ islands: DUMMY_ISLANDS }));
  await withBrowser(async (browser) => {
    const { page, close } = await openPage(browser, file);
    try {
      const report = await page.evaluate(() => window.margentIslands.report());
      assert.deepEqual(report.map((r) => r.name), ['bars', 'steps']);
      for (const r of report) {
        assert.equal(r.state, 'rendered', `${r.name} state`);
        assert.equal(r.error, null, `${r.name} error`);
        assert.deepEqual(r.mismatches, [], `${r.name} mismatches`);
        assert.equal(r.overflow, null, `${r.name} overflow`);
      }
    } finally {
      await close();
    }
  });

  // A 600px grid in a phone-width frame spills out of its box (contract rule 4).
  const wide = writePage('wide.html', buildPage({ islands: [{ name: 'wide', data: {}, fallback: '<p>wide</p>' }] }));
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openPage(browser, wide, { viewport: { width: 390, height: 900 } });
    try {
      const [report] = await page.evaluate(() => window.margentIslands.report());
      assert.equal(report.state, 'rendered');
      assert.equal(report.overflow.side, 'right');
      assert.ok(report.overflow.px > 0, `px ${report.overflow.px}`);
      assert.match(report.overflow.description, /^div/);
      assert.match(await page.getAttribute('agent-island', 'data-overflow'), /"side":"right"/);
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });
});

test('a text selection in an island reaches the page as margent:island-selection, with its rect', full, async () => {
  const file = writePage('selection.html', buildPage({ islands: DUMMY_ISLANDS }));
  await withBrowser(async (browser) => {
    const { page, close } = await openPage(browser, file);
    try {
      await page.evaluate(() => {
        window.__selection = null;
        document.querySelector('agent-island[name="bars"]').addEventListener('margent:island-selection', (e) => {
          window.__selection = e.detail;
        });
      });
      // Select the first cell's text inside the guest's shadow root, then release the pointer.
      const frame = await islandFrame(page, await indexOf(page, 'bars'));
      await frame.evaluate(() => {
        const host = [...document.body.children].find((e) => e.shadowRoot);
        const cell = host.shadowRoot.querySelector('.item') ?? host.shadowRoot.querySelector('*:not(style):not(script)');
        const range = document.createRange();
        range.selectNodeContents(cell);
        const sel = host.shadowRoot.getSelection ? host.shadowRoot.getSelection() : document.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      });
      await page.waitForFunction(() => window.__selection !== null, null, { timeout: 3000 });
      const detail = await page.evaluate(() => window.__selection);
      assert.ok(detail.text.length > 0, 'the selected text is sent');
      assert.ok(detail.rect && detail.rect.width > 0, 'the rect is sent, in page coordinates');
      const bars = await page.evaluate(() => {
        const r = document.querySelector('agent-island[name="bars"] iframe').getBoundingClientRect();
        return { left: r.left, top: r.top };
      });
      assert.ok(detail.rect.left >= bars.left && detail.rect.top >= bars.top, 'the rect lies inside the frame');
    } finally {
      await close();
    }
  });
});

test('margentIslands.mark highlights the phrase in the guest with the CSS Highlight API', full, async () => {
  const file = writePage('mark.html', buildPage({ islands: DUMMY_ISLANDS }));
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openPage(browser, file);
    try {
      const frame = await islandFrame(page, await indexOf(page, 'bars'));
      await page.evaluate(() => {
        const el = document.querySelector('agent-island[name="bars"]');
        window.margentIslands.mark(el, 'Alpha');
      });
      await frame.waitForFunction(() => CSS.highlights.has('margent-quote'));
      assert.equal(await frame.evaluate(() => CSS.highlights.get('margent-quote').size), 1, 'one occurrence of Alpha');
      await page.evaluate(() => window.margentIslands.mark(document.querySelector('agent-island[name="bars"]'), null));
      await frame.waitForFunction(() => !CSS.highlights.has('margent-quote'));
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });
});

// ---- node:vm: the kit, evaluated the way T5 uses it

function loadKit() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(readRuntimeFile('kit.js'), ctx, { filename: 'runtime/kit.js' });
  assert.ok(ctx.MargentKit, 'kit defines MargentKit');
  return { kit: ctx.MargentKit, ctx };
}
function fixtureSource(name) {
  return readFileSync(join(FIXTURES, 'islands', `${name}.island.js`), 'utf8');
}

test('kit evaluates in an empty vm context and wraps the dummy modules', () => {
  const { kit, ctx } = loadKit();
  assert.equal(kit.CONTRACT, 1);
  for (const name of ['bars', 'steps']) {
    const mod = vm.runInContext(kit.wrapModule(name, fixtureSource(name)), ctx);
    assert.equal(mod.contract, 1);
    assert.equal(typeof mod.render, 'function');
    assert.equal(mod.schema.type, 'object');
  }
  assert.throws(() => kit.wrapModule('bad', 'import x from "y";\nexport default function render() {}'), /may not import/);
  assert.throws(() => kit.wrapModule('bad', 'export const contract = 1;'), /must have `export default function render/);
  assert.throws(() => kit.wrapModule('bad', 'export default function render() {}\n</script>'), /script tag/);
});

test('validate reports type errors and rejects unsupported keywords', () => {
  const { kit, ctx } = loadKit();
  const { schema } = vm.runInContext(kit.wrapModule('bars', fixtureSource('bars')), ctx);
  assert.deepEqual([...kit.validate(schema, BARS_DATA)], []);

  const wrong = structuredClone(BARS_DATA);
  wrong.rows[0].count = 12;
  const errors = [...kit.validate(schema, wrong)];
  assert.deepEqual(errors, ['$.rows[0].count: expected string, got number']);

  assert.throws(() => kit.validate({ type: 'object', $ref: '#/x' }, {}), /schema keyword "\$ref" is not supported/);
  assert.throws(() => kit.validate({ type: 'object', properties: { a: { format: 'uri' } } }, {}), /schema keyword "format" is not supported/);
  assert.throws(() => kit.validate({ type: 'object', columns: { item: { pattern: '[' } } }, {}), /not a valid regular expression/);
  assert.throws(() => kit.validate({ type: 'object', columns: { item: { pattern: '^a$', extra: 1 } } }, {}), /only "pattern"/);
  assert.throws(() => kit.validate({ type: 'object', properties: { a: { columns: {} } } }, {}), /"columns" is not supported/);
  // A root columns map is accepted and not checked against data.
  assert.deepEqual([...kit.validate({ type: 'object', columns: { item: { pattern: '^\\d+$' } } }, { item: 'x' })], []);

  // Supported keywords behave as in JSON Schema.
  const strict = { type: 'object', properties: { a: { type: 'string', minLength: 2, maxLength: 3 } }, additionalProperties: false };
  assert.deepEqual([...kit.validate(strict, { a: 'x' })], ['$.a: shorter than 2 characters']);
  assert.deepEqual([...kit.validate(strict, { a: 'x', b: 1 })], ['$.a: shorter than 2 characters', '$: unexpected property "b"']);
  assert.deepEqual([...kit.validate({ type: 'array', contains: { const: 'k' } }, ['a'])], ['$: no item matches the contains schema']);
  assert.deepEqual([...kit.validate({ enum: ['go', 'stop'] }, 'warn')], ['$: must be one of ["go","stop"]']);
});

test('md, esc, fmt and tone behave as in contract v1', () => {
  const { kit } = loadKit();
  assert.equal(
    kit.md('**a** *b* `c<d>` [x](https://e.com) ~~s~~ \\$5'),
    '<strong>a</strong> <em>b</em> <code>c&lt;d&gt;</code> <a href="https://e.com">x</a> <s>s</s> $5'
  );
  // Non-http links lose their URL. (S4 leaves a stray ")" when the URL itself contains parentheses; kept as is.)
  assert.equal(kit.md('[bad](javascript:alert)'), 'bad');
  assert.equal(kit.md('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(kit.esc(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');

  assert.equal(kit.fmt.usd(3.8712), '$3.87');
  assert.equal(kit.fmt.usd(-3.5, 2), '-$3.50');
  assert.equal(kit.fmt.usd(1234.5, 0), '$1,235');
  assert.equal(kit.fmt.pct(0.4123), '41%');
  assert.equal(kit.fmt.pct(0.4123, 1), '41.2%');
  assert.equal(kit.fmt.num(4210), '4,210');

  assert.equal(kit.tone('go'), 'var(--green)');
  assert.equal(kit.tone('warn'), 'var(--amber)');
  assert.equal(kit.tone('stop'), 'var(--red)');
  assert.equal(kit.tone('done'), 'var(--accent)');
  assert.equal(kit.tone('neutral'), 'var(--text-muted)');
  assert.throws(() => kit.tone('loud'), /unknown tone "loud"/);
});

test('checkPatterns returns each mismatched cell in row order, and throws the check messages', () => {
  const { kit } = loadKit();
  const schema = { type: 'object', columns: { count: { pattern: '^\\d+$' } } };
  const data = {
    columns: [{ key: 'item', label: 'Item' }, { key: 'count', label: 'Count' }],
    rows: [{ item: 'a', count: '1' }, { item: 'b', count: 'x' }, { item: 'c', count: '22' }],
    attrs: {}
  };
  assert.deepEqual(JSON.parse(JSON.stringify(kit.checkPatterns('t', schema, 'table', data))), [{ row: 1, column: 'count', text: 'x' }]);
  assert.deepEqual(JSON.parse(JSON.stringify(kit.checkPatterns('t', { type: 'object' }, 'yaml', data))), []);
  assert.throws(() => kit.checkPatterns('t', schema, 'yaml', data), { message: 'island "t": column patterns apply only to table islands' });
  const missing = { type: 'object', columns: { verdict: { pattern: 'x' } } };
  assert.throws(() => kit.checkPatterns('t', missing, 'table', data), {
    message: 'island "t": column pattern for "verdict" matches no column (the table has "item", "count")'
  });
});

// ---- static checks on the inlined files

test('runtime files can be inlined: no script or comment terminators, island.css uses tokens only', () => {
  // Recursive: runtime/edit/edit.css is inlined into served pages too. Its .js files are bundled, then checked at build.
  for (const f of readdirSync(RUNTIME, { recursive: true }).filter((f) => /\.(js|css)$/.test(f))) {
    const src = readRuntimeFile(f);
    assert.doesNotMatch(src, /<\/script/i, `${f} contains </script`);
    assert.doesNotMatch(src, /<!--/, `${f} contains <!--`);
  }
  const css = readRuntimeFile('island.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/, 'island.css has a raw color');
});
