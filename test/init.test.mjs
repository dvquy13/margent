// `margent init` and `margent teardown` (the agents block): each test makes a temp git repo and runs dist/cli.js in it.
// Run after `npm run build`. The block text is read from the .build/ bundle, as the tests import every module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'dist', 'cli.js');
const { BLOCK } = await import(join(REPO, '.build', 'cli', 'agents-block.js'));

const workdir = mkdtempSync(join(tmpdir(), 'margent-init-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

let counter = 0;
// A fresh temp git repo per test. `git init -q` only: no commits are needed to find the root.
function repo() {
  const dir = join(workdir, `repo-${counter++}`);
  mkdirSync(dir, { recursive: true });
  const init = spawnSync('git', ['init', '-q', dir], { encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  return dir;
}

// Writes a file under dir, creating its folders.
function put(dir, rel, text) {
  const file = join(dir, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

// Runs the CLI with cwd at dir, so printed paths are relative to it.
function margent(dir, args, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, BROWSER: 'true', ...env },
  });
}

const read = (file) => readFileSync(file, 'utf8');
const block = (eol = '\n') => BLOCK.split('\n').map((line) => line + eol).join('');

test('no AGENTS.md or CLAUDE.md anywhere: init creates AGENTS.md at the repo root with the block', () => {
  const dir = repo();
  put(dir, 'docs/x.md', '# X\n');
  const r = margent(dir, ['init', 'docs/x.md']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'added AGENTS.md\n');
  assert.equal(read(join(dir, 'AGENTS.md')), `${BLOCK}\n`);
});

test('monorepo: init on a package touches only the nearest AGENTS.md, not the root one', () => {
  const dir = repo();
  const rootFile = put(dir, 'AGENTS.md', '# Root\n');
  const pkgFile = put(dir, 'packages/a/AGENTS.md', '# A\n');
  put(dir, 'packages/a/docs/x.md', '# X\n');
  const rootBefore = read(rootFile);
  const r = margent(dir, ['init', 'packages/a/docs/x.md']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'added packages/a/AGENTS.md\n');
  assert.equal(read(rootFile), rootBefore);
  assert.equal(read(pkgFile), `# A\n\n${BLOCK}\n`);
});

test('AGENTS.md and CLAUDE.md in one folder: both get the block', () => {
  const dir = repo();
  const agents = put(dir, 'AGENTS.md', '# A\n');
  const claude = put(dir, 'CLAUDE.md', '# C\n');
  put(dir, 'docs/x.md', '# X\n');
  const r = margent(dir, ['init', 'docs/x.md']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'added AGENTS.md\nadded CLAUDE.md\n');
  assert.equal(read(agents), `# A\n\n${BLOCK}\n`);
  assert.equal(read(claude), `# C\n\n${BLOCK}\n`);
});

test('CLAUDE.md with an @AGENTS.md line in the same folder: only AGENTS.md gets the block', () => {
  const dir = repo();
  const agents = put(dir, 'AGENTS.md', '# A\n');
  const claude = put(dir, 'CLAUDE.md', '# C\n\n@AGENTS.md\n');
  put(dir, 'docs/x.md', '# X\n');
  const claudeBefore = read(claude);
  const r = margent(dir, ['init', 'docs/x.md']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'added AGENTS.md\n');
  assert.equal(read(agents), `# A\n\n${BLOCK}\n`);
  assert.equal(read(claude), claudeBefore);
});

test('a second init prints unchanged and leaves the bytes identical', () => {
  const dir = repo();
  put(dir, 'docs/x.md', '# X\n');
  assert.equal(margent(dir, ['init', 'docs/x.md']).status, 0);
  const file = join(dir, 'AGENTS.md');
  const before = readFileSync(file);
  const r = margent(dir, ['init', 'docs/x.md']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'unchanged AGENTS.md\n');
  assert.deepEqual(readFileSync(file), before);
});

test('an existing block with different inner text is updated; the bytes around it do not change', () => {
  const dir = repo();
  const before = '# Team\n\n';
  const after = '\nafter the block\n';
  const file = put(dir, 'AGENTS.md', `${before}<!-- margent:start -->\nold text\n<!-- margent:end -->${after}`);
  put(dir, 'docs/x.md', '# X\n');
  const r = margent(dir, ['init', 'docs/x.md']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'updated AGENTS.md\n');
  // The end marker's own newline is the first byte of `after`, so the block is followed by it unchanged.
  assert.equal(read(file), `${before}${BLOCK}${after}`);
});

test('a CRLF file keeps CRLF line endings for the block', () => {
  const dir = repo();
  const file = put(dir, 'AGENTS.md', '# Team\r\n\r\nrules\r\n');
  put(dir, 'docs/x.md', '# X\n');
  const r = margent(dir, ['init', 'docs/x.md']);
  assert.equal(r.status, 0, r.stderr);
  const text = read(file);
  assert.equal(text, `# Team\r\n\r\nrules\r\n\r\n${block('\r\n')}`);
  assert.equal(text.replace(/\r\n/g, '').includes('\n'), false, 'a lone LF in the result');
});

test('a malformed block exits 1 with file:line, and no file is written', () => {
  const dir = repo();
  const cases = [
    ['start without end', '# x\n<!-- margent:start -->\nfoo\n', /AGENTS\.md:2: margent:start with no margent:end/],
    ['end before start', '# x\n<!-- margent:end -->\n', /AGENTS\.md:2: margent:end with no margent:start/],
    ['two blocks', `${BLOCK}\n${BLOCK}\n`, new RegExp(`AGENTS\\.md:${BLOCK.split('\n').length + 1}: a second margent block \\(the first starts at line 1\\)`)],
  ];
  for (const [label, text, pattern] of cases) {
    const file = put(dir, 'AGENTS.md', text);
    put(dir, 'docs/x.md', '# X\n');
    const r = margent(dir, ['init', 'docs/x.md']);
    assert.equal(r.status, 1, `${label}: ${r.stdout}`);
    assert.match(r.stderr, pattern, label);
    assert.equal(read(file), text, `${label}: file changed`);
  }
});

test('a malformed CLAUDE.md stops init before AGENTS.md is written', () => {
  const dir = repo();
  const agents = put(dir, 'AGENTS.md', '# A\n');
  const claude = put(dir, 'CLAUDE.md', '<!-- margent:end -->\n');
  put(dir, 'docs/x.md', '# X\n');
  const r = margent(dir, ['init', 'docs/x.md']);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /CLAUDE\.md:1: margent:end with no margent:start/);
  assert.equal(read(agents), '# A\n');
  assert.equal(read(claude), '<!-- margent:end -->\n');
});

test('outside a git repository: init exits 1 and says so', () => {
  const dir = join(workdir, `plain-${counter++}`);
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'x.md'), '# X\n');
  const r = margent(dir, ['init', 'docs/x.md']);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /^margent: docs\/x\.md is not in a git repository: init writes the AGENTS\.md/);
  assert.equal(existsSync(join(dir, 'AGENTS.md')), false);
});

test('init in the home directory is refused, and nothing is written', () => {
  const dir = repo();
  put(dir, 'docs/x.md', '# X\n');
  const r = margent(dir, ['init', 'docs/x.md'], { HOME: dir });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /refusing to write .*AGENTS\.md: it is in your home directory/);
  assert.equal(existsSync(join(dir, 'AGENTS.md')), false);
});

test('teardown gives back the exact bytes of an existing AGENTS.md that init changed', () => {
  const dir = repo();
  const file = put(dir, 'AGENTS.md', '# Team\n\nrules\n');
  put(dir, 'docs/x.md', '# X\n');
  assert.equal(margent(dir, ['init', 'docs/x.md']).status, 0);
  const r = margent(dir, ['teardown', 'docs/x.md']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'removed AGENTS.md\n');
  assert.equal(read(file), '# Team\n\nrules\n');
});

test('teardown deletes an AGENTS.md that init created', () => {
  const dir = repo();
  put(dir, 'docs/x.md', '# X\n');
  assert.equal(margent(dir, ['init', 'docs/x.md']).status, 0);
  const r = margent(dir, ['teardown', 'docs/x.md']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'deleted AGENTS.md\n');
  assert.equal(existsSync(join(dir, 'AGENTS.md')), false);
});

test('a second teardown exits 0 and reports that there is no block', () => {
  const dir = repo();
  put(dir, 'AGENTS.md', '# Team\n');
  put(dir, 'docs/x.md', '# X\n');
  const r = margent(dir, ['teardown', 'docs/x.md']);
  assert.equal(r.status, 0, r.stderr);
  // The start folder is the doc's folder (docs/), and the root is the repo root.
  assert.equal(r.stdout, 'no margent block between docs and .\n');
});

test('monorepo: teardown removes only the nearest block, and keeps the root one other packages read', () => {
  const dir = repo();
  const rootFile = put(dir, 'AGENTS.md', `# Root\n\n${BLOCK}\n`);
  const pkgFile = put(dir, 'packages/a/AGENTS.md', `# A\n\n${BLOCK}\n`);
  put(dir, 'packages/a/docs/x.md', '# X\n');
  const r = margent(dir, ['teardown', 'packages/a/docs/x.md']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'removed packages/a/AGENTS.md\n');
  assert.equal(read(pkgFile), '# A\n');
  assert.equal(read(rootFile), `# Root\n\n${BLOCK}\n`);
});

test('teardown on a package with no block of its own removes the root block it reads', () => {
  const dir = repo();
  const rootFile = put(dir, 'AGENTS.md', `# Root\n\n${BLOCK}\n`);
  put(dir, 'packages/a/AGENTS.md', '# A\n');
  put(dir, 'packages/a/docs/x.md', '# X\n');
  const r = margent(dir, ['teardown', 'packages/a/docs/x.md']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'removed AGENTS.md\n');
  assert.equal(read(rootFile), '# Root\n');
});

test('check on a folder holding only an AGENTS.md with the block exits 0', () => {
  const dir = repo();
  put(dir, 'AGENTS.md', `${BLOCK}\n`);
  // Run from the repo root, as cli.test.mjs does, with the folder as an absolute path.
  const r = spawnSync(process.execPath, [CLI, 'check', dir], { cwd: REPO, encoding: 'utf8', env: { ...process.env, BROWSER: 'true' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^ok 1 docs, 0 islands$/m);
});
