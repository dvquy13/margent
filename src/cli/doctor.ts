// `margent doctor` (spec R7): one line per environment check, exit 1 when any check fails. The islands check renders
// a built-in sample doc in a temp dir (removed afterwards) and runs its island in headless Chrome.
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import shellCss from '../../shell/shell.css?raw';
import { resolveAuthor } from '../serve/author.js';
import { VERSION } from '../version.js';
import { margentHome, readUserTheme, type UserTheme } from '../user/home.js';
import { findChrome, launchChrome } from './chrome.js';
import { cacheRoot, renderOne } from './collect.js';
import { runPages } from './pages-run.js';
import { openerCommand, openerResolves } from './opener.js';
import { houseLightTokens } from './theme.js';

const MIN_NODE_MAJOR = 22;
const CHROME_FIX = 'Install Google Chrome, or set MARGENT_CHROME to the browser binary.';
const CACHE_FIX = 'Set XDG_CACHE_HOME to a writable folder.';
const OPENER_FIX = 'Set BROWSER to a browser command.';
const NODE_FIX = `Install Node ${MIN_NODE_MAJOR} or later.`;

type Status = 'ok' | 'warn' | 'fail';
interface Check {
  status: Status;
  line: string;
}

// A fail line is `fail {name}: {detail}. {fix}`; a detail that already carries the fix is not repeated.
function failure(name: string, detail: string, fix: string): Check {
  const text = detail.includes(fix) ? detail : `${detail}. ${fix}`;
  return { status: 'fail', line: `fail ${name}: ${text}` };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function checkNode(): Check {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < MIN_NODE_MAJOR) {
    return failure('node', `${process.version} is older than ${MIN_NODE_MAJOR}`, NODE_FIX);
  }
  return { status: 'ok', line: `ok node: ${process.version}` };
}

// Chrome is found. The islands check starts it, so a Chrome that is found but won't start fails there.
function checkChrome(): Check {
  try {
    return { status: 'ok', line: `ok chrome: ${findChrome()}` };
  } catch (err) {
    return failure('chrome', errorMessage(err), CHROME_FIX);
  }
}

function checkOpener(): Check {
  const command = openerCommand();
  if (openerResolves(command)) return { status: 'ok', line: `ok opener: ${command}` };
  return failure('opener', `${command} is not on PATH`, OPENER_FIX);
}

// The cache folder can be created and a temp file written and deleted in it.
function checkCache(): Check {
  const dir = cacheRoot();
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, `.doctor-${process.pid}`);
    writeFileSync(probe, 'ok');
    unlinkSync(probe);
    return { status: 'ok', line: `ok cache: ${dir}` };
  } catch (err) {
    return failure('cache', `${dir}: ${errorMessage(err)}`, CACHE_FIX);
  }
}

// A warning only: notes in `serve` need an author, nothing else does. It resolves the author as serve does in this folder.
function checkAuthor(): Check {
  const { author, source, reason } = resolveAuthor(undefined, process.cwd());
  if (author === null) return { status: 'warn', line: `warn author: ${reason}; serve refuses notes until one is set (or --author).` };
  return { status: 'ok', line: source === 'os' ? `ok author: ${author} (the OS user name; ${reason})` : `ok author: ${author}` };
}

const SAMPLE_DOC = [
  '# Sample',
  '',
  '<!-- island sample -->',
  '| Stage | Hours |',
  '|---|---|',
  '| Draft | 12 |',
  '| Review | 7 |',
  '',
  'The margent doctor sample. It is rendered in a temp folder and removed afterwards.',
  '',
].join('\n');

// Contract v1 (skills/margent/references/island-contract.md). No template literals: the module text is plain JS.
const SAMPLE_ISLAND = [
  'export const contract = 1;',
  '',
  'export const schema = {',
  "  type: 'object',",
  "  required: ['rows'],",
  '  properties: {',
  '    rows: {',
  "      type: 'array',",
  '      minItems: 1,',
  "      items: { type: 'object', required: ['stage', 'hours'], properties: { stage: { type: 'string' }, hours: { type: 'string' } } },",
  '    },',
  '  },',
  '};',
  '',
  'export default function render(root, data, kit) {',
  '  const total = data.rows.reduce(function (sum, r) { return sum + Number(r.hours); }, 0);',
  "  const items = data.rows.map(function (r) { return '<li>' + kit.esc(r.stage) + ': ' + kit.esc(r.hours) + '</li>'; });",
  "  root.innerHTML = '<p>Total hours: ' + kit.esc(kit.fmt.num(total)) + '</p><ul>' + items.join('') + '</ul>';",
  '}',
  '',
].join('\n');

// Writes the sample doc and its island into dir and renders the doc with the theme (if any) to dir/sample.html.
function writeSample(dir: string, theme: UserTheme | null): { html: string; rendered: ReturnType<typeof renderOne> } {
  mkdirSync(join(dir, 'islands'));
  writeFileSync(join(dir, 'islands', 'sample.island.js'), SAMPLE_ISLAND);
  const file = join(dir, 'sample.md');
  writeFileSync(file, SAMPLE_DOC);
  const html = join(dir, 'sample.html');
  const rendered = renderOne(file, dir, html, theme);
  writeFileSync(html, rendered.html);
  return { html, rendered };
}

// Renders the sample doc and runs its island in Chrome. Any problem, or a failure to run, is a fail line.
async function checkIslands(theme: UserTheme | null): Promise<Check> {
  const dir = mkdtempSync(join(tmpdir(), 'margent-doctor-'));
  try {
    const { html, rendered } = writeSample(dir, theme);
    const problems = await runPages([{ file: 'margent doctor sample', html, islands: rendered.islands, quotes: [] }]);
    if (problems.length > 0) return { status: 'fail', line: `fail islands: ${problems[0]}` };
    return { status: 'ok', line: 'ok islands: a sample island rendered in its sandboxed frame' };
  } catch (err) {
    return { status: 'fail', line: `fail islands: ${errorMessage(err)}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// The theme in the margent home (spec U6.1). A theme that can't be read is a fail line, and doctor goes on without one.
function checkTheme(): { check: Check; theme: UserTheme | null } {
  try {
    const theme = readUserTheme();
    if (theme) return { check: { status: 'ok', line: `ok theme: ${theme.file}` }, theme };
    const file = join(margentHome(), 'theme.css');
    return { check: { status: 'ok', line: `ok theme: none (${file} not found)` }, theme: null };
  } catch (err) {
    return { check: { status: 'fail', line: `fail theme: ${errorMessage(err)}` }, theme: null };
  }
}

// The design guide in the margent home (spec U6.2). Only its presence is checked here.
function checkDesign(): Check {
  const file = join(margentHome(), 'design.md');
  if (existsSync(file) && statSync(file).isFile()) return { status: 'ok', line: `ok design: ${file}` };
  return { status: 'ok', line: `ok design: none (${file} not found)` };
}

// The font tokens doctor checks (spec U6.3), and the families that every machine has, which satisfy any token.
const FONT_TOKENS = ['font-ui', 'font-prose', 'mono'];
const GENERIC_FAMILIES = new Set([
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  '-apple-system',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
]);
const FONT_PROBE_TEXT = 'Tiếng Việt 中文 Sample 0123';

// A computed token value, with quotes and spacing removed, so the theme's value and the house value compare by name.
function normalizeValue(value: string): string {
  return value.replace(/["']/g, '').replace(/\s+/g, ' ').trim();
}

// For each font token the theme changes, the font Chrome drew text in that token with (spec U6.3). Each probe is a span
// in the sample page, styled with the token; Chrome reports the platform fonts of the span's glyphs.
async function checkFonts(theme: UserTheme): Promise<Check[]> {
  const dir = mkdtempSync(join(tmpdir(), 'margent-doctor-'));
  let chrome: Awaited<ReturnType<typeof launchChrome>> | null = null;
  try {
    const { html } = writeSample(dir, theme);
    chrome = await launchChrome();
    await chrome.navigate(pathToFileURL(html).href);
    const computed = (await chrome.evaluate(
      `(() => { const s = getComputedStyle(document.documentElement); const out = {}; ` +
        `for (const t of ${JSON.stringify(FONT_TOKENS)}) out[t] = s.getPropertyValue('--' + t).trim(); return out; })()`
    )) as Record<string, string>;
    const house = houseLightTokens(shellCss);
    const changed = FONT_TOKENS.filter((t) => normalizeValue(computed[t]) !== normalizeValue(house.get(`--${t}`) ?? ''));
    if (changed.length === 0) return [];

    await chrome.evaluate(
      `(async () => { for (const t of ${JSON.stringify(changed)}) { const el = document.createElement('span'); ` +
        `el.id = 'margent-probe-' + t; el.setAttribute('style', 'font-family: var(--' + t + ')'); ` +
        `el.textContent = ${JSON.stringify(FONT_PROBE_TEXT)}; document.body.appendChild(el); el.getBoundingClientRect(); } ` +
        `await document.fonts.ready; return true; })()`,
      true
    );

    const checks: Check[] = [];
    for (const token of changed) {
      const fonts = await chrome.platformFonts(`#margent-probe-${token}`);
      if (fonts.length === 0) throw new Error(`Chrome drew no text for ${token}`);
      const used = fonts.reduce((a, b) => (b.glyphCount > a.glyphCount ? b : a));
      const first = computed[token].split(',')[0].trim().replace(/^["']|["']$/g, '');
      const satisfied =
        GENERIC_FAMILIES.has(first.toLowerCase()) || first.toLowerCase() === used.familyName.toLowerCase();
      checks.push(
        satisfied
          ? { status: 'ok', line: `ok ${token}: ${used.familyName}` }
          : {
              status: 'warn',
              line: `warn ${token}: '${first}' is not available to this machine's Chrome, so text falls back to ${used.familyName}. Install the font, or @import it from Google Fonts in theme.css`,
            }
      );
    }
    return checks;
  } catch (err) {
    return [{ status: 'fail', line: `fail fonts: ${errorMessage(err)}` }];
  } finally {
    if (chrome) await chrome.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

// margent doctor: prints every check in order and returns 1 when any of them fails, else 0.
export async function commandDoctor(): Promise<number> {
  const checks: Check[] = [checkNode(), { status: 'ok', line: `ok margent: ${VERSION}` }];
  const chrome = checkChrome();
  const theme = checkTheme();
  checks.push(chrome, checkOpener(), checkCache(), checkAuthor(), theme.check, checkDesign());
  checks.push(
    chrome.status === 'ok'
      ? await checkIslands(theme.theme)
      : { status: 'fail', line: 'fail islands: skipped, Chrome is not available' }
  );
  if (theme.theme !== null && chrome.status === 'ok') checks.push(...(await checkFonts(theme.theme)));
  for (const check of checks) process.stdout.write(`${check.line}\n`);
  return checks.some((check) => check.status === 'fail') ? 1 : 0;
}
