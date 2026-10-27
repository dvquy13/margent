// The headless page run for `margent check` (spec R4, R5). Each page with islands or quoted comments is loaded once and
// measured at two widths: 390px (phone) and 1280px (desktop). The page answers for its islands (window.margentIslands.report,
// host.js): each island's state, error, mismatches and overflow. A page with quoted comments answers for each quote
// (window.margentComments.quoteReport, decisions 0039 and 0041): how many times its phrase is in the block it is anchored
// to, and whether the `#n` it names is in range. Every problem is a `{file}:{line}: ...` line.
import { pathToFileURL } from 'node:url';
import { launchChrome, type ChromeSession } from './chrome.js';

export interface CheckPage {
  file: string; // display path of the .md, for messages
  html: string; // absolute path of the page written for this doc
  islands: { name: string; line: number }[]; // in document order, as renderDoc reports them
  quotes: { id: string; line: number; quote: string; occurrence?: number; anchorKind: string }[]; // in document order (0039, 0041)
}

const WIDTHS = [390, 1280] as const;
const HEIGHT = 900;
const STATE_WAIT_S = 10; // host.js STATE_WAIT_MS

// The page's report (host.js): it waits up to 10s for every island's state, then measures each rendered island (up to
// 5s each, in parallel). One call covers that with a margin. A rejection (an island that did not answer its overflow
// measure) comes back as a value, so its message is not wrapped by the evaluate call. The quote report waits on the
// islands the same way, so it shares the bound.
const REPORT_CALL_MS = 20000;
const REPORT = `(() => {
  if (!window.margentIslands || typeof window.margentIslands.report !== 'function') return { missing: true };
  return window.margentIslands.report().then(
    (reports) => ({ reports }),
    (err) => ({ failure: err instanceof Error ? err.message : String(err) }));
})()`;

// The quote report of every quoted thread, in document order: { id, count } with the number of matches of its phrase, or
// null (its island has not rendered). A page without window.margentComments is a failure of the check itself.
const QUOTES = `(() => {
  if (!window.margentComments || typeof window.margentComments.quoteReport !== 'function') return { missing: true };
  return window.margentComments.quoteReport().then(
    (report) => ({ report }),
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

interface QuoteCount {
  id: string;
  count: number | null;
}
type QuotePass = { report: QuoteCount[] } | { failure: string };

// One width's report, from the page. A page without window.margentIslands is a failure of the check itself.
async function reportAt(chrome: ChromeSession, file: string): Promise<Pass> {
  const pass = (await chrome.evaluate(REPORT, true, REPORT_CALL_MS)) as Pass | { missing: true };
  if ('missing' in pass) {
    throw new Error(`${file}: the page has no window.margentIslands, so its islands cannot be checked`);
  }
  return pass;
}

// The page's quote report. A page with quoted comments but no window.margentComments is a failure of the check itself.
async function quotesAt(chrome: ChromeSession, file: string): Promise<QuotePass> {
  const pass = (await chrome.evaluate(QUOTES, true, REPORT_CALL_MS)) as QuotePass | { missing: true };
  if ('missing' in pass) {
    throw new Error(`${file}: the page has quoted comments but no window.margentComments, so its quotes cannot be checked`);
  }
  return pass;
}

// Loads the page once, then measures it at each width. The 390px pass comes first, before the viewport changes. A page
// without islands has no margentIslands, so it is not asked for islands. rowLines[i][r] is the source line of table row
// r of island i.
async function measurePage(
  chrome: ChromeSession,
  url: string,
  page: CheckPage
): Promise<{ passes: Map<number, Pass>; rowLines: number[][]; quotes: QuotePass | null }> {
  const passes = new Map<number, Pass>();
  let rowLines: number[][] = [];
  let quotes: QuotePass | null = null;
  for (const width of WIDTHS) {
    await chrome.setViewport(width, HEIGHT);
    if (width === WIDTHS[0]) {
      await chrome.navigate(url);
      rowLines = (await chrome.evaluate(ROW_LINES)) as number[][];
    }
    if (page.islands.length > 0) passes.set(width, await reportAt(chrome, page.file));
    if (width === WIDTHS[0] && page.quotes.length > 0) quotes = await quotesAt(chrome, page.file);
  }
  return { passes, rowLines, quotes };
}

// The line of a message about an island: the island it names ("island {name}: "), else line 1.
function lineOfMessage(page: CheckPage, message: string): number {
  const named = /^island ([^:]+): /.exec(message);
  const island = named ? page.islands.find((i) => i.name === named[1]) : undefined;
  return island ? island.line : 1;
}

// The message for one quoted comment (after its `{file}:{line}: `), or null when its quote is fine. A count of null (its
// island has not rendered) is skipped, since the island's own failure already prints. No match at all means the phrase is
// not in the block; a `#n` past the last match is out of range; a quote with several matches and no `#n` is ambiguous
// (decisions 0039, 0041).
function quoteProblem(q: CheckPage['quotes'][number], count: number | null): string | null {
  if (count === null) return null;
  const at = `comment ${q.id}: `;
  const named = q.occurrence === undefined ? '' : ` #${q.occurrence}`;
  if (count === 0) return `${at}quoted phrase "${q.quote}"${named} is not in the ${q.anchorKind} it is anchored to`;
  if (q.occurrence !== undefined && q.occurrence > count) {
    return `${at}quoted phrase "${q.quote}"${named}: the ${q.anchorKind} it is anchored to has only ${count}`;
  }
  if (q.occurrence === undefined && count > 1) {
    return `${at}quoted phrase "${q.quote}" occurs ${count} times in the ${q.anchorKind} it is anchored to; add #n after the quote to say which`;
  }
  return null;
}

// Returns one problem line per island that did not report or failed, per cell that does not match its column pattern
// (once, from the first pass that answered), per overflow at each width, per uncaught page exception, and per quoted
// comment whose phrase is missing, out of range or ambiguous (decisions 0039, 0041). Throws when Chrome is missing or a
// page cannot be loaded or read: those are failures of the check itself.
export async function runPages(pages: CheckPage[]): Promise<string[]> {
  const problems: string[] = [];
  if (pages.length === 0) return problems;
  const chrome = await launchChrome();
  try {
    for (const page of pages) {
      const { passes, rowLines, quotes } = await measurePage(chrome, pathToFileURL(page.html).href, page);
      for (const message of chrome.pageExceptions()) problems.push(`${page.file}:1: page error: ${message}`);

      const failures = new Set<string>();
      for (const pass of passes.values()) {
        if ('failure' in pass) failures.add(pass.failure);
      }
      if (quotes !== null && 'failure' in quotes) failures.add(quotes.failure);
      for (const message of failures) problems.push(`${page.file}:${lineOfMessage(page, message)}: ${message}`);

      if (quotes !== null && 'report' in quotes) {
        const { report } = quotes;
        const ids = page.quotes.map((q) => q.id);
        if (report.length !== ids.length || report.some((r, i) => r.id !== ids[i])) {
          throw new Error(
            `${page.file}: the page answers for quotes ${report.map((r) => r.id).join(', ') || 'none'}, ` +
              `but the doc has quoted comments ${ids.join(', ')}`
          );
        }
        page.quotes.forEach((q, i) => {
          const problem = quoteProblem(q, report[i].count);
          if (problem !== null) problems.push(`${page.file}:${q.line}: ${problem}`);
        });
      }

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
