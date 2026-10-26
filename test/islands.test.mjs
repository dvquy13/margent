// Island pipeline tests (T5, R3, M5 T3): markup parsing, module lookup, the page policy, the island DOM, and the browser
// checks for A5 (pattern badge, CSP), A7 (JS off), the errors the guest reports (M5 R1.3) and S3's three islands.
// Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, withBrowser, islandInfo } from './helpers/browser.mjs';
import { full } from './helpers/tier.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DOCS = join(here, 'fixtures', 'islands', 'docs');
const S3 = join(here, 'fixtures', 'islands', 's3');
const NEVER_RUN = join(here, 'fixtures', 'islands', 'never-run');

const { renderBody } = await import('../.build/render/markdown.js');
const { renderDoc } = await import('../.build/render/page.js');
const { columnKey } = await import('../.build/islands/parse.js');

const workdir = mkdtempSync(join(tmpdir(), 'margent-islands-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

const rel = (path) => relative(process.cwd(), path);

function render(name, root = DOCS) {
  const file = join(root, name);
  return renderDoc({ file, source: readFileSync(file, 'utf8'), root, outFile: join(root, name.replace(/\.md$/, '.html')) });
}

// The body of a rendered doc, with island data, module and mismatches (renderDoc returns only name, kind and line).
function body(name, root = DOCS) {
  const file = join(root, name);
  return renderBody(readFileSync(file, 'utf8'), { file, root, outFile: join(root, name.replace(/\.md$/, '.html')) });
}

// Errors that moved into the sandboxed guest (M5 R1.3): the render succeeds, and the page carries the island's module.
function assertRendersInGuest(name, island, root = DOCS) {
  const r = render(name, root);
  assert.equal(r.islands[0].name, island, `${name}: island`);
  assert.ok(r.html.includes(`class="island-module" data-name="${island}"`), `${name}: island-module "${island}" in the page`);
  return r;
}

// The RenderError thrown by rendering `name`, which must fail. Messages are matched by name, not instanceof.
function renderFailure(name, root = DOCS) {
  try {
    render(name, root);
  } catch (err) {
    return err;
  }
  assert.fail(`${name} rendered, but a RenderError was expected`);
}

function assertFails(name, line, message, root = DOCS) {
  const err = renderFailure(name, root);
  assert.equal(err.name, 'RenderError', `${name}: ${err.message}`);
  assert.equal(err.message, `${rel(join(root, name))}:${line}: ${message}`);
}

// The <agent-island> element for island `name` in rendered HTML.
function islandElement(html, name) {
  const start = html.indexOf(`<agent-island name="${name}"`);
  assert.ok(start >= 0, `no <agent-island name="${name}">`);
  return html.slice(start, html.indexOf('</agent-island>', start) + '</agent-island>'.length);
}

// ---- parse

test('columnKey: lowercase, runs outside letters and digits become "_", ends trimmed', () => {
  assert.equal(columnKey('Café ñ'), 'café_ñ');
  assert.equal(columnKey('What it decides, and when'), 'what_it_decides_and_when');
  assert.equal(columnKey('Cost, average month'), 'cost_average_month');
  assert.equal(columnKey('(Note)'), 'note');
  assert.equal(columnKey('A--B'), 'a_b');
  assert.equal(columnKey('???'), '');
});

test('table island: data shape, Unicode column keys, \\| unescaped, attributes and row lines', () => {
  const isl = body('parse.md').islands[0];
  assert.equal(isl.name, 'shape');
  assert.equal(isl.kind, 'table');
  assert.equal(isl.line, 5);
  assert.deepEqual(isl.data.columns, [
    { key: 'call', label: 'Call' },
    { key: 'café_ñ', label: 'Café ñ' },
    { key: 'note', label: 'Note' },
  ]);
  assert.deepEqual(isl.data.attrs, { total: '3.87' });
  assert.equal(isl.data.rows[0]['café_ñ'], 'Does a **raw** item? | pipe `a | b`');
  // Cells past the header are ignored, as GFM renders them.
  assert.deepEqual(isl.data.rows[1], { call: 'Extra', 'café_ñ': '`<b>x</b>`', note: 'y' });
  assert.deepEqual(isl.rowLines, [8, 9]);
});

test('YAML island: the fence value is the data, and the island is at the fence line', () => {
  const yaml = body('parse.md').islands[1];
  assert.equal(yaml.name, 'steps');
  assert.equal(yaml.kind, 'yaml');
  assert.equal(yaml.line, 13);
  assert.deepEqual(yaml.data, [{ id: 'M1', scope: ['a', 'b'] }, { id: 'M2' }]);
  assert.deepEqual(yaml.rowLines, []);
});

test('emitted DOM: agent-island with name, kind and data-src; JSON data; fallback without its own data-src', () => {
  const html = render('parse.md').html;
  const el = islandElement(html, 'shape');
  assert.ok(el.startsWith('<agent-island name="shape" data-kind="table" data-src="5-9">\n'), el.slice(0, 120));
  const json = /class="island-data">([^<]*)<\/script>/.exec(el);
  assert.ok(json, 'island-data script');
  assert.doesNotMatch(json[1], /</, '< is escaped in the JSON');
  const payload = JSON.parse(json[1]);
  assert.equal(payload.data.rows.length, 2);
  assert.deepEqual(payload.rowLines, [8, 9]);
  assert.equal(payload.mismatches, undefined, 'mismatches left the payload');
  const fallback = el.slice(el.indexOf('<div class="island-fallback">'));
  assert.match(fallback, /^<div class="island-fallback"><div class="scroll">\n<table>/);
  assert.doesNotMatch(fallback, /data-src/, 'the fallback carries no data-src');

  const yaml = islandElement(html, 'steps');
  assert.ok(yaml.startsWith('<agent-island name="steps" data-kind="yaml" data-src="13-17">'));
  assert.match(yaml, /<div class="island-fallback"><pre>- id: M1\n  scope: \[a, b\]\n- id: M2\n<\/pre><\/div>/);
});

test('the same input renders to identical HTML', () => {
  assert.equal(render('parse.md').html, render('parse.md').html);
  assert.equal(render('mismatch.md').html, render('mismatch.md').html);
  const s3 = render('A.md', S3).html;
  assert.equal(s3, render('A.md', S3).html);
});

// ---- A6: every error fixture is a RenderError at file:line

test('A6: invalid YAML fails at the line inside the fence', () => {
  assertFails('yaml-invalid.md', 6, 'invalid YAML in island "steps": Flow sequence in block collection must be sufficiently indented and end with a ]');
});

test('A6: a missing module fails at the island line, naming the folders searched', () => {
  assertFails('missing-module.md', 3, `island "absent" has no module islands/absent.island.js between ${rel(DOCS)} and the docs root`);
  const nested = join(DOCS, 'sub');
  assertFails('sub/missing-nested.md', 3, `island "absent" has no module islands/absent.island.js between ${rel(nested)} and the docs root`);
});

test('A6: a marker with no table directly below fails at the marker line', () => {
  assertFails('no-table.md', 3, 'island "shape" marker must sit directly above a table (no blank line)');
});

test('A6: a malformed marker fails at the marker line', () => {
  assertFails('malformed-marker.md', 3, 'malformed island marker; expected <!-- island {name} [key=value ...] -->');
});

test('a bad island name fails at the marker line', () => {
  assertFails('bad-name.md', 3, 'island name "Shape" must be lowercase letters, digits and dashes');
});

// Schema violations and unsupported keywords are checked by the guest (M5 R1.3), so they render.
test('a schema violation renders: the schema check moved to the guest (M5 R1.3)', () => {
  assertRendersInGuest('schema-violation.md', 'tally');
});

test('an unsupported schema keyword renders: the schema check moved to the guest (M5 R1.3)', () => {
  assertRendersInGuest('unsupported-keyword.md', 'unsupported');
});

test('A6: a module with an import fails at the island line', () => {
  assertFails('import.md', 3, 'island "imports": modules may not import anything (contract v1)');
});

// A module that throws at load is reported by the guest (M5 R1.3), so the render succeeds.
test('a module that throws while loading renders: the load error moved to the guest (M5 R1.3)', () => {
  assertRendersInGuest('throws.md', 'throws');
});

test('a column pattern on a column the table does not have renders: the guest checks it (M5 R1.3)', () => {
  assertRendersInGuest('pattern-missing-column.md', 'badpattern');
});

// A module's top level is never executed by Node (M5 R1): this one throws if it runs, and the render still succeeds.
test('an island module is never executed in Node: its top level throws, and the render succeeds', () => {
  const r = assertRendersInGuest('never-run.md', 'never-run', NEVER_RUN);
  assert.equal(r.islands.length, 1);
});

test('a duplicate column key fails at the header line', () => {
  assertFails('dup-key.md', 4, 'two columns map to the key "café"');
});

test('an empty column key fails at the header line', () => {
  assertFails('empty-key.md', 4, 'column 1 ("???") has no name to derive a key from');
});

test('a YAML fence whose value is a scalar fails at the fence line', () => {
  assertFails('yaml-scalar.md', 3, 'island "steps" YAML must be a mapping or a sequence');
});

test('a module source containing "<!--" fails at the island line, since it would break the page', () => {
  const root = join(workdir, 'comment-root');
  mkdirSync(join(root, 'islands'), { recursive: true });
  writeFileSync(join(root, 'islands', 'bad.island.js'), '// <!-- inside a comment\nexport const contract = 1;\nexport const schema = { type: "object" };\nexport default function render() {}\n');
  writeFileSync(join(root, 'doc.md'), '# Doc\n\n<!-- island bad -->\n| A |\n|---|\n| 1 |\n');
  assertFails('doc.md', 3, `island "bad": module ${rel(join(root, 'islands', 'bad.island.js'))} contains "</script" or "<!--", which would break the page`, root);
});

test('column patterns on a YAML island render: the guest reports them (M5 R1.3)', () => {
  const root = join(workdir, 'yaml-pattern-root');
  mkdirSync(join(root, 'islands'), { recursive: true });
  writeFileSync(join(root, 'islands', 'steps.island.js'), 'export const contract = 1;\nexport const schema = { type: "array", columns: { id: { pattern: "^M" } } };\nexport default function render() {}\n');
  writeFileSync(join(root, 'doc.md'), '# Doc\n\n```island steps\n- id: M1\n```\n');
  assertRendersInGuest('doc.md', 'steps', root);
});

// ---- lookup (R3.5)

test('lookup walks up: a doc in a folder without islands uses the module in the docs root', () => {
  const [isl] = body('sub/child.md').islands;
  assert.equal(isl.name, 'shape');
  assert.equal(isl.module.path, join(DOCS, 'islands', 'shape.island.js'));
});

// ---- schema and column patterns (R3.1)

// Pattern mismatches are found by the guest (M5 R1.3, R3.3): the render succeeds, with the row lines for check.
test('a cell that breaks its column pattern renders, and its row lines reach the page (A5)', () => {
  assertRendersInGuest('mismatch.md', 'tally');
  assert.deepEqual(body('mismatch.md').islands[0].rowLines, [8, 9]);
});

test('pages with islands carry module sources in first-use order, then kit, host and theme', () => {
  const html = render('parse.md').html;
  const at = (s) => {
    const i = html.indexOf(s);
    assert.ok(i >= 0, `missing ${s}`);
    return i;
  };
  const order = [
    at('data-name="shape"'),
    at('data-name="steps"'),
    at('var MargentKit'),
    at('customElements.define'),
    at('var systemDark'),
  ];
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(html.match(/data-name="shape"/g).length, 1, 'one module per name');
});

// The policy (M5 R2.4): every executable script, the guest kit and runtime, and each module is listed, by hash, and
// nothing else is. The scan reads the HTML the way a browser splits it: script elements with their exact text.
test('the policy lists the sha256 of each script the page or its guests run, and nothing else', () => {
  const html = render('mismatch.md').html;
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
  assert.ok(meta, 'the policy meta sits in the page');
  const policy = meta[1];
  const listed = [...policy.matchAll(/'sha256-([^']+)'/g)].map((m) => m[1]);
  assert.equal(new Set(listed).size, listed.length, 'no hash is listed twice');

  const hash = (text) => createHash('sha256').update(text, 'utf8').digest('base64');
  const expected = [];
  const scriptRe = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = scriptRe.exec(html))) {
    const [, attrs, text] = m;
    const type = /type="([^"]+)"/.exec(attrs)?.[1];
    const id = /id="([^"]+)"/.exec(attrs)?.[1] ?? '';
    const isModule = /class="island-module"/.test(attrs);
    const isGuest = type === 'text/plain' && (isModule || id.startsWith('margent-guest-'));
    const isExecutable = type === undefined;
    if (isExecutable || isGuest) expected.push(hash(text));
  }
  assert.ok(expected.length >= 6, `expected several scripts, found ${expected.length}`);
  assert.deepEqual(new Set(listed), new Set(expected));

  assert.ok(policy.includes("object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none';"), policy);
  assert.ok(policy.includes("style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com"), policy);
  assert.doesNotMatch(policy, /default-src|img-src|frame-src/, 'no default, image or frame source');
});

test('the page policy is the same string the render returns, so serve can send it as a header', () => {
  const html = render('mismatch.md').html;
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)[1];
  assert.equal(meta, render('mismatch.md').policy);
});

test('a page without islands keeps only theme.js', () => {
  const html = renderDoc({
    file: join(here, 'fixtures', 'render', 'docs', 'basic.md'),
    source: readFileSync(join(here, 'fixtures', 'render', 'docs', 'basic.md'), 'utf8'),
    root: join(here, 'fixtures', 'render', 'docs'),
    outFile: join(here, 'fixtures', 'render', 'docs', 'basic.html'),
  }).html;
  assert.doesNotMatch(html, /island-module|MargentKit|customElements/);
  assert.equal(html.match(/<script/g).length, 1, 'only the theme script');
});

// ---- browser: A5, A7

test('A5: in Chrome the mismatched island shows its badge and is rendered', async () => {
  const dir = join(workdir, 'a5');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'mismatch.html');
  writeFileSync(file, render('mismatch.md').html);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openPage(browser, file);
    try {
      const [info] = await islandInfo(page);
      assert.equal(info.state, 'rendered');
      assert.match(info.badge ?? '', /row 2, verdict: "Maybe proceed"/);
      assert.equal(await page.locator('agent-island > .island-badge').count(), 1);
      // The page carries its script policy: no inline script, and no guest script, is refused.
      assert.equal(errors.filter((e) => /Content Security Policy|Refused to/.test(e)).length, 0, 'no CSP violation');
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });
});

test('A7: with JavaScript off, the island shows its original table and YAML source', full, async () => {
  const dir = join(workdir, 'a7');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'parse.html');
  writeFileSync(file, render('parse.md').html);
  await withBrowser(async (browser) => {
    const off = await openPage(browser, file, { javaScriptEnabled: false });
    try {
      assert.equal(await off.page.locator('agent-island[name="shape"] .island-fallback table').isVisible(), true);
      assert.equal(await off.page.locator('agent-island[name="steps"] .island-fallback pre').isVisible(), true);
    } finally {
      await off.close();
    }
    const on = await openPage(browser, file);
    try {
      assert.equal(await on.page.locator('agent-island[name="shape"] .island-fallback').isVisible(), false);
      assert.deepEqual(on.errors, []);
    } finally {
      await on.close();
    }
  });
});

// ---- browser: the errors the guest reports, each as its text in the page (M5 R1.3, R5.2)

// Opens the rendered page of a fixture doc in Chrome, with its script policy, and returns the island element's attributes.
async function islandAttributes(browser, name, root = DOCS) {
  const dir = join(workdir, 'errors');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name.replace(/[/.]/g, '-')}.html`);
  writeFileSync(file, render(name, root).html);
  const { page, errors, close } = await openPage(browser, file);
  try {
    const attrs = await page.$eval('agent-island', (el) => ({
      state: el.getAttribute('data-state'),
      error: el.getAttribute('data-error'),
      mismatches: el.getAttribute('data-mismatches')
    }));
    return { ...attrs, errors };
  } finally {
    await close();
  }
}

test('a schema violation reaches the island box as its check text (A6, moved to the guest)', full, async () => {
  await withBrowser(async (browser) => {
    const a = await islandAttributes(browser, 'schema-violation.md');
    assert.equal(a.state, 'error');
    assert.equal(a.error, 'island tally: data does not match schema: $.rows: fewer than 1 items');
  });
});

test('an unsupported schema keyword reaches the island box as its check text (A6, moved to the guest)', full, async () => {
  await withBrowser(async (browser) => {
    const a = await islandAttributes(browser, 'unsupported-keyword.md');
    assert.equal(a.state, 'error');
    assert.equal(a.error, 'island unsupported: schema keyword "not" is not supported (at $)');
  });
});

test('a module that throws at load reaches the island box as its check text (A6, moved to the guest)', async () => {
  await withBrowser(async (browser) => {
    const a = await islandAttributes(browser, 'throws.md');
    assert.equal(a.state, 'error');
    assert.equal(a.error, `module ${rel(join(DOCS, 'islands', 'throws.island.js'))} throws at load: boom at load`);
  });
});

test('a column pattern on a missing column reaches the island box as its check text (A6, moved to the guest)', full, async () => {
  await withBrowser(async (browser) => {
    const a = await islandAttributes(browser, 'pattern-missing-column.md');
    assert.equal(a.state, 'error');
    assert.equal(a.error, 'island "badpattern": column pattern for "nope" matches no column (the table has "a")');
  });
});

test('a pattern mismatch reaches data-mismatches, and the island still renders (A5)', full, async () => {
  await withBrowser(async (browser) => {
    const a = await islandAttributes(browser, 'mismatch.md');
    assert.equal(a.state, 'rendered');
    assert.equal(a.error, null);
    assert.deepEqual(JSON.parse(a.mismatches), [{ row: 1, column: 'verdict', text: 'Maybe proceed' }]);
  });
});

test('column patterns on a YAML island reach the island box as its check text', full, async () => {
  const root = join(workdir, 'yaml-pattern-browser');
  mkdirSync(join(root, 'islands'), { recursive: true });
  writeFileSync(join(root, 'islands', 'steps.island.js'), 'export const contract = 1;\nexport const schema = { type: "array", columns: { id: { pattern: "^M" } } };\nexport default function render() {}\n');
  writeFileSync(join(root, 'doc.md'), '# Doc\n\n```island steps\n- id: M1\n```\n');
  await withBrowser(async (browser) => {
    const a = await islandAttributes(browser, 'doc.md', root);
    assert.equal(a.state, 'error');
    assert.equal(a.error, 'island "steps": column patterns apply only to table islands');
  });
});

// ---- browser: S3 (A, B, C), light and dark, 1000px and 390px

test('S3: A, B and C render in Chrome with no errors or clipping, and no horizontal scroll at 390px', full, async () => {
  const dir = join(workdir, 's3');
  mkdirSync(dir, { recursive: true });
  const pages = ['A', 'B', 'C'].map((n) => {
    const r = render(`${n}.md`, S3);
    const file = join(dir, `${n}.html`);
    writeFileSync(file, r.html);
    return { n, file };
  });
  await withBrowser(async (browser) => {
    for (const { n, file } of pages) {
      for (const colorScheme of ['light', 'dark']) {
        for (const width of [1000, 390]) {
          const label = `${n} ${colorScheme} ${width}px`;
          const { page, errors, close } = await openPage(browser, file, { colorScheme, viewport: { width, height: 900 } });
          try {
            const info = await islandInfo(page);
            assert.equal(info.length, 1, `${label}: one island`);
            for (const i of info) {
              assert.equal(i.state, 'rendered', `${label}: ${i.name} state`);
              assert.equal(i.errorBox, false, `${label}: ${i.name} error box`);
              assert.ok(i.textLength > 0, `${label}: ${i.name} has text`);
              assert.deepEqual(i.clipped, [], `${label}: ${i.name} clipped`);
            }
            assert.deepEqual(errors, [], `${label}: console errors`);
            if (width === 390) {
              const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
              assert.ok(overflow <= 0, `${label}: horizontal overflow ${overflow}px`);
            }
          } finally {
            await close();
          }
        }
      }
    }
  });
});

test('M5 R6: margentIslands.find counts a phrase inside a rendered island, and 0 for a phrase it lacks', full, async () => {
  const dir = join(workdir, 'find');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'mismatch.html');
  writeFileSync(file, render('mismatch.md').html);
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openPage(browser, file);
    try {
      const count = (phrase) => page.evaluate((p) => window.margentIslands.find(document.querySelector('agent-island'), p), phrase);
      assert.equal(await count('Proceed'), 1);
      assert.equal(await count('Maybe proceed'), 1);
      assert.equal(await count('no such phrase in the island'), 0);
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });
});
