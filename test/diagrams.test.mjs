// Mermaid fences render as two pele layouts (spec D1), load pele lazily (D7), and keep their licence (D7.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { versionless } from './helpers/version.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const FIX = join(here, 'fixtures', 'render', 'docs');
const GOLDEN = join(here, 'golden', 'render');
const CLI = join(repo, 'dist', 'cli.js');

// Imported from .build/ (run `npm run build` first).
const { renderBody } = await import('../.build/render/markdown.js');
const { renderDoc } = await import('../.build/render/page.js');

// Byte-for-byte golden comparison. UPDATE_GOLDEN=1 rewrites the golden file instead.
function assertGolden(name, html) {
  const actual = versionless(html);
  const path = join(GOLDEN, `${name}.html`);
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(GOLDEN, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  assert.ok(existsSync(path), `golden ${name} is missing (run with UPDATE_GOLDEN=1 and review it)`);
  assert.equal(actual, readFileSync(path, 'utf8'), `golden ${name} differs (rerun with UPDATE_GOLDEN=1 if the change is intended)`);
}

function body(source) {
  const file = join(FIX, 'inline.md');
  const r = renderBody(source, { file, root: FIX, outFile: join(FIX, 'inline.html') });
  return { ...r, main: r.hero + r.main }; // a doc without a ## section keeps its blocks in the hero
}

const DIAGRAM = '```mermaid\nflowchart LR\n  A[Start] --> B[End]\n```\n';

test('D1.1 a mermaid fence renders a figure with both layouts and its data-src', () => {
  const r = body(`# T\n\nIntro.\n\n${DIAGRAM}`);
  const figure = r.main.match(/<figure class="diagram" data-src="5-8">([\s\S]*?)<\/figure>/);
  assert.ok(figure, r.main);
  assert.match(figure[1], /^<div class="diagram-wide" style="--w:\d+px"><svg[^>]*>[\s\S]*<\/svg><\/div>/);
  assert.match(figure[1], /<div class="diagram-narrow" style="--w:\d+px"><svg[^>]*>[\s\S]*<\/svg><\/div>$/);
  assert.equal((figure[1].match(/<svg[\s>]/g) ?? []).length, 2, 'two SVGs, one per layout');
  assert.ok(!r.main.includes('<pre'), 'no code block for a diagram');
});

test('D1.1 a js fence and a mermaidx fence still render as code, and a mermaid title still renders a diagram', () => {
  const js = body('```js\nconst x = 1;\n```\n');
  assert.match(js.main, /<pre data-src="1-3"><code class="language-js">const x = 1;\n<\/code><\/pre>/);
  assert.ok(!js.main.includes('<figure'));
  const mx = body('```mermaidx\nflowchart LR\n  A --> B\n```\n');
  assert.match(mx.main, /<pre data-src="1-4"><code class="language-mermaidx">/);
  assert.ok(!mx.main.includes('<figure'));
  const titled = body('```mermaid title\nflowchart LR\n  A --> B\n```\n');
  assert.match(titled.main, /<figure class="diagram" data-src="1-4">/);
});

test('D1.2 two diagrams in one doc get distinct idPrefixes, and no id repeats on the page', () => {
  // pele puts idPrefix on the ids it writes, and an accTitle is the one such id on a plain flowchart.
  const titled = DIAGRAM.replace('flowchart LR\n', 'flowchart LR\n  accTitle: Example flow\n');
  const r = body(`${titled}\nBetween.\n\n${titled}`);
  for (const prefix of ['d0w-', 'd0n-', 'd1w-', 'd1n-']) {
    assert.ok(r.main.includes(` id="${prefix}-title"`), `prefix ${prefix} names an id on the page`);
  }
  const ids = [...r.main.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'every id on the page is unique');
});

test('D1.3 a gantt has no today marker', () => {
  const gantt = '```mermaid\ngantt\n  dateFormat YYYY-MM-DD\n  section Build\n  Spike :done, s1, 2026-11-03, 1d\n```\n';
  const r = body(gantt);
  assert.ok(!r.main.includes('pele-today'), 'the today line is drawn only without todayMarker off');
});

test('D1.4 the same markdown renders the same bytes in UTC and in Los Angeles', () => {
  const file = join(FIX, 'diagrams.md');
  const script = `
    const { renderDoc } = await import(${JSON.stringify(join(repo, '.build', 'render', 'page.js'))});
    const { readFileSync } = await import('node:fs');
    const file = ${JSON.stringify(file)};
    process.stdout.write(renderDoc({ file, source: readFileSync(file, 'utf8'), root: ${JSON.stringify(FIX)}, outFile: ${JSON.stringify(join(FIX, 'diagrams.html'))} }).html);
  `;
  const render = (tz) => execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: tz },
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf8',
  });
  const utc = render('UTC');
  const la = render('America/Los_Angeles');
  assert.ok(utc.includes('<figure class="diagram"'), 'the fixture has diagrams');
  assert.equal(la, utc);
});

test('D1.7 a doc without a mermaid fence has no diagram in its body or its figures', () => {
  const file = join(FIX, 'basic.md');
  const source = readFileSync(file, 'utf8');
  const r = renderBody(source, { file, root: FIX, outFile: join(FIX, 'basic.html') });
  assert.ok(!(r.hero + r.toc + r.main).includes('diagram'));
  assert.deepEqual(r.diagrams, []);
  const out = renderDoc({ file, source, root: FIX, outFile: join(FIX, 'basic.html') });
  assert.ok(!out.html.includes('class="diagram'));
  assert.deepEqual(out.diagrams, []);
});

test('renderDoc returns each diagram with its line and its wide width, which is the width its wide layout carries', () => {
  const file = join(FIX, 'diagrams.md');
  const out = renderDoc({ file, source: readFileSync(file, 'utf8'), root: FIX, outFile: join(FIX, 'diagrams.html') });
  assert.equal(out.diagrams.length, 11);
  assert.deepEqual(out.diagrams[0].line, 7);
  for (const d of out.diagrams) {
    assert.equal(typeof d.width, 'number');
    assert.ok(d.width > 0, `width of the diagram at line ${d.line}`);
  }
  const wide = out.html.match(/<div class="diagram-wide" style="--w:(\d+)px">/);
  assert.equal(Number(wide[1]), out.diagrams[0].width);
});

test('golden page for the diagrams fixture: one of each type, with captions', () => {
  const file = join(FIX, 'diagrams.md');
  const out = renderDoc({ file, source: readFileSync(file, 'utf8'), root: FIX, outFile: join(FIX, 'diagrams.html') });
  assertGolden('diagrams.page', out.html);
});

test('D7.2 the CLI bundle starts pele only from loadPele, so a command with no diagram never evaluates it', () => {
  // esbuild wraps the ESM package in a lazy init (`__esm`); the only call to it is inside loadPele().
  const cli = readFileSync(CLI, 'utf8');
  assert.ok(cli.includes('var init_pele = __esm({'), 'pele is a lazy __esm module');
  const calls = [...cli.matchAll(/init_pele\(\)/g)].map((m) => m.index);
  assert.equal(calls.length, 1, 'exactly one call starts pele');
  const loader = cli.indexOf('function loadPele() {');
  assert.ok(loader >= 0 && calls[0] > loader && calls[0] < cli.indexOf('\n}\n', loader), 'the call is inside loadPele');
});

test('D7.3 the CLI bundle ends with the LICENSE text of every package it bundles, pele and the edit runtime\'s turndown included', () => {
  const cli = readFileSync(CLI, 'utf8');
  const notices = cli.slice(cli.lastIndexOf('/*! Bundled third-party licences'));
  for (const name of ['pele', 'turndown', 'markdown-it', 'yaml']) {
    const { version } = JSON.parse(readFileSync(join(repo, 'node_modules', name, 'package.json'), 'utf8'));
    assert.ok(notices.includes(`\n${name} ${version}\n`), `${name} ${version} has its notice`);
  }
  assert.ok(notices.includes('Copyright (c) 2026 kepano'), "pele's MIT copyright line ships");
});
