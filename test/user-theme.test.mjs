// The user theme (M9 spec U1, U2; acceptance A1 to A3). The CLI tests spawn dist/cli.js with their own MARGENT_HOME, so
// a developer's real ~/.margent never reaches them. Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'dist', 'cli.js');
const DOC = join(REPO, 'test', 'fixtures', 'cli', 'linked', 'guide.md');

// Imported from .build/ (run `npm run build` first). RenderError is matched by name, as in render.test.mjs.
const { renderDoc } = await import('../.build/render/page.js');
const { margentHome, readUserTheme } = await import('../.build/user/home.js');

const made = [];
// A fresh temp folder, removed when the test process exits.
function tmp(label) {
  const dir = mkdtempSync(join(tmpdir(), `margent-theme-${label}-`));
  made.push(dir);
  return dir;
}
process.on('exit', () => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

// Runs the CLI from the repo root with the given home. Each run has its own cache folder.
function cli(args, home) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, BROWSER: 'true', XDG_CACHE_HOME: tmp('cache'), MARGENT_HOME: home },
  });
}

// A page rendered from DOC with the given theme, as renderDoc is called by the CLI.
function pageWith(theme) {
  const outFile = DOC.replace(/\.md$/, '.html');
  return renderDoc({ file: DOC, source: readFileSync(DOC, 'utf8'), root: dirname(DOC), outFile, theme }).html;
}

const THEME_CSS = 'body { font-family: "Inter", sans-serif; }\n:root { --accent: #1a5fb4; }';

// ---- U1 home folder

test('U1.1 margentHome is MARGENT_HOME when set and not empty, else ~/.margent', () => {
  assert.equal(margentHome({ MARGENT_HOME: '/custom/home' }), '/custom/home');
  assert.equal(margentHome({ MARGENT_HOME: '' }), join(process.env.HOME, '.margent'));
  assert.equal(margentHome({}), join(process.env.HOME, '.margent'));
});

test('U1.2 a missing home folder or a missing theme.css means no theme, and the folder is never created', () => {
  const base = tmp('home');
  const missing = join(base, 'nope');
  assert.equal(readUserTheme(missing), null);
  assert.equal(existsSync(missing), false);
  assert.equal(readUserTheme(base), null);
});

test('U1.2 a home path that is a file means no theme (ENOTDIR)', () => {
  const file = join(tmp('notdir'), 'home');
  writeFileSync(file, 'not a folder');
  assert.equal(readUserTheme(file), null);
});

test('U1.2 a theme.css is read byte for byte', () => {
  const home = tmp('read');
  writeFileSync(join(home, 'theme.css'), THEME_CSS);
  assert.deepEqual(readUserTheme(home), { file: join(home, 'theme.css'), css: THEME_CSS });
});

test('U1.3 an unreadable theme.css fails with its path and the reason', { skip: process.getuid?.() === 0 && 'root reads any file' }, () => {
  const home = tmp('unreadable');
  const file = join(home, 'theme.css');
  writeFileSync(file, THEME_CSS);
  chmodSync(file, 0o000);
  try {
    assert.throws(() => readUserTheme(home), (err) => {
      assert.match(err.message, new RegExp(`^${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: cannot read the theme: `));
      return true;
    });
  } finally {
    chmodSync(file, 0o644);
  }
});

// ---- U2 theme in pages

test('A1 U2.1 a page with a theme carries it after the house style, before </head>', () => {
  const html = pageWith({ file: join(REPO, 'theme.css'), css: THEME_CSS });
  const block = `<style id="margent-user-theme">\n${THEME_CSS}\n</style>`;
  assert.equal(html.split(block).length - 1, 1);
  const house = html.indexOf('</style>');
  const user = html.indexOf(block);
  assert.ok(house !== -1 && house < user, 'the theme follows the house style');
  assert.ok(user < html.indexOf('</head>'), 'the theme is inside head');
});

test('A1 U2.2 a page without a theme has no margent-user-theme, and null is the same as absent', () => {
  const absent = pageWith(undefined);
  assert.equal(absent.includes('margent-user-theme'), false);
  assert.equal(pageWith(null), absent);
});

test('U2.3 renderDoc refuses a theme holding "</style", whatever the case, with its line', () => {
  const theme = { file: join(REPO, 'theme.css'), css: 'a { b: c; }\n\nbody { }\n</STYLE>' };
  assert.throws(() => pageWith(theme), (err) => {
    assert.equal(err.name, 'RenderError');
    assert.equal(err.message, `${theme.file}:4: theme.css must not contain "</style"`);
    return true;
  });
});

test('U2.3 readUserTheme names the line of the first "</style" in theme.css', () => {
  const home = tmp('closer');
  const file = join(home, 'theme.css');
  writeFileSync(file, 'a { }\nb { }\nc { } </style> trailing\n</style>\n');
  assert.throws(() => readUserTheme(home), (err) => {
    assert.equal(err.name, 'RenderError');
    assert.ok(err.message.startsWith(`${file}:3: theme.css must not contain "</style"`), err.message);
    return true;
  });
});

// ---- A2, A3 through the CLI

test('A2 U2.3 export fails with theme.css:3 when the theme holds "</style"', () => {
  const home = tmp('bad-home');
  writeFileSync(join(home, 'theme.css'), 'a { }\nb { }\n</style>\n');
  const out = tmp('bad-out');
  const r = cli(['export', DOC, '--out', out], home);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /theme\.css:3:/);
  assert.equal(existsSync(join(out, 'guide.html')), false, 'nothing is written');
});

test('A2 U1.3 export fails with the path of an unreadable theme', { skip: process.getuid?.() === 0 && 'root reads any file' }, () => {
  const home = tmp('cli-unreadable');
  const file = join(home, 'theme.css');
  writeFileSync(file, THEME_CSS);
  chmodSync(file, 0o000);
  try {
    const r = cli(['export', DOC, '--out', tmp('cli-unreadable-out')], home);
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.stderr.includes(file), r.stderr);
  } finally {
    chmodSync(file, 0o644);
  }
});

test('A3 U2.1 export with MARGENT_HOME set carries the theme in every page', () => {
  const home = tmp('export-home');
  writeFileSync(join(home, 'theme.css'), THEME_CSS);
  const out = tmp('export-out');
  const r = cli(['export', DOC, '--out', out], home);
  assert.equal(r.status, 0, r.stderr);
  const html = readFileSync(join(out, 'guide.html'), 'utf8');
  assert.ok(html.includes(`<style id="margent-user-theme">\n${THEME_CSS}\n</style>`));
});

test('A3 U2.1 export --clean re-renders with the theme too', () => {
  const home = tmp('clean-home');
  writeFileSync(join(home, 'theme.css'), THEME_CSS);
  const out = tmp('clean-out');
  const r = cli(['export', DOC, '--out', out, '--clean'], home);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(readFileSync(join(out, 'guide.html'), 'utf8').includes('id="margent-user-theme"'));
});

test('A3 U1.2 export with MARGENT_HOME pointing nowhere carries no theme', () => {
  const out = tmp('nowhere-out');
  const r = cli(['export', DOC, '--out', out], join(tmp('nowhere'), 'does-not-exist'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(out, 'guide.html'), 'utf8').includes('margent-user-theme'), false);
});

test('A3 U2.1 check with a theme exits 0', () => {
  const home = tmp('check-home');
  writeFileSync(join(home, 'theme.css'), THEME_CSS);
  const r = cli(['check', DOC], home);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
