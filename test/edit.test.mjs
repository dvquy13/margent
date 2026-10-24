// The edit runtime's gate, house turndown and runtime contract (spec R3, A3), in installed Chrome (M2 T5).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EDIT_JS, findDocsRoot, gateOf, openServed, renderServed } from './helpers/edit-page.mjs';
import { MARGENT_CORPUS } from './helpers/corpus.mjs';
import { full } from './helpers/tier.mjs';

let browser;
before(async () => {
  browser = await chromium.launch({ channel: 'chrome' });
});
after(async () => {
  await browser.close();
});

// Every candidate (non-panel) entry of a gate must pass. Returns the failures, for a readable assertion message.
function candidateFailures(gate) {
  return gate.filter((g) => g.reason !== 'panel' && g.reason !== 'comment' && !g.pass).map((g) => `${g.range} ${g.type}: ${g.reason}`);
}

// Round trip of one block: the source is one candidate block, and it passes the gate.
async function assertRoundTrip(source) {
  const gate = await gateOf(browser, source);
  const candidates = gate.filter((g) => g.reason !== 'panel' && g.reason !== 'comment');
  assert.equal(candidates.length, 1, `one candidate block for ${JSON.stringify(source)}`);
  assert.equal(candidates[0].pass, true, `${JSON.stringify(source)} passes: ${candidates[0].reason}`);
}

// ---- soft breaks (plan T5 decision 1) -----------------------------------------------------------

const SOFT_BREAK_CASES = {
  'a newline inside text': 'Plain line one\nline two that wraps.',
  'a newline between two inline elements': '*one*\n**two**',
  'a tight nested list (no blank line before the sub-list)': '- item\n  - sub\n- next',
  'a loose list item (paragraphs inside the item)': '- first\n\n  more\n- second',
  'a blank source line before a later item (gap mark)': '- a\n\n- b\n- c',
  'an ordered list with a soft break in an item': '1. one\n   two\n2. three',
  'a soft break before a nested ordered list': '1. item\n   1. sub',
};

for (const [name, source] of Object.entries(SOFT_BREAK_CASES)) {
  test(`soft breaks: ${name} round-trips`, full, async () => {
    await assertRoundTrip(source);
  });
}

test('soft breaks: a formatting newline next to a block is not turned into a break', full, async () => {
  // A tight nested list: the newline before the <ul> is a formatting newline inside <li>. If it became a break, the
  // item would gain an extra line and the gate would fail on line 2.
  const gate = await gateOf(browser, '- item\n  - sub');
  assert.deepEqual(gate.map((g) => g.pass), [true]);
});

test('mid-line mark: a space at the edge of bold still moves outside the delimiters', full, async () => {
  const { page, close, errors } = await openServed(browser, renderServed({ source: 'Text.\n' }));
  try {
    const out = await page.evaluate(() => {
      const p = document.createElement('p');
      // What Chrome's Cmd+B leaves when the selection starts on the space after a bold word (an edit corpus
      // case). The mark used to sit before the space, so turndown wrote "**150**** raw items**".
      p.innerHTML = '<strong>150</strong><strong> raw items</strong> - after';
      document.body.append(p);
      return window.margent.toMarkdown(p);
    });
    assert.equal(out, '**150** **raw items** - after');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('soft breaks: text inside code is never touched', full, async () => {
  const { page, close, errors } = await openServed(browser, renderServed({ source: 'Text.\n' }));
  try {
    const out = await page.evaluate(() => {
      const p = document.createElement('p');
      p.innerHTML = 'x <code>a\nb</code> y\nz';
      document.body.append(p);
      return window.margent.toMarkdown(p);
    });
    // Turndown writes a code span's newline as a space, as markdown-it renders it. The soft-break marker never reaches code.
    assert.equal(out, 'x `a b` y\nz');
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

// ---- house rules (plan T5 test list) ------------------------------------------------------------

const HOUSE_CASES = {
  'an escaped dollar': 'Prices keep their escaped dollar: \\$3.87 a month.',
  'an intraword underscore': 'The snake_case_name stays bare.',
  'strikethrough': 'Some ~~struck~~ text.',
  'a <url> autolink': 'An autolink <https://example.com/a> here.',
  'an internal .md link': 'See [the spec](specs/x.md#a) for details.',
  'an external link': 'An [external link](https://example.com/docs) here.',
  'a local image': '![A small picture](./images/pixel.gif)',
  'a task list item with brackets': '- [x] Done item\n- [ ] Open item',
  'a numbered h2 heading': '## 1 Overview\n\nBody.',
  'a dotted numbered h2 heading': '## 1.2 Scope with `code`\n\nBody.',
  'an h2 numbered with a trailing dot': '## 2. Release process\n\nBody.',
  'an h3 numbered with a trailing dot': '### 2. Release steps\n\nBody.',
};

for (const [name, source] of Object.entries(HOUSE_CASES)) {
  test(`house rules: ${name} round-trips`, full, async () => {
    const gate = await gateOf(browser, source);
    const candidates = gate.filter((g) => g.reason !== 'panel');
    assert.ok(candidates.length >= 1, 'a candidate block');
    assert.deepEqual(candidateFailures(gate), [], 'every candidate passes');
  });
}

test('house rules: a rewritten link and image write their original targets back', full, async () => {
  const source = '[spec](specs/x.md#a) and ![pic](./images/pixel.gif)';
  const html = renderServed({ source });
  assert.ok(html.includes('data-md-href="specs/x.md#a"'), 'the link keeps its original target');
  assert.ok(html.includes('data-md-src="./images/pixel.gif"'), 'the image keeps its original src');
  await assertRoundTrip(source);
});

// ---- frontmatter, CRLF and sourceOf (contract) --------------------------------------------------

test('sourceOf: frontmatter lines count and a CRLF file has its \\r stripped', full, async () => {
  const source = '---\r\ntitle: T\r\n---\r\n\r\n# Title\r\n\r\nFirst para\r\nline two.\r\n';
  const { page, close, errors } = await openServed(browser, renderServed({ source }));
  try {
    const got = await page.evaluate(() => ({
      heading: window.margent.sourceOf('5-5'),
      para: window.margent.sourceOf('7-8'),
    }));
    assert.equal(got.heading, '# Title');
    assert.equal(got.para, 'First para\nline two.');
    assert.deepEqual(errors, []);
    const gate = await page.evaluate(() => window.margent.gate);
    assert.deepEqual(gate.filter((g) => g.reason !== 'panel').map((g) => g.pass), [true, true]);
  } finally {
    await close();
  }
});

// ---- the gate (contract) ------------------------------------------------------------------------

test('non-candidate blocks get reason panel, and every candidate has a data-gate', async () => {
  const source = '# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\ncode\n```\n\n<div>raw</div>\n\nA paragraph.';
  const { page, close, errors } = await openServed(browser, renderServed({ source }));
  try {
    const gate = await page.evaluate(() => window.margent.gate);
    assert.deepEqual(
      gate.map((g) => [g.type, g.reason]),
      [
        ['h1', null],
        ['div', 'panel'],
        ['pre', 'panel'],
        ['div', 'panel'],
        ['p', null],
      ]
    );
    assert.ok(gate.filter((g) => g.reason === 'panel').every((g) => g.pass === false));
    const marks = await page.evaluate(() => [...document.querySelectorAll('[data-gate]')].map((e) => e.getAttribute('data-gate')));
    assert.deepEqual(marks, ['pass', 'pass']);
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('a deliberately failing block names its first differing line, and is marked fail', async () => {
  // The paragraph is lines 3-4; line 3 round-trips and line 4 has _emphasis_, which house turndown writes as *emphasis*.
  const source = '# T\n\nfirst line\n_second_ line\n';
  const { page, close, errors } = await openServed(browser, renderServed({ source }));
  try {
    const gate = await page.evaluate(() => window.margent.gate);
    const para = gate.find((g) => g.type === 'p');
    assert.equal(para.range, '3-4');
    assert.equal(para.pass, false);
    assert.equal(para.reason, 'line 4: expected "_second_ line" got "*second* line"');
    assert.equal(gate.find((g) => g.type === 'h1').pass, true);
    const marks = await page.evaluate(() => [...document.querySelectorAll('[data-gate]')].map((e) => e.getAttribute('data-gate')));
    assert.deepEqual(marks, ['pass', 'fail']);
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('a block with a data-src nested in another is not a block of its own', full, async () => {
  const html = `<!doctype html><html><body>
<script type="application/json" id="margent-state">${JSON.stringify({ path: 'x.md', hash: 'h', source: 'a\nb\n' })}</script>
<div data-src="1-2"><p data-src="1-1">a</p><p data-src="2-2">b</p></div>
<script>${EDIT_JS}</script>
</body></html>`;
  const { page, close, errors } = await openServed(browser, html);
  try {
    const ranges = await page.evaluate(() => [...window.margent.blocks.keys()]);
    assert.deepEqual(ranges, ['1-2']);
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});

test('a page without the state element fails loudly', async () => {
  const html = renderServed({ source: 'Some text.\n' }).replace(
    /<script type="application\/json" id="margent-state">[\s\S]*?<\/script>/,
    ''
  );
  const { close, errors } = await openServed(browser, html);
  try {
    assert.equal(errors.length, 1);
    assert.match(errors[0], /#margent-state is missing/);
  } finally {
    await close();
  }
});

// ---- save and dirty (contract) ------------------------------------------------------------------

test('save posts the documented body and returns the status with the parsed body', async () => {
  const seen = [];
  const save = (route, request) => {
    seen.push({ method: request.method(), type: request.headers()['content-type'], body: JSON.parse(request.postData()) });
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'stale', hash: 'new' }) });
  };
  const { page, close } = await openServed(browser, renderServed({ source: 'One.\n\nTwo.\n\nThree.\n' }), { save });
  try {
    const out = await page.evaluate(() => window.margent.save('3-3', 'Changed.'));
    assert.deepEqual(out, { status: 409, body: { error: 'stale', hash: 'new' } });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, 'POST');
    assert.equal(seen[0].type, 'application/json');
    assert.deepEqual(seen[0].body, { path: 'doc.md', range: [3, 3], hash: 'test', text: 'Changed.' });
  } finally {
    await close();
  }
});

test('save throws on a network failure', full, async () => {
  const save = (route) => route.abort();
  const { page, close } = await openServed(browser, renderServed({ source: 'One.\n' }), { save });
  try {
    await assert.rejects(page.evaluate(() => window.margent.save('1-1', 'x')));
  } finally {
    await close();
  }
});

test('dirty is false until a registered predicate reports unsaved text', full, async () => {
  const { page, close } = await openServed(browser, renderServed({ source: 'One.\n' }));
  try {
    assert.equal(await page.evaluate(() => window.margent.dirty()), false, 'no predicates');
    await page.evaluate(() => window.margent.registerDirty(() => false));
    assert.equal(await page.evaluate(() => window.margent.dirty()), false, 'a predicate that is clean');
    await page.evaluate(() => window.margent.registerDirty(() => true));
    assert.equal(await page.evaluate(() => window.margent.dirty()), true, 'a predicate that is dirty');
  } finally {
    await close();
  }
});

// Every .md under dir, recursively.
function markdownUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...markdownUnder(full));
    else if (name.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

test('every paragraph, heading and list in the frozen margent docs passes the gate (A3)', full, async () => {
  assert.ok(existsSync(MARGENT_CORPUS), `frozen margent docs at ${MARGENT_CORPUS}`);
  const found = markdownUnder(MARGENT_CORPUS);
  assert.ok(found.length > 0, 'the margent corpus has docs');
  let total = 0;
  const failures = [];
  for (const file of found) {
    const root = findDocsRoot(file);
    const source = readFileSync(file, 'utf8');
    const { page, close, errors } = await openServed(browser, renderServed({ source, root, path: file.slice(root.length + 1) }));
    try {
      const gate = await page.evaluate(() => window.margent.gate);
      assert.deepEqual(errors, [], `${file} loads cleanly`);
      const candidates = gate.filter((g) => g.reason !== 'panel');
      total += candidates.length;
      for (const f of candidateFailures(gate)) failures.push(`${file}:${f}`);
    } finally {
      await close();
    }
  }
  assert.ok(total > 0, 'the corpus has candidate blocks');
  assert.deepEqual(failures, [], 'no margent corpus block fails the gate');
});
