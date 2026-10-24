// `margent doctor` (spec R7): one line per environment check, exit 1 when any check fails. The islands check renders
// a built-in sample doc in a temp dir (removed afterwards) and runs its island in headless Chrome.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VERSION } from '../version.js';
import { findChrome } from './chrome.js';
import { cacheRoot, renderOne } from './collect.js';
import { runIslandPages } from './islands-run.js';
import { openerCommand, openerResolves } from './opener.js';

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

// A warning only: notes in `serve` need an author, nothing else does.
function checkAuthor(): Check {
  const result = spawnSync('git', ['config', 'user.name'], { encoding: 'utf8', cwd: process.cwd() });
  const name = result.status === 0 ? result.stdout.trim() : '';
  if (name !== '') return { status: 'ok', line: `ok author: ${name}` };
  return {
    status: 'warn',
    line: 'warn author: git config user.name is not set; serve needs an author for notes (or --author).',
  };
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

// Renders the sample doc and runs its island in Chrome. Any problem, or a failure to run, is a fail line.
async function checkIslands(): Promise<Check> {
  const dir = mkdtempSync(join(tmpdir(), 'margent-doctor-'));
  try {
    mkdirSync(join(dir, 'islands'));
    writeFileSync(join(dir, 'islands', 'sample.island.js'), SAMPLE_ISLAND);
    const file = join(dir, 'sample.md');
    writeFileSync(file, SAMPLE_DOC);
    const html = join(dir, 'sample.html');
    const rendered = renderOne(file, dir, html);
    writeFileSync(html, rendered.html);
    const problems = await runIslandPages([{ file: 'margent doctor sample', html, islands: rendered.islands }]);
    if (problems.length > 0) return { status: 'fail', line: `fail islands: ${problems[0]}` };
    return { status: 'ok', line: 'ok islands: a sample island rendered in its sandboxed frame' };
  } catch (err) {
    return { status: 'fail', line: `fail islands: ${errorMessage(err)}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// margent doctor: prints every check in order and returns 1 when any of them fails, else 0.
export async function commandDoctor(): Promise<number> {
  const checks: Check[] = [checkNode(), { status: 'ok', line: `ok margent: ${VERSION}` }];
  const chrome = checkChrome();
  checks.push(chrome, checkOpener(), checkCache(), checkAuthor());
  checks.push(
    chrome.status === 'ok'
      ? await checkIslands()
      : { status: 'fail', line: 'fail islands: skipped, Chrome is not available' }
  );
  for (const check of checks) process.stdout.write(`${check.line}\n`);
  return checks.some((check) => check.status === 'fail') ? 1 : 0;
}
