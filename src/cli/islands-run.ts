// The headless island run for `margent check` (spec R4, R5). Each island page is loaded once and measured at two
// widths: 390px (phone) and 1280px (desktop). The page answers for its islands (window.margentIslands.report, host.js):
// each island's state, error, mismatches and overflow. Every problem is a `{file}:{line}: ...` line.
import { pathToFileURL } from 'node:url';
import { launchChrome, type ChromeSession } from './chrome.js';

export interface IslandPage {
  file: string; // display path of the .md, for messages
  html: string; // absolute path of the page written for this doc
  islands: { name: string; line: number }[]; // in document order, as renderDoc reports them
}

const WIDTHS = [390, 1280] as const;
const HEIGHT = 900;
const STATE_WAIT_S = 10; // host.js STATE_WAIT_MS

// The page's report (host.js): it waits up to 10s for every island's state, then measures each rendered island (up to
// 5s each, in parallel). One call covers that with a margin. A rejection (an island that did not answer its overflow
// measure) comes back as a value, so its message is not wrapped by the evaluate call.
const REPORT_CALL_MS = 20000;
const REPORT = `(() => {
  if (!window.margentIslands || typeof window.margentIslands.report !== 'function') return { missing: true };
  return window.margentIslands.report().then(
    (reports) => ({ reports }),
    (err) => ({ failure: err instanceof Error ? err.message : String(err) }));
})()`;

// The table row lines of every island, in document order (the island-data JSON the page carries, R2.1).
const ROW_LINES = `[...document.querySelectorAll('agent-island > script.island-data')]
  .map((el) => JSON.parse(el.textContent).rowLines)`;

interface IslandReport {
  name: string | null;
  state: string | null; // null: the island never reported
  error: string | null;
  mismatches: { row: number; column: string; text: string }[];
  overflow: { description: string; side: 'left' | 'right'; px: number } | null;
}

interface Answered {
  reports: IslandReport[];
}
type Pass = Answered | { failure: string };

// One width's report, from the page. A page without window.margentIslands is a failure of the check itself.
async function reportAt(chrome: ChromeSession, file: string): Promise<Pass> {
  const pass = (await chrome.evaluate(REPORT, true, REPORT_CALL_MS)) as Pass | { missing: true };
  if ('missing' in pass) {
    throw new Error(`${file}: the page has no window.margentIslands, so its islands cannot be checked`);
  }
  return pass;
}

// Loads the page once, then measures it at each width. The 390px pass comes first, before the viewport changes.
// rowLines[i][r] is the source line of table row r of island i.
async function measurePage(
  chrome: ChromeSession,
  url: string,
  file: string
): Promise<{ passes: Map<number, Pass>; rowLines: number[][] }> {
  const passes = new Map<number, Pass>();
  let rowLines: number[][] = [];
  for (const width of WIDTHS) {
    await chrome.setViewport(width, HEIGHT);
    if (width === WIDTHS[0]) {
      await chrome.navigate(url);
      rowLines = (await chrome.evaluate(ROW_LINES)) as number[][];
    }
    passes.set(width, await reportAt(chrome, file));
  }
  return { passes, rowLines };
}

// The line of a message about an island: the island it names ("island {name}: "), else line 1.
function lineOfMessage(page: IslandPage, message: string): number {
  const named = /^island ([^:]+): /.exec(message);
  const island = named ? page.islands.find((i) => i.name === named[1]) : undefined;
  return island ? island.line : 1;
}

// Returns one problem line per island that did not report or failed, per cell that does not match its column pattern
// (once, from the first pass that answered), per overflow at each width, and per uncaught page exception. Throws when
// Chrome is missing or a page cannot be loaded or read: those are failures of the check itself.
export async function runIslandPages(pages: IslandPage[]): Promise<string[]> {
  const problems: string[] = [];
  if (pages.length === 0) return problems;
  const chrome = await launchChrome();
  try {
    for (const page of pages) {
      const { passes, rowLines } = await measurePage(chrome, pathToFileURL(page.html).href, page.file);
      for (const message of chrome.pageExceptions()) problems.push(`${page.file}:1: page error: ${message}`);

      const failures = new Set<string>();
      for (const pass of passes.values()) {
        if ('failure' in pass) failures.add(pass.failure);
      }
      for (const message of failures) problems.push(`${page.file}:${lineOfMessage(page, message)}: ${message}`);

      const first = WIDTHS.map((w) => passes.get(w)).find((p): p is Answered => p !== undefined && 'reports' in p);
      if (first === undefined) continue;
      const base = first.reports;
      if (base.length !== page.islands.length) {
        throw new Error(
          `${page.file}: the page has ${base.length} <agent-island> elements, but the doc has ${page.islands.length} islands`
        );
      }
      page.islands.forEach((island, i) => {
        const report = base[i];
        if (report.name !== island.name) {
          throw new Error(`${page.file}: island ${i + 1} is "${report.name}" in the page but "${island.name}" in the doc`);
        }
        if (report.state === null) {
          problems.push(`${page.file}:${island.line}: island ${island.name}: did not report within ${STATE_WAIT_S}s`);
          return;
        }
        if (report.state === 'error') {
          const text = report.error ?? `island ${island.name}: failed without an error message`;
          problems.push(`${page.file}:${island.line}: ${text}`);
          return;
        }
        for (const m of report.mismatches) {
          const rowLine = rowLines[i]?.[m.row];
          if (rowLine === undefined) {
            throw new Error(`${page.file}: island ${island.name}: no source line for table row ${m.row + 1}`);
          }
          problems.push(`${page.file}:${rowLine}: island ${island.name}: cell "${m.text}" does not match ${m.column} pattern`);
        }
        for (const width of WIDTHS) {
          const pass = passes.get(width);
          if (pass === undefined || !('reports' in pass)) continue;
          const overflow = pass.reports[i].overflow;
          if (!overflow) continue;
          problems.push(
            `${page.file}:${island.line}: island ${island.name}: content overflows its box at ${width}px ` +
              `(${overflow.description}, ${overflow.px}px past the ${overflow.side} edge)`
          );
        }
      });
    }
  } finally {
    await chrome.close();
  }
  return problems;
}
