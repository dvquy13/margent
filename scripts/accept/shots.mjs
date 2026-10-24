// Acceptance A8 and A9: layout and theme of a rendered page.
// Usage: node scripts/accept/shots.mjs {page.html} {outDir}
// For widths 1280 and 390, and themes light, dark-toggle (click #theme-toggle from light) and dark-system
// (prefers-color-scheme: dark, no toggle), it writes a full-page screenshot to {outDir}/{name}-{width}-{theme}.png
// and checks:
//   - no horizontal page scroll: documentElement.scrollWidth <= the viewport width;
//   - every <agent-island> has data-state="rendered" (and no console or page errors);
//   - the toggle restyles the page: body background-color differs between light and dark-toggle;
//   - the toggle restyles every island: some computed color, background-color, fill or stroke inside each island's
//     shadow root (read inside its frame) differs between light and dark-toggle;
//   - the toggle restyles every inline SVG figure: some computed color, fill or stroke of an element inside each
//     `figure svg` differs between light and dark-toggle;
//   - dark-system matches dark-toggle on the same properties (both routes give the same dark theme).
// Prints a summary table. Exit 0 when every check passes, 1 on any failure, 2 on bad usage.
import { mkdirSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { islandFrame, openPage, withBrowser } from '../../test/helpers/browser.mjs';

const WIDTHS = [1280, 390];
const HEIGHT = 900;
// The properties the theme can change. Each function below defines them itself, since it runs in a page or a frame.
// The page's own colors and every inline SVG figure are read in the page.
// Every island's guest is read inside its srcdoc frame, where its shadow content lives (M5 R3). An island that did not
// render has no guest; check() reports that island, so its signature list is empty here.
async function themeSnapshot(page) {
  const pageSide = await page.evaluate(() => {
    const PROPS = ['color', 'background-color', 'fill', 'stroke'];
    const sig = (el) => {
      const cs = getComputedStyle(el);
      return PROPS.map((p) => cs.getPropertyValue(p)).join('|');
    };
    return {
      body: getComputedStyle(document.body).backgroundColor,
      names: [...document.querySelectorAll('agent-island')].map((host) => host.getAttribute('name')),
      figures: [...document.querySelectorAll('figure svg')].map((svg) => ({
        sigs: [svg, ...svg.querySelectorAll('*')].map(sig),
      })),
    };
  });
  const islands = [];
  for (const [i, name] of pageSide.names.entries()) {
    const frame = await islandFrame(page, i);
    islands.push({
      name,
      sigs: await frame.evaluate(() => {
        const PROPS = ['color', 'background-color', 'fill', 'stroke'];
        const sig = (el) => {
          const cs = getComputedStyle(el);
          return PROPS.map((p) => cs.getPropertyValue(p)).join('|');
        };
        const host = [...document.body.children].find((e) => e.shadowRoot);
        return host ? [...host.shadowRoot.querySelectorAll('*')].map(sig) : [];
      }),
    });
  }
  return { body: pageSide.body, islands, figures: pageSide.figures };
}

function layoutFacts() {
  return {
    scrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    islands: [...document.querySelectorAll('agent-island')].map((h) => ({
      name: h.getAttribute('name'),
      state: h.getAttribute('data-state'),
    })),
    figures: document.querySelectorAll('figure svg').length,
    theme: document.documentElement.getAttribute('data-theme'),
  };
}

// Waits for CSS transitions and the island theme refresh (triggered by the data-theme mutation) to settle.
async function settle(page) {
  await page.evaluate(
    () =>
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))).then(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      )
  );
}

// Names the properties that changed between two snapshots, or null when nothing did.
function restyled(a, b) {
  const failures = [];
  if (a.body === b.body) failures.push(`page background unchanged (${a.body})`);
  for (const [i, island] of a.islands.entries()) {
    const other = b.islands[i].sigs;
    const changed = island.sigs.some((s, k) => s !== other[k]);
    if (!changed) failures.push(`island ${island.name} unchanged by the toggle`);
  }
  for (const [i, fig] of a.figures.entries()) {
    const other = b.figures[i].sigs;
    const changed = fig.sigs.some((s, k) => s !== other[k]);
    if (!changed) failures.push(`figure ${i + 1} svg unchanged by the toggle`);
  }
  return failures;
}

function sameTheme(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main([pageArg, outArg]) {
  if (!pageArg || !outArg) {
    process.stderr.write('usage: node scripts/accept/shots.mjs {page.html} {outDir}\n');
    return 2;
  }
  const pagePath = resolve(pageArg);
  const outDir = resolve(outArg);
  mkdirSync(outDir, { recursive: true });
  const name = basename(pagePath).replace(/\.html$/, '');
  const rows = [];
  const failures = [];

  await withBrowser(async (browser) => {
    for (const width of WIDTHS) {
      const viewport = { width, height: HEIGHT };
      const shot = (theme) => join(outDir, `${name}-${width}-${theme}.png`);
      const fail = (theme, msg) => failures.push(`${name} ${width} ${theme}: ${msg}`);
      const check = async (theme, opened) => {
        const facts = await opened.page.evaluate(layoutFacts);
        for (const e of opened.errors) fail(theme, e);
        if (facts.scrollWidth > facts.viewport) fail(theme, `horizontal scroll ${facts.scrollWidth} > ${facts.viewport}`);
        for (const isl of facts.islands) {
          if (isl.state !== 'rendered') fail(theme, `island ${isl.name} is ${isl.state ?? 'not set'}, not rendered`);
        }
        return facts;
      };

      // light
      const light = await openPage(browser, pagePath, { colorScheme: 'light', viewport });
      let lightSnap;
      let lightFacts;
      try {
        lightFacts = await check('light', light);
        lightSnap = await themeSnapshot(light.page);
        await light.page.screenshot({ path: shot('light'), fullPage: true });
      } finally {
        await light.close();
      }

      // dark via the header toggle, from light
      const toggled = await openPage(browser, pagePath, { colorScheme: 'light', viewport });
      let toggleSnap;
      let toggleFacts;
      try {
        if ((await toggled.page.locator('#theme-toggle').count()) === 0) {
          fail('dark-toggle', 'no #theme-toggle button');
        } else {
          await toggled.page.click('#theme-toggle');
          await toggled.page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
          await settle(toggled.page);
        }
        toggleFacts = await check('dark-toggle', toggled);
        toggleSnap = await themeSnapshot(toggled.page);
        await toggled.page.screenshot({ path: shot('dark-toggle'), fullPage: true });
      } finally {
        await toggled.close();
      }

      // dark via prefers-color-scheme
      const system = await openPage(browser, pagePath, { colorScheme: 'dark', viewport });
      let systemSnap;
      let systemFacts;
      try {
        systemFacts = await check('dark-system', system);
        systemSnap = await themeSnapshot(system.page);
        await system.page.screenshot({ path: shot('dark-system'), fullPage: true });
      } finally {
        await system.close();
      }

      let restyleNote = 'n/a';
      if (lightSnap && toggleSnap) {
        const problems = restyled(lightSnap, toggleSnap);
        for (const p of problems) fail('dark-toggle', p);
        restyleNote = problems.length ? `FAIL (${problems.length})` : 'yes';
      }
      if (toggleSnap && systemSnap && !sameTheme(toggleSnap, systemSnap)) {
        fail('dark-system', 'computed colors differ from dark-toggle');
      }

      const islandsOf = (facts) => `${facts?.islands.filter((i) => i.state === 'rendered').length ?? 0}/${facts?.islands.length ?? 0}`;
      for (const [theme, facts] of [['light', lightFacts], ['dark-toggle', toggleFacts], ['dark-system', systemFacts]]) {
        rows.push({
          page: name,
          width,
          theme,
          scroll: facts ? `${facts.scrollWidth}/${facts.viewport}` : '-',
          islands: islandsOf(facts),
          figures: facts ? String(facts.figures) : '-',
          restyle: theme === 'dark-toggle' ? restyleNote : '',
          shot: relative(process.cwd(), shot(theme)),
        });
      }
    }
  });

  const cols = ['page', 'width', 'theme', 'scroll', 'islands', 'figures', 'restyle', 'shot'];
  const cells = rows.map((r) => cols.map((c) => String(r[c])));
  const widths = cols.map((c, i) => Math.max(c.length, ...cells.map((row) => row[i].length)));
  const line = (row) => row.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd();
  console.log(line(cols));
  for (const row of cells) console.log(line(row));
  for (const f of failures) console.log(`fail: ${f}`);
  if (failures.length) return 1;
  console.log(`ok ${rows.length} shots`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  process.exitCode = await main(process.argv.slice(2));
}
