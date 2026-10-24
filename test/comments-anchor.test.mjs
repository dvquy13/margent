// Selection anchoring (M3 spec R5.2 to R5.5, acceptance A2; plan T7), in installed Chrome. The unit cases run on a served
// fixture (test/fixtures/comments/anchor). Selections are built from code here, because these tests check the mapping,
// not the UI. The A2 walk serves the frozen margent docs/ (read only) and checks every gated block.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import MarkdownIt from 'markdown-it';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { serveCopy, openServedPage } from './helpers/serve-page.mjs';
import { repo } from './helpers/edit-page.mjs';
import { MARGENT_CORPUS } from './helpers/corpus.mjs';
import { full } from './helpers/tier.mjs';

const FIXTURE = join(repo, 'test', 'fixtures', 'comments', 'anchor');
const A2_THRESHOLD = 0.99;

let browser;
before(async () => {
  browser = await chromium.launch({ channel: 'chrome' });
});
// The unit cases share one served page, opened by the first case: anchoring never changes the page (the last unit case
// checks that). The page and its server are closed in after(), so a failing case cannot leak the server.
after(async () => {
  if (fixture) {
    await fixture.close();
    await fixture.served.close();
  }
  await browser.close();
});

// Runs in the page. Selects from the position of [needle, k] to the position of [needle, k] inside the block with
// data-src `block`, anchors it, and returns the result as plain data. Positions are found in the block's text, across its
// text nodes; a needle must occur once in that text.
function selectAndAnchor({ block, from, to }) {
  const el = document.querySelector(`[data-src="${block}"]`);
  if (!el) throw new Error(`no block ${block}`);
  const nodes = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.data.length > 0) nodes.push(n);
  const text = nodes.map((n) => n.data).join('');
  const locate = ([needle, k]) => {
    const i = text.indexOf(needle);
    if (i < 0 || text.indexOf(needle, i + 1) >= 0) throw new Error(`needle ${JSON.stringify(needle)} must occur once in ${block}`);
    return i + k;
  };
  const at = (pos, isStart) => {
    let cum = 0;
    for (const n of nodes) {
      const len = n.data.length;
      if (isStart ? pos < cum + len : pos <= cum + len) return { node: n, offset: pos - cum };
      cum += len;
    }
    const last = nodes[nodes.length - 1];
    return { node: last, offset: last.data.length };
  };
  const a = at(locate(from), true);
  const b = at(locate(to), false);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const result = window.margent.anchor(range, el);
  return {
    selected: range.toString(),
    kind: result.kind,
    reason: result.reason ?? null,
    id: result.id ?? null,
    before: result.before ?? null,
    inner: result.inner ?? null,
    after: result.after ?? null,
    snapped: result.snapped ? result.snapped.toString() : null,
    output: result.output ?? null,
  };
}

let fixture;
async function openFixture() {
  const served = await serveCopy(FIXTURE);
  try {
    return { served, ...(await openServedPage(browser, served, 'anchor.md')) };
  } catch (e) {
    await served.close();
    throw e;
  }
}
async function withFixturePage(run) {
  // Errors are attributed to the case that raised them. The case that opened the page owns the errors from opening it.
  const opened = !fixture;
  fixture ??= await openFixture();
  const seen = opened ? 0 : fixture.errors.length;
  const result = await run(fixture.page);
  assert.deepEqual(fixture.errors.slice(seen), [], 'the edit runtime loads without errors');
  return result;
}

const anchorCase = (page, c) => page.evaluate(selectAndAnchor, c);

// The unit cases. Each block is named by its data-src range in fixture anchor.md (the lines are fixed by that file).
test('R5.3: plain text maps to exact before, inner and after', () =>
  withFixturePage(async (page) => {
    const r = await anchorCase(page, { block: '9-9', from: ['basic', 0], to: ['basic', 5] });
    assert.equal(r.kind, 'inline');
    assert.equal(r.before, 'Plain text for the ');
    assert.equal(r.inner, 'basic');
    assert.equal(r.after, ' mapping, with a sentence to select from.');
    assert.equal(r.snapped, 'basic', 'nothing is snapped in plain text');
  }));

test('R5.2: a selection that ends inside bold takes the whole bold', () =>
  withFixturePage(async (page) => {
    const r = await anchorCase(page, { block: '11-11', from: ['Use ', 4], to: ['filter', 3] });
    assert.equal(r.kind, 'inline');
    assert.equal(r.inner, 'the **filter**');
    assert.equal(r.before, 'Use ');
    assert.equal(r.after, ' keeps the rows.');
    assert.equal(r.snapped, 'the filter');
  }));

test('R5.2: a selection that starts and ends at bold edges keeps the bold whole', () =>
  withFixturePage(async (page) => {
    const r = await anchorCase(page, { block: '11-11', from: ['filter', 2], to: ['keeps', 0] });
    assert.equal(r.kind, 'inline');
    assert.equal(r.inner, '**filter** ');
    assert.equal(r.before, 'Use the ');
    assert.equal(r.after, 'keeps the rows.');
  }));

test('R5.2: inside link text takes the whole link', () =>
  withFixturePage(async (page) => {
    const r = await anchorCase(page, { block: '13-13', from: ['docs', 0], to: ['docs', 4] });
    assert.equal(r.kind, 'inline');
    assert.equal(r.inner, '[the docs](docs/x.md)');
    assert.equal(r.before, 'See ');
    assert.equal(r.after, ' for more.');
  }));

test('R5.2: inside a code span takes the whole code span', () =>
  withFixturePage(async (page) => {
    const r = await anchorCase(page, { block: '15-15', from: ['ancho', 0], to: ['ancho', 3] });
    assert.equal(r.kind, 'inline');
    assert.equal(r.inner, '`anchor()`');
    assert.equal(r.before, 'Call ');
    assert.equal(r.after, ' next.');
  }));

test('R5.2: a start inside a heading number moves to just after the number', () =>
  withFixturePage(async (page) => {
    const r = await anchorCase(page, { block: '7-7', from: ['4', 0], to: ['heading', 7] });
    assert.equal(r.kind, 'inline');
    assert.equal(r.inner, 'Numbered heading');
    assert.equal(r.before, '## 4 ');
    assert.equal(r.after, '');
  }));

test('R5.4: across two list items is a block comment (cross)', () =>
  withFixturePage(async (page) => {
    const r = await anchorCase(page, { block: '21-35', from: ['one item', 0], to: ['two item', 3] });
    assert.deepEqual([r.kind, r.reason], ['block', 'cross']);
  }));

test('R5.4: an item text and its nested list is a block comment (cross)', () =>
  withFixturePage(async (page) => {
    const r = await anchorCase(page, { block: '21-35', from: ['item text', 0], to: ['nested', 6] });
    assert.deepEqual([r.kind, r.reason], ['block', 'cross']);
  }));

test('R5.4: a selection in a fenced code block inside a list item is a block comment (code)', () =>
  withFixturePage(async (page) => {
    const r = await anchorCase(page, { block: '21-35', from: ['item with', 0], to: ['const', 3] });
    assert.deepEqual([r.kind, r.reason], ['block', 'code']);
  }));

test('R5.4: a top-level fenced code block is a block comment (ungated)', () =>
  withFixturePage(async (page) => {
    const r = await anchorCase(page, { block: '37-39', from: ['top', 0], to: ['code', 4] });
    assert.deepEqual([r.kind, r.reason], ['block', 'ungated']);
  }));

test('R5.4: a table is a block comment (ungated)', () =>
  withFixturePage(async (page) => {
    const r = await anchorCase(page, { block: '41-43', from: ['1', 0], to: ['2', 1] });
    assert.deepEqual([r.kind, r.reason], ['block', 'ungated']);
  }));

test('R5.5: a selection that takes an existing highlight is refused with its id', () =>
  withFixturePage(async (page) => {
    const whole = await anchorCase(page, { block: '19-19', from: ['An ', 0], to: ['mark', 0] });
    assert.deepEqual([whole.kind, whole.id], ['overlap', 'c1']);
    const inside = await anchorCase(page, { block: '19-19', from: ['existing', 2], to: ['existing', 5] });
    assert.deepEqual([inside.kind, inside.id], ['overlap', 'c1']);
  }));

test('R5.5: text next to an existing thread is not an overlap, and its source keeps the thread', () =>
  withFixturePage(async (page) => {
    const r = await anchorCase(page, { block: '19-19', from: ['mark', 0], to: ['here', 4] });
    assert.equal(r.kind, 'inline');
    assert.equal(r.before, 'An {==existing==}{>>[c1] Quy: note<<} ');
    assert.equal(r.inner, 'mark here');
    assert.equal(r.after, '.');
  }));

test('R5.3: a mapping the guard cannot verify is a block comment (guard)', () =>
  withFixturePage(async (page) => {
    // The sentinel before "_" makes house turndown escape the underscore, so the output no longer equals the source.
    const r = await anchorCase(page, { block: '17-17', from: ['_tool', 0], to: ['here', 0] });
    assert.deepEqual([r.kind, r.reason], ['block', 'guard']);
    assert.match(r.output, /can_use\\_tool/, 'the guard keeps the output that failed, for the report');
  }));

test('the live DOM is not mutated by anchoring', () =>
  withFixturePage(async (page) => {
    const html = () => page.evaluate(() => document.body.innerHTML);
    const before = await html();
    for (const c of [
      { block: '11-11', from: ['filter', 2], to: ['keeps', 0] },
      { block: '21-35', from: ['one item', 0], to: ['two item', 3] },
      { block: '19-19', from: ['An ', 0], to: ['mark', 0] },
      { block: '17-17', from: ['_tool', 0], to: ['here', 0] },
    ]) {
      await anchorCase(page, c);
    }
    assert.equal(await html(), before);
  }));

// ---- A2: the mapping walk over real docs ----

// Runs in the page. For each top-level gated block: five selections from a mulberry32 seeded with 42 (the same seed for
// each block, as the S5 spike), each over the block's text. Returns one record per block, with each selection's anchor.
function sampleGatedBlocks() {
  const mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const pointAt = (nodes, k, isStart) => {
    let cum = 0;
    for (const n of nodes) {
      const len = n.data.length;
      if (isStart ? k < cum + len : k <= cum + len) return { node: n, offset: k - cum };
      cum += len;
    }
    const last = nodes[nodes.length - 1];
    return { node: last, offset: last.data.length };
  };
  const blocks = [...document.querySelectorAll('[data-gate="pass"][data-src]')].filter(
    (el) => !el.parentElement.closest('[data-src]')
  );
  return blocks.map((el) => {
    const range = el.getAttribute('data-src');
    const nodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.data.length > 0) nodes.push(n);
    const N = nodes.reduce((sum, n) => sum + n.data.length, 0);
    const selections = [];
    if (N >= 2) {
      const rng = mulberry32(42);
      for (let i = 0; i < 5; i++) {
        let a;
        let b;
        do {
          a = Math.floor(rng() * (N + 1));
          b = Math.floor(rng() * (N + 1));
        } while (a === b);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const s = pointAt(nodes, lo, true);
        const e = pointAt(nodes, hi, false);
        const r = document.createRange();
        r.setStart(s.node, s.offset);
        r.setEnd(e.node, e.offset);
        const result = window.margent.anchor(r, el);
        selections.push({
          selected: r.toString(),
          kind: result.kind,
          reason: result.reason ?? null,
          id: result.id ?? null,
          before: result.before ?? null,
          inner: result.inner ?? null,
          after: result.after ?? null,
          snapped: result.snapped ? result.snapped.toString() : null,
          output: result.output ?? null,
        });
      }
    }
    return { range, source: window.margent.sourceOf(range), selections };
  });
}

const md = new MarkdownIt({ html: true });
const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
// Shows the sentinels of a failing output: U+E001 as [[ and U+E002 as ]].
const visible = (s) => s.replace(//g, '[[').replace(//g, ']]');

function markdownFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...markdownFiles(full, base));
    else if (name.endsWith('.md')) out.push(relative(base, full));
  }
  return out;
}

// Totals across every corpus, filled by the walk tests and read by the threshold test that runs last.
const totals = {
  selections: 0,
  byKind: { inline: 0, overlap: 0, block: 0 },
  byReason: { ungated: 0, cross: 0, code: 0, guard: 0 },
  inline: 0,
  inlinePass: 0,
  inlineFail: 0,
  guard: 0,
  failures: [],
};
const count = (map, key) => {
  map[key] = (map[key] ?? 0) + 1;
};

const CORPORA = [
  ['frozen margent docs', MARGENT_CORPUS],
];

for (const [name, folder] of CORPORA) {
  test(`A2 walk over ${name}: every inline mapping is exact, failures are reported`, full, async (t) => {
    const served = await serveCopy(folder);
    t.after(() => served.close());
    const docs = markdownFiles(folder);
    for (const doc of docs) {
      const { page, errors, close } = await openServedPage(browser, served, doc);
      try {
        assert.deepEqual(errors, [], `${doc}: the page reported errors`);
        const blocks = await page.evaluate(sampleGatedBlocks);
        for (const b of blocks) {
          const line = Number(b.range.split('-')[0]);
          for (const sel of b.selections) {
            totals.selections += 1;
            count(totals.byKind, sel.kind);
            if (sel.kind !== 'inline') {
              count(totals.byReason, sel.reason ?? sel.kind);
              if (sel.reason === 'guard') {
                totals.guard += 1;
                totals.failures.push(`${doc}:${line} guard, selected ${JSON.stringify(sel.selected)}, output ${JSON.stringify(visible(sel.output))}`);
              }
              continue;
            }
            totals.inline += 1;
            // The function guarantees this; it is asserted anyway, so a broken guard fails the walk.
            assert.equal(sel.before + sel.inner + sel.after, b.source, `${doc}:${line} exact: before + inner + after is not the source`);
            const rendered = norm(decode(md.renderInline(sel.inner).replace(/<[^>]+>/g, '')));
            if (rendered === norm(sel.snapped)) {
              totals.inlinePass += 1;
            } else {
              totals.inlineFail += 1;
              totals.failures.push(
                `${doc}:${line} unbalanced, selected ${JSON.stringify(sel.selected)}, snapped ${JSON.stringify(sel.snapped)}, ` +
                  `output ${JSON.stringify(visible(sel.before + '' + sel.inner + '' + sel.after))}, rendered ${JSON.stringify(rendered)}`
              );
            }
          }
        }
      } finally {
        await close();
      }
    }
  });
}

test('A2: the pass rate over every walked selection is at least 99%', full, () => {
  const denominator = totals.inline + totals.guard;
  const rate = denominator === 0 ? 0 : totals.inlinePass / denominator;
  const lines = [
    `A2 selections: ${totals.selections}`,
    `  by kind: ${JSON.stringify(totals.byKind)}`,
    `  block by reason: ${JSON.stringify(totals.byReason)}`,
    `  inline: ${totals.inline}, pass ${totals.inlinePass}, unbalanced ${totals.inlineFail}`,
    `  guard: ${totals.guard}`,
    `  pass rate (inline pass / (inline + guard)): ${(rate * 100).toFixed(2)}%`,
    ...totals.failures.map((f) => `  FAIL ${f}`),
  ];
  console.log(lines.join('\n'));
  assert.ok(denominator > 0, 'the walk found no selections');
  assert.ok(rate >= A2_THRESHOLD, `A2 pass rate ${(rate * 100).toFixed(2)}% is below 99%`);
});
