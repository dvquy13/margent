// Comments in the round-trip gate and house turndown (M3 spec R7), in installed Chrome. Covers R7.1 and R7.2 on
// the all-kinds fixture, the reserved sentinels, and A3: a commented copy of every frozen margent doc, gated.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gateOf, openServed, renderServed, repo } from './helpers/edit-page.mjs';
import { MARGENT_CORPUS } from './helpers/corpus.mjs';
import { full } from './helpers/tier.mjs';
import { markdownFiles, reportText, runA3, unmark } from '../scripts/accept/comment-copies.mjs';
import { stripAll } from '../.build/comments/syntax.js';

const ALL_KINDS = join(repo, 'test', 'fixtures', 'comments', 'all-kinds.md');
const TURNDOWN = join(repo, 'runtime', 'edit', 'turndown.js');

let browser;
before(async () => {
  browser = await chromium.launch({ channel: 'chrome' });
});
after(async () => {
  await browser.close();
});

// The all-kinds fixture, opened as a served page. `run` gets the page and returns the test's result.
async function withAllKinds(run) {
  const source = readFileSync(ALL_KINDS, 'utf8');
  const { page, errors, close } = await openServed(browser, renderServed({ source, path: 'all-kinds.md' }));
  try {
    const result = await run(page);
    assert.deepEqual(errors, [], 'the edit runtime loads without errors');
    return result;
  } finally {
    await close();
  }
}

test('R7.1: every candidate block holding a comment passes the gate and turns back into its source', async () => {
  const rows = await withAllKinds((page) =>
    page.evaluate(() =>
      window.margent.gate.map((g) => {
        const el = window.margent.blocks.get(g.range);
        return {
          range: g.range,
          type: g.type,
          pass: g.pass,
          reason: g.reason,
          dataGate: el.getAttribute('data-gate'),
          hasComment: el.querySelector('.c-thread') !== null || el.classList.contains('c-line'),
          md: window.margent.toMarkdown(el),
          src: window.margent.sourceOf(g.range),
        };
      })
    )
  );

  // The blocks with comments, by range: a paragraph with a two-note thread and bold inside its highlight, a point
  // comment paragraph, a commented numbered heading, a paragraph with a highlight and a note, and a list item with a note.
  const commentedCandidates = rows.filter((r) => r.hasComment && r.reason !== 'comment');
  assert.deepEqual(
    commentedCandidates.map((r) => r.range),
    ['9-9', '11-11', '13-13', '15-15', '25-26']
  );
  for (const r of commentedCandidates) {
    assert.equal(r.pass, true, `${r.range} passes the gate: ${r.reason}`);
    assert.equal(r.dataGate, 'pass', `${r.range} is marked data-gate="pass"`);
    assert.equal(r.md, r.src, `${r.range} turns back into its source byte for byte`);
  }
});

test('R7.1: a block comment line is a non-candidate with reason "comment" and never passes', async () => {
  const rows = await withAllKinds((page) =>
    page.evaluate(() =>
      window.margent.gate.map((g) => ({
        range: g.range,
        pass: g.pass,
        reason: g.reason,
        dataGate: window.margent.blocks.get(g.range).getAttribute('data-gate'),
        isLine: window.margent.blocks.get(g.range).classList.contains('c-line'),
      }))
    )
  );
  const lines = rows.filter((r) => r.isLine);
  assert.deepEqual(lines.map((r) => r.range), ['21-21', '23-23']);
  for (const r of lines) {
    assert.equal(r.reason, 'comment', `${r.range} reason`);
    assert.equal(r.pass, false, `${r.range} does not pass`);
    assert.equal(r.dataGate, null, `${r.range} has no data-gate attribute`);
  }
});

// R7.2: deleting all the text of a highlight in a cloned block leaves its notes as a point comment, with the highlight's
// {==…==} gone. The clone is detached, so the page is not touched.
test('R7.2: a highlight with its text deleted writes nothing, and its notes stay', async () => {
  const cases = [
    {
      range: '9-9',
      expected: 'A filter keeps {>>[c1] Quy: is that stable across repos?<<}{>>[c1] Claude: Measured on 4 repos in S3.<<} as the sample.',
    },
    { range: '11-11', expected: 'A point comment sits here.{>>[c3] Quy: Cite the source for this.<<} The text goes on.' },
    { range: '13-13', expected: '## 2 Costs {>>[c4] Quy: or per run?<<}' },
    { range: '15-15', expected: 'Spend is about {>>[c5] Claude: Per run, from the S3 log.<<} each month.' },
    { range: '25-26', expected: '- First item with {>>[c8] Quy: keep it short.<<}\n- Second item' },
  ];
  const got = await withAllKinds((page) =>
    page.evaluate((ranges) =>
      ranges.map((range) => {
        const clone = window.margent.blocks.get(range).cloneNode(true);
        for (const mark of clone.querySelectorAll('mark.c-hl')) mark.textContent = '';
        return { range, md: window.margent.toMarkdown(clone) };
      }), cases.map((c) => c.range))
  );
  for (const [i, c] of cases.entries()) {
    assert.equal(got[i].md, c.expected, `${c.range} with its highlight text deleted`);
  }
});

// Mid-line marks next to comments: text after a thread and text inside a highlight at a line start must not be escaped
// as if it began a line. Each source is one candidate block that must pass.
test('R7.1: text after a thread and a highlight at a line start round-trip without escapes', async () => {
  const sources = [
    '{==- one==}{>>[c1] Quy: note<<} then{>>[c2] Quy: two<<} # tail',
    '{>>[c1] Quy: note<<} - tail',
    '{==1. one==}{>>[c1] Quy: n<<} and {==# two==}{>>[c2] Quy: m<<}',
  ];
  for (const source of sources) {
    const gate = await gateOf(browser, source);
    const candidates = gate.filter((g) => g.reason !== 'panel');
    assert.equal(candidates.length, 1, `one candidate block for ${JSON.stringify(source)}`);
    assert.equal(candidates[0].pass, true, `${JSON.stringify(source)} passes: ${candidates[0].reason}`);
  }
});

// The sentinels are reserved for selection anchoring (spec R5.3): house turndown must never use them.
test('the house turndown uses neither sentinel U+E001 nor U+E002', () => {
  const text = readFileSync(TURNDOWN, 'utf8');
  assert.equal(text.includes(''), false, 'no U+E001 in turndown.js');
  assert.equal(text.includes(''), false, 'no U+E002 in turndown.js');
  assert.equal(/\\uE00[12]/i.test(text), false, 'no \\uE001 or \\uE002 escape in turndown.js');
});

// A3: the commented copies of the frozen margent docs. Each doc gets a comment on every block the gate passes today; the
// commented copy is gated again, and each commented block must pass. A doc whose original source already has comment
// markup is left out: a doc that quotes the syntax in a code span (`{==text==}`) is changed by the whole-doc strip the check
// runs, which is not a gate failure. MARGENT_CORPUS is read, never written: the run works on copies.
const hasCommentMarkup = (source) => stripAll(source) !== source || unmark(source) !== source;

test('A3: at least 95% of commented blocks in copies of the margent docs pass the gate', full, async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'margent-a3-'));
  const docs = join(work, 'docs');
  const out = join(work, 'out');
  t.after(() => rmSync(work, { recursive: true, force: true }));
  cpSync(MARGENT_CORPUS, docs, { recursive: true });
  const all = markdownFiles(MARGENT_CORPUS);
  const excluded = all.filter((rel) => hasCommentMarkup(readFileSync(join(MARGENT_CORPUS, rel), 'utf8')));
  for (const rel of excluded) rmSync(join(docs, rel));
  console.log(`A3 excludes ${excluded.length} of ${all.length} docs whose original source has comment markup: ${excluded.join(', ')}`);
  const result = await runA3(browser, docs, out);
  console.log(reportText(result));
  assert.ok(result.commented > 0, 'the margent docs have passing blocks to comment');
  assert.ok(
    result.passed / result.commented >= 0.95,
    `A3 pass rate ${result.passed}/${result.commented} is below 95%`
  );
});
