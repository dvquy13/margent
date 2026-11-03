// Mermaid diagrams in Chrome (M8 spec D1.5, D1.6, D4.1). The diagrams fixture is rendered to a page and opened at a
// desktop and a phone width. The shown layout follows the figure's width, no svg goes below 75% of its natural width, and
// the figure scrolls only when that floor is wider than the figure. Diagrams take the page tokens, so dark mode and the
// theme toggle change them with no re-render. Run after `npm run build`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const FIX = join(here, 'fixtures', 'render', 'docs');

const { renderDoc } = await import(join(repo, '.build', 'render', 'page.js'));

const workdir = mkdtempSync(join(tmpdir(), 'margent-diagrams-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

const source = readFileSync(join(FIX, 'diagrams.md'), 'utf8');
const rendered = renderDoc({ file: join(FIX, 'diagrams.md'), source, root: FIX, outFile: join(workdir, 'diagrams.html') });
const PAGE = pathToFileURL(join(workdir, 'diagrams.html')).href;
writeFileSync(join(workdir, 'diagrams.html'), rendered.html);

let browser;
before(async () => {
  browser = await chromium.launch({ channel: 'chrome' });
});
after(async () => {
  await browser.close();
});

// A page at the given width and colour scheme, with Google Fonts blocked so every run lays out the same text.
async function open(width, colorScheme = 'light') {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PAGE);
  await page.evaluate(() => document.fonts.ready);
  return { page, errors, close: () => context.close() };
}

// Every figure, with whether each layout is displayed, and for the shown svg its width, its --w and the figure's overflow.
async function layouts(page) {
  return page.evaluate(() => [...document.querySelectorAll('figure.diagram')].map((figure) => {
    const shown = (sel) => getComputedStyle(figure.querySelector(sel)).display !== 'none';
    const wideShown = shown('.diagram-wide');
    const visible = figure.querySelector(wideShown ? '.diagram-wide' : '.diagram-narrow');
    const svg = visible.querySelector('svg');
    const w = parseFloat(getComputedStyle(visible).getPropertyValue('--w'));
    return {
      id: figure.dataset.src,
      wideShown,
      narrowShown: shown('.diagram-narrow'),
      svgWidth: svg.getBoundingClientRect().width,
      natural: w,
      figureWidth: figure.clientWidth,
      scrolls: figure.scrollWidth > figure.clientWidth + 1
    };
  }));
}

test('D1.5 at 1280px every figure shows the wide layout, and at 390px the narrow one', async () => {
  const desktop = await open(1280);
  try {
    const rows = await layouts(desktop.page);
    assert.equal(rows.length, rendered.diagrams.length, 'one figure per diagram in the fixture');
    for (const r of rows) {
      assert.ok(r.wideShown && !r.narrowShown, `figure ${r.id} at 1280px shows the wide layout`);
    }
    assert.deepEqual(desktop.errors, []);
  } finally {
    await desktop.close();
  }
  const phone = await open(390);
  try {
    const rows = await layouts(phone.page);
    assert.equal(rows.length, rendered.diagrams.length);
    for (const r of rows) {
      assert.ok(!r.wideShown && r.narrowShown, `figure ${r.id} at 390px shows the narrow layout`);
    }
    assert.deepEqual(phone.errors, []);
  } finally {
    await phone.close();
  }
});

test('D1.5 print shows the wide layout (print media, not a screen width)', async () => {
  const { page, close } = await open(390);
  try {
    await page.emulateMedia({ media: 'print' });
    const rows = await layouts(page);
    for (const r of rows) assert.ok(r.wideShown && !r.narrowShown, `figure ${r.id} prints the wide layout`);
  } finally {
    await close();
  }
});

test('D1.6 the shown svg is never narrower than 75% of its natural width, at both widths', async () => {
  for (const width of [1280, 390]) {
    const { page, close } = await open(width);
    try {
      const rows = await layouts(page);
      for (const r of rows) {
        assert.ok(r.svgWidth >= r.natural * 0.75 - 0.5,
          `figure ${r.id} at ${width}px: svg ${r.svgWidth.toFixed(1)}px is under 75% of ${r.natural}px`);
      }
    } finally {
      await close();
    }
  }
});

test('D1.6 a figure scrolls sideways only when 75% of its natural width is wider than the figure', async () => {
  for (const width of [1280, 390]) {
    const { page, close } = await open(width);
    try {
      const rows = await layouts(page);
      for (const r of rows) {
        const floorWider = r.natural * 0.75 > r.figureWidth + 1;
        assert.equal(r.scrolls, floorWider,
          `figure ${r.id} at ${width}px: floor ${(r.natural * 0.75).toFixed(0)}px, figure ${r.figureWidth}px, scrolls ${r.scrolls}`);
      }
    } finally {
      await close();
    }
  }
});

// The fixture's widest diagram is 800px, under the 900px column, so nothing there scrolls. A sequence diagram cannot turn
// its direction, so 14 participants stay about 2000px wide: at 1280px the floor (75%) is wider than the 900px figure, so
// the figure scrolls, and the svg stays at the floor.
test('D1.6 a diagram whose 75% floor is wider than its figure scrolls, and its svg stops at the floor', async () => {
  const people = Array.from({ length: 14 }, (_, i) => `  participant P${i} as Participant number ${i + 1}`);
  const doc = `# Wide\n\n## Sequence\n\n\`\`\`mermaid\nsequenceDiagram\n${people.join('\n')}\n  P0->>P13: hello\n\`\`\`\n`;
  const out = renderDoc({ file: join(FIX, 'wide.md'), source: doc, root: FIX, outFile: join(workdir, 'wide.html') });
  const wideUrl = pathToFileURL(join(workdir, 'wide.html')).href;
  writeFileSync(join(workdir, 'wide.html'), out.html);
  const natural = out.diagrams[0].width;
  assert.ok(natural * 0.75 > 900, `the chain's floor ${natural * 0.75}px is wider than the 900px column`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await context.newPage();
  try {
    await page.goto(wideUrl);
    const row = (await layouts(page))[0];
    assert.equal(row.scrolls, true, 'the figure scrolls sideways');
    assert.ok(row.svgWidth >= natural * 0.75 - 0.5, `svg ${row.svgWidth}px is at least 75% of ${natural}px`);
    assert.ok(row.svgWidth < natural, 'the svg is narrower than its natural width, so the floor is what holds it');
  } finally {
    await context.close();
  }
});

test('D4.1 diagrams take the page tokens: dark mode and the theme toggle change pele\'s colours with no re-render', async () => {
  const light = await open(1280, 'light');
  let lightBg;
  let lightAccent;
  try {
    lightBg = await light.page.evaluate(() => getComputedStyle(document.querySelector('figure.diagram')).getPropertyValue('--pele-bg').trim());
    lightAccent = await light.page.evaluate(() => getComputedStyle(document.querySelector('figure.diagram')).getPropertyValue('--pele-accent').trim());
    // The toggle sets data-theme on the root: the same page, flipped in place.
    await light.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const toggled = await light.page.evaluate(() => {
      const f = document.querySelector('figure.diagram');
      return {
        bg: getComputedStyle(f).getPropertyValue('--pele-bg').trim(),
        accent: getComputedStyle(f).getPropertyValue('--pele-accent').trim(),
        nodeFill: getComputedStyle(document.querySelector('figure.diagram .pele-node.go > rect')).fill
      };
    });
    assert.notEqual(toggled.bg, lightBg, 'the toggle changes --pele-bg');
    assert.notEqual(toggled.accent, lightAccent, 'the toggle changes --pele-accent');
    assert.ok(toggled.nodeFill, 'a go node has a computed fill');
  } finally {
    await light.close();
  }
  const dark = await open(1280, 'dark');
  try {
    const bg = await dark.page.evaluate(() => getComputedStyle(document.querySelector('figure.diagram')).getPropertyValue('--pele-bg').trim());
    assert.notEqual(bg, lightBg, 'dark mode changes --pele-bg');
    assert.deepEqual(dark.errors, []);
  } finally {
    await dark.close();
  }
});

test('D4.2 the series palette has no status colour: no --pele-series value is written from --green, --amber or --red', () => {
  const css = readFileSync(join(repo, 'shell', 'diagrams.css'), 'utf8');
  const series = [...css.matchAll(/--pele-series-\d:[^;]*;/g)].map((m) => m[0]);
  assert.equal(series.length, 8, 'eight series colours');
  for (const line of series) assert.doesNotMatch(line, /--(green|amber|red)\b/, line);
});
