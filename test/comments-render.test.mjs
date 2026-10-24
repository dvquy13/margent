// Comment markup in the renderer (M3 spec R1 to R3; plan T2): the thread list, the render contract, the check errors
// (A4) and the headings (A5). Run after `npm run build`. The error fixtures live in test/fixtures/comments/errors/,
// which no folder test walks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARGENT_CORPUS } from './helpers/corpus.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const CLI = join(repo, 'dist', 'cli.js');
const FIX = join(here, 'fixtures', 'comments');
const ERRORS = join(FIX, 'errors');
const GOLDEN = join(here, 'golden', 'render');

// Imported from .build/ (run `npm run build` first). Each bundle carries its own copy of RenderError,
// so errors are matched by name, not by instanceof.
const { renderBody } = await import('../.build/render/markdown.js');
const { renderDoc } = await import('../.build/render/page.js');

const workdir = mkdtempSync(join(tmpdir(), 'margent-comments-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

// Byte-for-byte golden comparison. UPDATE_GOLDEN=1 rewrites the golden file instead.
function assertGolden(name, actual) {
  const path = join(GOLDEN, `${name}.html`);
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(GOLDEN, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  assert.equal(actual, readFileSync(path, 'utf8'), `golden ${name} differs (rerun with UPDATE_GOLDEN=1 if the change is intended)`);
}

function bodyDump(r) {
  return `<!-- hero -->\n${r.hero}<!-- toc -->\n${r.toc}\n<!-- main -->\n${r.main}`;
}

function render(file, root = FIX) {
  return renderBody(readFileSync(file, 'utf8'), { file, root, outFile: join(root, 'out.html') });
}

// Runs `margent check` from the repo root, as the plugin does. Chrome is never launched without islands.
function check(path) {
  const cache = mkdtempSync(join(workdir, 'cache-'));
  return spawnSync(process.execPath, [CLI, 'check', path], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, BROWSER: 'true', XDG_CACHE_HOME: cache, MARGENT_CHROME: '' },
  });
}

// ---- the all-kinds doc (R1, R2)

const ALL_KINDS = join(FIX, 'all-kinds.md');

test('all-kinds body matches its golden', () => {
  assertGolden('all-kinds.body', bodyDump(render(ALL_KINDS)));
});

test('all-kinds: one Thread per thread, in document order, with the record fields of the contract', () => {
  const r = render(ALL_KINDS);
  assert.deepEqual(r.comments, [
    {
      id: 'c1',
      line: 9,
      kind: 'inline',
      block: '9-9',
      highlight: '96% of rendered pages',
      notes: [
        { id: 'c1', author: 'Quy', text: 'is that stable across repos?' },
        { id: 'c1', author: 'Claude', text: 'Measured on 4 repos in S3.' },
      ],
    },
    {
      id: 'c3',
      line: 11,
      kind: 'point',
      block: '11-11',
      notes: [{ id: 'c3', author: 'Quy', text: 'Cite the source for this.' }],
    },
    {
      id: 'c4',
      line: 13,
      kind: 'inline',
      block: '13-13',
      highlight: 'per month',
      notes: [{ id: 'c4', author: 'Quy', text: 'or per run?' }],
    },
    {
      id: 'c5',
      line: 15,
      kind: 'inline',
      block: '15-15',
      highlight: '$40',
      notes: [{ id: 'c5', author: 'Claude', text: 'Per run, from the S3 log.' }],
    },
    {
      id: 'c6',
      line: 21,
      kind: 'block',
      block: '21-21',
      anchor: '17-19',
      anchorKind: 'table',
      notes: [{ id: 'c6', author: 'Quy', text: 'S1 is missing from this table.' }],
    },
    {
      id: 'c7',
      line: 23,
      kind: 'block',
      block: '23-23',
      anchor: '17-19',
      anchorKind: 'table',
      notes: [{ id: 'c7', author: 'Quy', text: 'Add S4 too.' }],
    },
    {
      id: 'c8',
      line: 25,
      kind: 'inline',
      block: '25-26',
      highlight: 'an inline note',
      notes: [{ id: 'c8', author: 'Quy', text: 'keep it short.' }],
    },
  ]);
});

test('all-kinds: the header meta ends with the open count, and the page carries the render contract', () => {
  const file = ALL_KINDS;
  const page = renderDoc({ file, source: readFileSync(file, 'utf8'), root: FIX, outFile: join(FIX, 'all-kinds.html') });
  assert.equal(page.comments.length, 7);
  assert.match(page.html, /<span class="top-meta">draft · 2026-10-24 · 7 open<\/span>/);
  assert.match(
    page.html,
    /<mark class="c-hl" data-c="c1">96% of <strong>rendered<\/strong> pages<\/mark><span class="c-thread" data-c="c1" data-md="\{&gt;&gt;\[c1\] Quy: is that stable across repos\?&lt;&lt;\}\{&gt;&gt;\[c1\] Claude: Measured on 4 repos in S3\.&lt;&lt;\}" contenteditable="false"><span class="c-note"><b class="c-author">Quy<\/b> is that stable across repos\?<\/span><span class="c-note"><b class="c-author">Claude<\/b> Measured on 4 repos in S3\.<\/span><\/span>/
  );
  assert.match(page.html, /<p class="c-line" data-src="21-21" data-anchor="17-19">/);
});

test('all-kinds: markup in a fence and in a code span stays text (R1.7)', () => {
  const r = render(ALL_KINDS);
  assert.ok(r.main.includes('<code class="language-text">') || r.main.includes('<pre data-src="30-32"><code class="language-text">'));
  assert.ok(r.main.includes('{&gt;&gt;[c9] X: y&lt;&lt;}'), 'code span kept its markup as text');
  assert.ok(r.main.includes('{==this stays text==}'), 'escaped \\{ stays text');
});

// ---- quoted block comments (M3 T13): a quote on a block thread's first note only

const QUOTED = join(FIX, 'quoted.md');

test('T13: only the block thread records a quote; an inline note that looks like one stays plain text', () => {
  const r = render(QUOTED);
  assert.deepEqual(r.comments, [
    {
      id: 'c1',
      line: 14,
      kind: 'block',
      block: '14-14',
      anchor: '9-12',
      anchorKind: 'table',
      quote: 'Forum and Wiki are out',
      notes: [
        { id: 'c1', author: 'Quy', text: '"Forum and Wiki are out" → why are these left out?' },
        { id: 'c1', author: 'Claude', text: 'They were excluded before the sample was drawn.' },
      ],
    },
    {
      id: 'c2',
      line: 16,
      kind: 'inline',
      block: '16-16',
      highlight: 'stays plain',
      notes: [{ id: 'c2', author: 'Quy', text: '"x" → y' }],
    },
  ]);
  assert.equal('quote' in r.comments[1], false);
});

test('T13: a quoted block comment renders its quote in the first note, and data-md stays the exact source', () => {
  const r = render(QUOTED);
  const block =
    '<p class="c-line" data-src="14-14" data-anchor="9-12">' +
    '<span class="c-thread" data-c="c1" data-md="{&gt;&gt;[c1] Quy: &quot;Forum and Wiki are out&quot; → why are these left out?&lt;&lt;}{&gt;&gt;[c1] Claude: They were excluded before the sample was drawn.&lt;&lt;}" contenteditable="false">' +
    '<span class="c-note"><b class="c-author">Quy</b> <q class="c-quote">Forum and Wiki are out</q> why are these left out?</span>' +
    '<span class="c-note"><b class="c-author">Claude</b> They were excluded before the sample was drawn.</span>' +
    '</span></p>';
  const body = bodyDump(r);
  assert.ok(body.includes(block), body);
  assert.equal(body.split('c-quote').length - 1, 1, 'only the block thread shows a quote');
});

test('T13: an inline note whose text starts with "x" → y renders as plain note text, with no q', () => {
  const body = bodyDump(render(QUOTED));
  assert.ok(
    body.includes(
      '<mark class="c-hl" data-c="c2">stays plain</mark><span class="c-thread" data-c="c2" data-md="{&gt;&gt;[c2] Quy: &quot;x&quot; → y&lt;&lt;}" contenteditable="false"><span class="c-note"><b class="c-author">Quy</b> &quot;x&quot; → y</span></span>'
    ),
    body
  );
});

// ---- headings (R2.2, A5)

test('A5: a commented heading keeps its slug and its TOC label', () => {
  const r = render(ALL_KINDS);
  assert.ok(r.main.includes('<section id="2-costs-per-month">'), r.main);
  assert.ok(r.toc.includes('<a href="#2-costs-per-month"><span class="num">2</span>Costs per month</a>'), r.toc);
});

test('A5: commenting a heading changes neither its slug nor its TOC entry', () => {
  const plain = '---\ntitle: Plain\n---\n\n# Plain\n\n## 2 Costs per month\n\nText.\n';
  const commented = '---\ntitle: Plain\n---\n\n# Plain\n\n## 2 Costs {==per month==}{>>[c1] Quy: or per run?<<}\n\nText.\n';
  const file = join(workdir, 'heading.md');
  const make = (source) => renderBody(source, { file, root: workdir, outFile: join(workdir, 'heading.html') });
  const a = make(plain);
  const b = make(commented);
  assert.equal(b.toc, a.toc);
  assert.ok(b.main.startsWith('<section id="2-costs-per-month">\n'), b.main);
});

test('A5: a commented heading without a number keeps the slug of its plain text (R2.2 example)', () => {
  const source = '---\ntitle: Costs\n---\n\n# Costs\n\n## Costs {==per month==}{>>[c5] Quy: or per run?<<}\n';
  const r = renderBody(source, { file: join(workdir, 'costs.md'), root: workdir, outFile: join(workdir, 'costs.html') });
  assert.ok(r.main.includes('<section id="costs-per-month">'), r.main);
  assert.ok(r.toc.includes('<a href="#costs-per-month">Costs per month</a>'), r.toc);
});

// ---- check errors (R3, A4): each fixture fails at its line, with its message

const ERROR_FIXTURES = [
  ['unclosed-highlight.md', 7, 'unclosed {==: add ==} after the highlighted text, in the same paragraph'],
  ['unclosed-note.md', 7, 'unclosed {>>: add <<} after the note text'],
  ['bad-head.md', 7, 'malformed comment note: expected {>>[c{n}] {author}: {text}<<}'],
  ['empty-text.md', 7, 'comment note has no text: write the note after "{author}: "'],
  ['highlight-no-note.md', 7, 'highlight has no note after it: add {>>[c{n}] {author}: {text}<<} right after the ==}'],
  ['duplicate-id.md', 9, 'ID c3 names two threads: give each thread its own ID'],
  ['split-thread.md', 9, "thread c3's notes are split apart: keep a thread's notes together"],
  [
    'table-cell.md',
    7,
    'comment markup cannot go in a table cell, because island data is read from cell source: add a block comment line after the table instead',
  ],
  [
    'island-yaml.md',
    9,
    'comment markup cannot go in island YAML, because island data is read from it: add a block comment line after the island instead',
  ],
  [
    'no-block-above.md',
    5,
    'block comment line has no block above it: put it after a block, or write the note inside text',
  ],
  [
    'figure-caption.md',
    7,
    'comment markup cannot go in a figure caption: add a block comment line after the figure instead',
  ],
];

for (const [name, line, message] of ERROR_FIXTURES) {
  test(`R3: ${name} is a RenderError at line ${line}`, () => {
    let err;
    try {
      render(join(ERRORS, name), ERRORS);
    } catch (e) {
      err = e;
    }
    assert.ok(err, `${name} rendered, but a RenderError was expected`);
    assert.equal(err.name, 'RenderError', err.message);
    assert.equal(err.line, line);
    assert.equal(err.detail, message);
  });

  test(`A4: check of ${name} exits 1 with file:line and the message`, () => {
    const path = join(relative(repo, ERRORS), name);
    const r = check(path);
    assert.equal(r.status, 1, r.stderr);
    assert.equal(r.stdout, `${path}:${line}: ${message}\n`);
  });
}

test('A4: check of the all-kinds doc passes', () => {
  const r = check(relative(repo, ALL_KINDS));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'ok 1 docs, 0 islands\n');
});

// ---- docs with no comments (R2.5)

// Every .md under a folder, recursively, sorted.
function markdownUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownUnder(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

for (const [label, dir] of [
  ['the frozen margent docs/', MARGENT_CORPUS],
]) {
  test(`every .md under ${label} renders with no comments and no error`, () => {
    assert.ok(existsSync(dir), `${dir} is missing`);
    const files = markdownUnder(dir);
    assert.ok(files.length > 0, `no .md files under ${dir}`);
    for (const file of files) {
      const r = render(file, dir);
      assert.deepEqual(r.comments, [], `${relative(dir, file)} has comments`);
    }
  });
}
