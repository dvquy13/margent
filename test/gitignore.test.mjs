// Gitignored files are not part of a folder's docs (markdownUnder, `check`): vendored copies a repo ignores must not
// fail a folder run. Each test makes its own temp repo with real `git init`. Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'dist', 'cli.js');
const { markdownUnder } = await import('../.build/cli/collect.js');

const workdir = mkdtempSync(join(tmpdir(), 'margent-gitignore-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

let counter = 0;
// A fresh folder for each test, so repos never share state.
function scratch(label) {
  const dir = join(workdir, `${label}-${counter++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function write(root, rel, text) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function git(root, args) {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
}

// A repo with a valid doc, a gitignored vendored folder holding an invalid doc, and a .gitignore naming the folder.
function vendoredRepo(label) {
  const root = scratch(label);
  git(root, ['init', '-q']);
  write(root, '.gitignore', 'docs/ext/\n');
  write(root, 'docs/a.md', '# A\n');
  write(root, 'docs/ext/bad.md', '---\nTitle: Bug: x\n---\n');
  return root;
}

// Runs `margent check {target}` with cwd at the repo, as the user would.
function check(root, target) {
  return spawnSync(process.execPath, [CLI, 'check', target], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, BROWSER: 'true', MARGENT_CHROME: '/nonexistent/chrome' },
  });
}

test('check of a folder skips a gitignored vendored folder: its invalid doc does not fail the run', () => {
  const root = vendoredRepo('skip');
  const r = check(root, 'docs');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, 'ok 1 docs, 0 islands\n');
  assert.deepEqual(markdownUnder(join(root, 'docs')).map((f) => relative(root, f)), ['docs/a.md']);
});

test('check of an ignored folder named explicitly walks it: the explicit request wins', () => {
  const root = vendoredRepo('explicit');
  const r = check(root, 'docs/ext');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr || r.stdout, /docs\/ext\/bad\.md:\d+: /);
  assert.deepEqual(markdownUnder(join(root, 'docs', 'ext')).map((f) => relative(root, f)), ['docs/ext/bad.md']);
});

test('a folder outside any git repository is walked in full', () => {
  const root = scratch('plain');
  write(root, 'docs/a.md', '# A\n');
  write(root, 'docs/ext/bad.md', '---\nTitle: Bug: x\n---\n');
  write(root, 'docs/ext/.gitignore', '*.md\n');
  assert.deepEqual(markdownUnder(join(root, 'docs')).map((f) => relative(root, f)), ['docs/a.md', 'docs/ext/bad.md']);
});

test('a tracked file that matches an ignore pattern is still walked', () => {
  const root = scratch('tracked');
  git(root, ['init', '-q']);
  write(root, '.gitignore', 'docs/ext/\n');
  write(root, 'docs/ext/kept.md', '# Kept\n');
  write(root, 'docs/ext/dropped.md', '# Dropped\n');
  git(root, ['add', '-f', 'docs/ext/kept.md']);
  assert.deepEqual(markdownUnder(join(root, 'docs')).map((f) => relative(root, f)), ['docs/ext/kept.md']);
});

test('an ignored single file is skipped, the others in the folder are not', () => {
  const root = scratch('file');
  git(root, ['init', '-q']);
  write(root, '.gitignore', '*.draft.md\n');
  write(root, 'docs/a.md', '# A\n');
  write(root, 'docs/notes.draft.md', '---\nTitle: Bug: x\n---\n');
  assert.deepEqual(markdownUnder(join(root, 'docs')).map((f) => relative(root, f)), ['docs/a.md']);
});
