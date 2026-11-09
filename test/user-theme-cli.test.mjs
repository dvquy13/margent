// The theme commands (M9 spec U5, U6; acceptance A6, A7): `theme init` writes the starter theme, and `doctor` reports the
// theme, the design guide and the fonts Chrome drew. Each test spawns dist/cli.js with its own MARGENT_HOME. Run after
// `npm run build`. The doctor tests need an installed Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { full, fullMac } from './helpers/tier.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'dist', 'cli.js');
const SHELL_CSS = readFileSync(join(REPO, 'shell', 'shell.css'), 'utf8');
const GUIDE = join(REPO, 'test', 'fixtures', 'cli', 'linked', 'guide.md');

// Imported from .build/ (run `npm run build` first).
const { starterTheme } = await import('../.build/cli/theme.js');

const workdir = mkdtempSync(join(tmpdir(), 'margent-theme-cli-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

let counter = 0;
// A fresh scratch folder per call, so homes and caches never leak between tests.
function scratch(label) {
  const dir = join(workdir, `${label}-${counter++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Runs the CLI from the repo root. BROWSER=true stands in for the default browser; the cache is the test's own.
function cli(args, { home, env = {} } = {}) {
  const base = { ...process.env, BROWSER: 'true', XDG_CACHE_HOME: scratch('cache') };
  delete base.MARGENT_CHROME;
  base.MARGENT_HOME = home ?? scratch('home');
  return spawnSync(process.execPath, [CLI, ...args], { cwd: REPO, encoding: 'utf8', env: { ...base, ...env } });
}

// A home folder holding the given files (name -> text).
function homeWith(files) {
  const home = scratch('home');
  for (const [name, text] of Object.entries(files)) writeFileSync(join(home, name), text);
  return home;
}

// The token blocks of a stylesheet: selector -> (name -> value), for the first block of each selector that holds custom
// properties. The selector is the text before the block's {. Comments are stripped first, so a commented-out declaration
// is not a declaration.
function blockDeclarations(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = new Map();
  for (const m of bare.matchAll(/([^{}]*?)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    const decls = new Map();
    for (const piece of m[2].split(';')) {
      const d = /^\s*(--[\w-]+)\s*:\s*([\s\S]*?)\s*$/.exec(piece);
      if (d) decls.set(d[1], d[2]);
    }
    if (decls.size > 0 && !blocks.has(selector)) blocks.set(selector, decls);
  }
  return blocks;
}

// The three house token blocks: light, dark (system setting) and dark (header toggle).
const TOKEN_BLOCKS = [':root', ':root:not([data-theme="light"])', ':root[data-theme="dark"]'];

// The starter with its markers removed around every declaration line, as a user does to change a token.
function uncomment(starter) {
  return starter.replace(/^(\s*)\/\* (--[^\n]*?) \*\/$/gm, '$1$2');
}

// ---- theme init (U5)

test('A6 U5.1 theme init creates a missing home and theme.css, prints the path, exits 0', () => {
  const home = join(scratch('fresh'), 'not-yet');
  const r = cli(['theme', 'init'], { home });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `${join(home, 'theme.css')}\n`);
  assert.equal(readFileSync(join(home, 'theme.css'), 'utf8'), starterTheme(SHELL_CSS));
});

test('A6 U5.4 a second theme init exits 1 and leaves the file as it was', () => {
  const home = scratch('twice');
  assert.equal(cli(['theme', 'init'], { home }).status, 0);
  const file = join(home, 'theme.css');
  writeFileSync(file, ':root { --font-prose: serif; }\n');
  const r = cli(['theme', 'init'], { home });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /already exists; edit it, or delete it to start again/);
  assert.equal(readFileSync(file, 'utf8'), ':root { --font-prose: serif; }\n');
});

test('A6 U5.3 the starter as written changes nothing: no declaration is outside a comment', () => {
  const bare = starterTheme(SHELL_CSS).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(bare, /--[\w-]+\s*:/);
});

test('A6 U5.3 with the markers removed, each house block holds the house declarations', () => {
  const house = blockDeclarations(SHELL_CSS);
  const starter = blockDeclarations(uncomment(starterTheme(SHELL_CSS)));
  for (const selector of TOKEN_BLOCKS) {
    assert.ok(house.get(selector), `shell.css has the block ${selector}`);
    assert.ok(starter.get(selector), `the starter has the block ${selector}`);
    assert.deepEqual([...starter.get(selector)], [...house.get(selector)], `block ${selector}`);
  }
});

test('A6 U5.3 the starter is a valid theme: export with it as theme.css exits 0 and carries it in the page', () => {
  const home = homeWith({ 'theme.css': starterTheme(SHELL_CSS) });
  const out = scratch('export');
  const r = cli(['export', GUIDE, '--out', out], { home });
  assert.equal(r.status, 0, r.stderr);
  const html = readFileSync(join(out, 'guide.html'), 'utf8');
  assert.ok(html.includes(starterTheme(SHELL_CSS)), 'the theme is in the page byte for byte');
});

test('the usage lists theme init; theme with anything but init is a usage error (exit 2)', () => {
  assert.match(cli(['--help']).stderr, /margent theme init\n/);
  assert.equal(cli(['theme']).status, 2);
  assert.equal(cli(['theme', 'reset']).status, 2);
  assert.equal(cli(['theme', 'init', 'extra']).status, 2);
});

// ---- doctor (U6)

test('A7 U6.1 U6.2 doctor with no theme or design guide says so', full, () => {
  const r = cli(['doctor'], { home: scratch('empty') });
  assert.match(r.stdout, /^ok theme: none \(/m);
  assert.match(r.stdout, /^ok design: none \(/m);
  assert.doesNotMatch(r.stdout, /^(fail|warn) (theme|design)/m);
});

test('A7 U6.1 U6.2 doctor names the theme and design files it reads', full, () => {
  const home = homeWith({ 'theme.css': ':root { --bg: #fff; }\n', 'design.md': '# Design\n' });
  const r = cli(['doctor'], { home });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`^ok theme: ${escape(join(home, 'theme.css'))}$`, 'm'));
  assert.match(r.stdout, new RegExp(`^ok design: ${escape(join(home, 'design.md'))}$`, 'm'));
});

test('A7 U6.1 doctor with a theme holding "</style" fails the theme line, exits 1, and still runs the islands check', full, () => {
  const home = homeWith({ 'theme.css': ':root { --bg: #fff; }\n</style>\n' });
  const r = cli(['doctor'], { home });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /^fail theme: .*theme\.css:2: theme\.css must not contain "<\/style"$/m);
  assert.match(r.stdout, /^ok islands: /m);
});

test('A7 U6.3 doctor warns that a font family is not installed, and exits 0', () => {
  const home = homeWith({ 'theme.css': ":root { --font-prose: 'Margent No Such Font', serif; }\n" });
  const r = cli(['doctor'], { home });
  assert.match(
    r.stdout,
    /^warn font-prose: 'Margent No Such Font' is not available to this machine's Chrome, so text falls back to /m
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('A7 U6.3 doctor reports an installed font by its name (macOS)', { ...full, ...fullMac }, () => {
  const home = homeWith({ 'theme.css': ":root { --font-prose: 'Helvetica', serif; }\n" });
  const r = cli(['doctor'], { home });
  assert.match(r.stdout, /^ok font-prose: Helvetica$/m);
});

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
