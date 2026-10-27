// Gate report (spec A3): renders every .md under the frozen margent docs, runs the round-trip gate in
// Chrome, and prints pass rates by block type and every failing block. Docs that do not render are listed with their
// error and not counted. The overall candidate pass rate must be at least 95%.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { openServed, renderServed } from './helpers/edit-page.mjs';
import { MARGENT_CORPUS } from './helpers/corpus.mjs';
import { full } from './helpers/tier.mjs';

// Each tree with the label used in the report.
const TREES = [
  { label: 'margent', dir: MARGENT_CORPUS },
];

// The gate judges these types. Everything else is a panel block and is not counted.
const CANDIDATE_TYPES = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol'];
const THRESHOLD = 0.95;

let browser;
before(async () => {
  browser = await chromium.launch({ channel: 'chrome' });
});
after(async () => {
  await browser.close();
});

// Every .md under dir, recursively, with its label and its path inside the tree.
function markdownUnder(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) markdownUnder(full, out);
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

function pct(n, d) {
  return d === 0 ? '  n/a' : `${((100 * n) / d).toFixed(1)}%`.padStart(6);
}

function table(rows) {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  return rows.map((r) => r.map((c, i) => (i === 0 ? String(c).padEnd(widths[i]) : String(c).padStart(widths[i]))).join('  ')).join('\n');
}

test('gate report: pass rates by type for the frozen margent docs (A3)', full, async () => {
  const docs = TREES.flatMap(({ label, dir }) =>
    markdownUnder(dir).map((file) => ({ label, dir, file, name: `${label}/${relative(dir, file)}` }))
  );
  assert.ok(docs.length > 0, 'found docs to report on');

  const byType = new Map(CANDIDATE_TYPES.map((t) => [t, { candidates: 0, pass: 0 }]));
  const failures = [];
  const renderErrors = [];
  let candidates = 0;
  let passed = 0;

  for (const doc of docs) {
    let html;
    try {
      html = renderServed({ source: readFileSync(doc.file, 'utf8'), root: doc.dir, path: relative(doc.dir, doc.file) });
    } catch (err) {
      // A RenderError is a doc that does not render. It is listed, not counted. Anything else is a bug and fails the test.
      if (err.name !== 'RenderError') throw err;
      renderErrors.push(`${doc.name}: ${err.message}`);
      continue;
    }
    const { page, errors, close } = await openServed(browser, html);
    try {
      const gate = await page.evaluate(() => window.margent.gate);
      if (errors.length > 0) throw new Error(`${doc.name}: edit runtime errors: ${errors.join('; ')}`);
      for (const g of gate) {
        if (g.reason === 'panel' || g.reason === 'comment') continue;
        const row = byType.get(g.type);
        if (!row) throw new Error(`${doc.name} ${g.range}: candidate type ${g.type} is not in CANDIDATE_TYPES`);
        row.candidates++;
        candidates++;
        if (g.pass) {
          row.pass++;
          passed++;
        } else {
          failures.push(`${doc.name}:${g.range} ${g.type} ${g.reason}`);
        }
      }
    } finally {
      await close();
    }
  }

  const rows = [['type', 'candidates', 'pass', 'rate']];
  for (const [type, row] of byType) rows.push([type, row.candidates, row.pass, pct(row.pass, row.candidates)]);
  rows.push(['all', candidates, passed, pct(passed, candidates)]);

  const lines = [
    `Gate report: ${docs.length} docs, ${renderErrors.length} did not render (listed, not counted).`,
    '',
    table(rows),
    '',
    `Failing blocks (${failures.length}):`,
    ...failures.map((f) => `  ${f}`),
    '',
    `Docs that did not render (${renderErrors.length}):`,
    ...renderErrors.map((e) => `  ${e}`),
    '',
  ];
  console.log(lines.join('\n'));

  assert.ok(candidates > 0, 'the docs have candidate blocks');
  assert.ok(
    passed / candidates >= THRESHOLD,
    `candidate pass rate ${pct(passed, candidates).trim()} is below ${THRESHOLD * 100}%`
  );
});
