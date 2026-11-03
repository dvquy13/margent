// Mermaid diagrams fit their shapes and their figures in Chrome (M8 spec A4, the browser half of A5). The diagrams fixture
// is opened at a desktop and a phone width, in both colour schemes, with Google Fonts loaded and with them blocked. For
// each figure's shown layout: every node label sits inside its shape, nothing spills out of the svg, and the svg sits
// inside the figure's scrollable area. The 1365 px fixture scrolls its figure, and the page does not scroll. Run after
// `npm run build`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { full } from './helpers/tier.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const FIX = join(here, 'fixtures', 'render', 'docs');
const WIDE = join(here, 'fixtures', 'diagrams', 'width');

const { renderDoc } = await import(join(repo, '.build', 'render', 'page.js'));

const workdir = mkdtempSync(join(tmpdir(), 'margent-diagrams-fit-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

const source = readFileSync(join(FIX, 'diagrams.md'), 'utf8');
writeFileSync(join(workdir, 'diagrams.html'), renderDoc({ file: join(FIX, 'diagrams.md'), source, root: FIX, outFile: join(workdir, 'diagrams.html') }).html);
const PAGE = pathToFileURL(join(workdir, 'diagrams.html')).href;

// The 1365 px diagram from the check fixture (A5).
const wideSource = readFileSync(join(WIDE, 'wide.md'), 'utf8');
writeFileSync(join(workdir, 'wide.html'), renderDoc({ file: join(WIDE, 'wide.md'), source: wideSource, root: WIDE, outFile: join(workdir, 'wide.html') }).html);
const WIDE_PAGE = pathToFileURL(join(workdir, 'wide.html')).href;

// Launched on first use, so a run of the fast tier (where every test here is skipped) starts no Chrome.
let browser;
async function getBrowser() {
  if (!browser) browser = await chromium.launch({ channel: 'chrome' });
  return browser;
}
after(async () => {
  if (browser) await browser.close();
});

const GOOGLE_FONTS = /fonts\.(googleapis|gstatic)\.com/;
// Takes Google Sans Flex out of the UI stack. This Mac has it installed, so blocking the hosts alone still renders it.
const NO_WEB_FONT_CSS = ":root { --font-ui: 'Inter', system-ui, -apple-system, sans-serif !important; }";

// Opens a page in a fresh context. Fonts "blocked" aborts the Google Fonts hosts and drops the web font from the stack.
async function open(url, { width, colorScheme = 'light', fonts = 'loaded' }) {
  const context = await (await getBrowser()).newContext({ viewport: { width, height: 900 }, colorScheme });
  const errors = [];
  try {
    if (fonts === 'blocked') await context.route(GOOGLE_FONTS, (r) => r.abort());
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    if (fonts === 'blocked') await page.addStyleTag({ content: NO_WEB_FONT_CSS });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    return { page, errors, close: () => context.close() };
  } catch (e) {
    await context.close();
    throw e;
  }
}

// Runs in the page. For every figure, the shown layout: which layout is displayed, the labels checked against their
// shapes (with the kinds that have no shape), and the spill-out of every text, shape and edge label against the svg.
// Returns plain data; the Node side builds the messages.
function auditInPage(width) {
  const TOL = 0.5;
  const SHAPE = 'rect, polygon, circle, ellipse, path';
  const rectOf = (el) => el.getBoundingClientRect();
  const hasArea = (el) => { const b = rectOf(el); return b.width > 0 && b.height > 0; };
  const shapeOf = (el) => [...el.children].find((c) => c.matches(SHAPE) && hasArea(c)) ?? null;
  // Overflow of inner past outer on each side, in px: [left, top, right, bottom], zero when inside.
  const overflow = (inner, outer) => [
    Math.max(0, outer.left - inner.left),
    Math.max(0, outer.top - inner.top),
    Math.max(0, inner.right - outer.right),
    Math.max(0, inner.bottom - outer.bottom),
  ];
  const spills = (o) => o.some((px) => px > TOL);
  const fmt = (o) => `left ${o[0].toFixed(1)}px, top ${o[1].toFixed(1)}px, right ${o[2].toFixed(1)}px, bottom ${o[3].toFixed(1)}px`;
  const figures = [];
  for (const figure of document.querySelectorAll('figure.diagram')) {
    const wideBox = figure.querySelector('.diagram-wide');
    const narrowBox = figure.querySelector('.diagram-narrow');
    const wideShown = getComputedStyle(wideBox).display !== 'none';
    const narrowShown = getComputedStyle(narrowBox).display !== 'none';
    const visible = wideShown ? wideBox : narrowBox;
    const svg = visible.querySelector('svg');
    const figureBox = rectOf(figure);
    const svgBox = rectOf(svg);
    const labelIssues = [];
    const skipped = {};
    const checked = new Set();
    let labels = 0;
    for (const node of svg.querySelectorAll('g.pele-node')) {
      const id = node.getAttribute('data-id') ?? '(no data-id)';
      const kind = [...node.classList].filter((c) => c !== 'pele-node').join(' ');
      for (const text of node.querySelectorAll('text')) {
        if (checked.has(text) || text.textContent.trim() === '') continue;
        checked.add(text);
        // The nearest group or node above the label with its own shape: a label in a nested node takes that node's shape.
        let shape = null;
        for (let el = text.parentElement; el; el = el.parentElement) {
          shape = shapeOf(el);
          if (shape || el === node) break;
        }
        if (!shape) {
          skipped[kind] = (skipped[kind] ?? 0) + 1;
          continue;
        }
        labels++;
        const over = overflow(rectOf(text), rectOf(shape));
        if (spills(over)) {
          labelIssues.push({ id, kind, text: text.textContent.trim(), over: fmt(over), px: Math.max(...over) });
        }
      }
    }
    // Nothing spills out of the svg: texts, shapes and edge labels. Elements not drawn (in defs) have no client rects.
    // An edge label is checked only here, never against its own background: pele's width table runs a few px narrow on
    // one known two-line label, which the spec's Risks accept.
    const spillIssues = [];
    for (const el of svg.querySelectorAll('text, rect, polygon, circle, ellipse, path, g.pele-edge-label')) {
      if (el.getClientRects().length === 0) continue;
      const over = overflow(rectOf(el), svgBox);
      if (spills(over)) {
        spillIssues.push({ what: el.tagName + (el.classList.contains('pele-edge-label') ? ' pele-edge-label' : ''),
          text: el.tagName === 'text' ? el.textContent.trim() : '', over: fmt(over), px: Math.max(...over) });
      }
    }
    // The svg sits inside the figure's scrollable area: from its left edge to left + scrollWidth.
    const figureOver = [
      Math.max(0, figureBox.left - svgBox.left),
      0,
      Math.max(0, svgBox.right - (figureBox.left + figure.scrollWidth)),
      0,
    ];
    figures.push({
      src: figure.dataset.src,
      width,
      wideShown,
      narrowShown,
      labels,
      skipped,
      labelIssues,
      spillIssues,
      figureOver: spills(figureOver) ? fmt(figureOver) : null,
      fontFamilies: [...new Set([...svg.querySelectorAll('text')].map((t) => getComputedStyle(t).fontFamily))],
    });
  }
  return figures;
}

// The figures of a page, audited, with each violation as a message that names the case.
async function audit(url, { width, colorScheme, fonts }) {
  const { page, errors, close } = await open(url, { width, colorScheme, fonts });
  try {
    const figures = await page.evaluate(auditInPage, width);
    const where = `${width}px, ${colorScheme} theme, fonts ${fonts}`;
    const violations = [];
    const skipped = {};
    for (const f of figures) {
      const at = `${where}, figure ${f.src}`;
      if (f.wideShown === f.narrowShown) violations.push(`${at}: expected exactly one layout shown (wide ${f.wideShown}, narrow ${f.narrowShown})`);
      const expected = width === 1280 ? 'wide' : 'narrow';
      if ((expected === 'wide') !== f.wideShown) violations.push(`${at}: the ${expected} layout should be shown at ${width}px`);
      for (const [kind, n] of Object.entries(f.skipped)) skipped[kind] = (skipped[kind] ?? 0) + n;
      for (const issue of f.labelIssues) {
        violations.push(`${at}, node data-id "${issue.id}" (${issue.kind}): label "${issue.text}" overflows its shape by ${issue.px.toFixed(1)}px (${issue.over})`);
      }
      for (const issue of f.spillIssues) {
        violations.push(`${at}: ${issue.what}${issue.text ? ` "${issue.text}"` : ''} spills out of the svg by ${issue.px.toFixed(1)}px (${issue.over})`);
      }
      if (f.figureOver) violations.push(`${at}: the svg spills out of the figure's scrollable area (${f.figureOver})`);
    }
    for (const f of figures) {
      const web = f.fontFamilies.filter((family) => /^["']?Google Sans Flex/.test(family));
      if (fonts === 'blocked' && web.length) violations.push(`${where}, figure ${f.src}: a label still uses Google Sans Flex (${web[0]})`);
      if (fonts === 'loaded' && web.length !== f.fontFamilies.length) violations.push(`${where}, figure ${f.src}: a label is not in Google Sans Flex (${f.fontFamilies.join(' | ')})`);
    }
    assert.deepEqual(errors, [], `${where}: page errors`);
    return { figures, skipped, violations };
  } finally {
    await close();
  }
}

for (const width of [1280, 390]) {
  for (const colorScheme of ['light', 'dark']) {
    for (const fonts of ['loaded', 'blocked']) {
      test(`A4 at ${width}px, ${colorScheme} theme, fonts ${fonts}: node labels fit their shapes, nothing spills out of a figure, and the expected layout shows`, full, async () => {
        const { figures, skipped, violations } = await audit(PAGE, { width, colorScheme, fonts });
        assert.equal(figures.length, 11, 'one figure per diagram in the fixture');
        assert.equal(violations.length, 0, `${violations.length} violation(s):\n  ${violations.join('\n  ')}`);
        // Skipped labels are listed in the test output so the skipped kinds stay visible.
        if (Object.keys(skipped).length) console.log(`A4 ${width}px ${colorScheme} ${fonts}: labels with no shape, not checked against one: ${JSON.stringify(skipped)}`);
      });
    }
  }
}

test('A5: the 1365 px diagram\'s figure scrolls sideways, and the page does not', full, async () => {
  const { page, errors, close } = await open(WIDE_PAGE, { width: 1280, fonts: 'blocked' });
  try {
    const figure = await page.evaluate(() => {
      const f = document.querySelector('figure.diagram');
      return { scrollWidth: f.scrollWidth, clientWidth: f.clientWidth };
    });
    assert.ok(figure.scrollWidth > figure.clientWidth + 1,
      `figure scrolls sideways at 1280px (scrollWidth ${figure.scrollWidth}px, clientWidth ${figure.clientWidth}px)`);
    const body = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }));
    assert.ok(body.scroll <= body.inner,
      `the page body scrolls sideways at 1280px (scrollWidth ${body.scroll}px, innerWidth ${body.inner}px)`);
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});
