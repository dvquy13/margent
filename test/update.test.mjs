// `margent update` (decision 0042): every channel's report, the commands it runs, and its failures. Each test runs
// `dist/cli.js update` in a temp world: fake npm, claude and npx on PATH (a tool left out is not installed), a HOME with
// the skills lock and skill folder, and a project folder as cwd. Each fake logs its argv, so a test checks the exact calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { full } from './helpers/tier.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'dist', 'cli.js');
const FIXTURES = join(REPO, 'test', 'fixtures', 'update');

const LATEST = '0.8.0';
const BEHIND = '0.7.0';
const ALL_TOOLS = ['npm', 'claude', 'npx'];
const NEW_SESSION = 'Start a new agent session to load the updated skills.';

const workdir = mkdtempSync(join(tmpdir(), 'margent-update-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

let counter = 0;
function scratch(label) {
  const dir = join(workdir, `${label}-${counter++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// A fake tool: logs its argv and cwd as one JSON line, then answers from the spec by its name and argv joined with spaces. The
// answer's stdout, stderr and status are the tool's output. It sets exitCode rather than calling process.exit, so the
// output of a pipe is flushed.
const FAKE_TOOL = [
  `#!${process.execPath}`,
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  'const argv = process.argv.slice(2);',
  "fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ tool: path.basename(process.argv[1]), argv, cwd: process.cwd() }) + '\\n');",
  "const spec = JSON.parse(fs.readFileSync(process.env.FAKE_SPEC, 'utf8'));",
  "const answer = spec[[path.basename(process.argv[1]), ...argv].join(' ')] ?? { status: 0 };",
  'if (answer.stdout) process.stdout.write(answer.stdout);',
  'if (answer.stderr) process.stderr.write(answer.stderr);',
  'process.exitCode = answer.status ?? 0;',
  '',
].join('\n');

// A fixture as text, with its installed version replaced.
function fixture(name, version = BEHIND) {
  return readFileSync(join(FIXTURES, name), 'utf8').replaceAll(BEHIND, version);
}

// The answers of every detection and update call, for the installs at `version`. The latest is LATEST.
function installs(version) {
  return {
    'npm view margent version': { stdout: `${LATEST}\n` },
    'npm ls -g margent --json --depth=0': { stdout: fixture('npm-ls-registry.json', version) },
    'claude plugin list --json': { stdout: fixture('plugin-list.json', version) },
    'claude plugin marketplace list --json': { stdout: fixture('marketplaces-github.json') },
  };
}

// One test's world. `skillVersion` is the version the home's margent skill names (null: its folder is missing). `home`
// and `project` hold the lock files; `project` is the cwd's lock and skill (null: no project skills).
function world({ answers = installs(BEHIND), tools = ALL_TOOLS, skillVersion = BEHIND, lock = true, project = null } = {}) {
  const dir = scratch('world');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  for (const tool of tools) {
    const path = join(bin, tool);
    writeFileSync(path, FAKE_TOOL);
    chmodSync(path, 0o755);
  }
  const home = join(dir, 'home');
  const cwd = join(dir, 'project');
  mkdirSync(join(home, '.agents'), { recursive: true });
  mkdirSync(cwd);
  if (lock) writeFileSync(join(home, '.agents', '.skill-lock.json'), fixture('skill-lock.json', BEHIND));
  if (skillVersion !== null) {
    mkdirSync(join(home, '.agents', 'skills', 'margent'), { recursive: true });
    writeFileSync(join(home, '.agents', 'skills', 'margent', 'SKILL.md'), fixture('SKILL.md', skillVersion));
  }
  if (project !== null) {
    writeFileSync(join(cwd, 'skills-lock.json'), fixture('skill-lock.json', BEHIND));
    mkdirSync(join(cwd, '.agents', 'skills', 'margent'), { recursive: true });
    writeFileSync(join(cwd, '.agents', 'skills', 'margent', 'SKILL.md'), fixture('SKILL.md', project.skillVersion));
  }
  const specPath = join(dir, 'spec.json');
  writeFileSync(specPath, JSON.stringify(answers));
  const log = join(dir, 'calls.jsonl');
  return {
    cwd,
    home,
    env: { PATH: bin, HOME: home, FAKE_LOG: log, FAKE_SPEC: specPath },
    calls() {
      try {
        return readFileSync(log, 'utf8')
          .split('\n')
          .filter((line) => line !== '')
          .map((line) => JSON.parse(line));
      } catch {
        return [];
      }
    },
  };
}

// Runs `margent update {args}` in the world. `calls` are the fakes' calls as "tool argv", in order.
function update(w, args = []) {
  // XDG_STATE_HOME is not passed on: the world's env holds only the fake tools and the HOME.
  const r = spawnSync(process.execPath, [CLI, 'update', ...args], { cwd: w.cwd, env: w.env, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, calls: w.calls().map((c) => [c.tool, ...c.argv].join(' ')) };
}

const DETECT = [
  'npm view margent version',
  'npm ls -g margent --json --depth=0',
  'claude plugin list --json',
  'claude plugin marketplace list --json',
];

test('all three channels behind: the report, the commands in order, then the new-session line', () => {
  const w = world({ answers: { ...installs(BEHIND), 'npm i -g margent@0.8.0': { stdout: 'added margent\n' } } });
  const r = update(w);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    r.stdout,
    [
      `latest: ${LATEST}`,
      `cli: ${BEHIND} → ${LATEST}`,
      `  $ npm i -g margent@${LATEST}`,
      `plugin: ${BEHIND} → ${LATEST}`,
      '  $ claude plugin marketplace update margent',
      '  $ claude plugin update margent@margent',
      `global skills: ${BEHIND} → ${LATEST}`,
      '  $ npx -y skills update docs-open docs-review docs-serve margent -g -y',
      'added margent',
      NEW_SESSION,
      '',
    ].join('\n')
  );
  assert.deepEqual(r.calls, [
    ...DETECT,
    `npm i -g margent@${LATEST}`,
    'claude plugin marketplace update margent',
    'claude plugin update margent@margent',
    'npx -y skills update docs-open docs-review docs-serve margent -g -y',
  ]);
});

test('all current: ok lines, no update command runs, no new-session line', full, () => {
  const w = world({ answers: installs(LATEST), skillVersion: LATEST });
  const r = update(w);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    r.stdout,
    [`latest: ${LATEST}`, `ok cli: ${LATEST}`, `ok plugin: ${LATEST}`, `ok global skills: ${LATEST}`, ''].join('\n')
  );
  assert.deepEqual(r.calls, DETECT);
});

test('--check with channels behind prints the report and runs no update command', full, () => {
  const w = world();
  const r = update(w, ['--check']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`^latest: ${LATEST}\\ncli: ${BEHIND} → ${LATEST}\\n  \\$ npm i -g margent@${LATEST}\\n`));
  assert.match(r.stdout, /global skills: 0\.7\.0 → 0\.8\.0\n {2}\$ npx -y skills update docs-open docs-review docs-serve margent -g -y\n$/);
  assert.doesNotMatch(r.stdout, /Start a new agent session/);
  assert.deepEqual(r.calls, DETECT);
});

test('a linked CLI and a folder-read plugin are skipped with their folders, and nothing runs for them', full, () => {
  const npmRoot = join(workdir, 'prefix', 'lib', 'node_modules');
  const answers = {
    ...installs(BEHIND),
    'npm ls -g margent --json --depth=0': { stdout: fixture('npm-ls-linked.json', BEHIND) },
    'npm root -g': { stdout: `${npmRoot}\n` },
    'claude plugin list --json': { stdout: fixture('plugin-list-folder.json', BEHIND) },
    'claude plugin marketplace list --json': { stdout: fixture('marketplaces-folder.json') },
  };
  const w = world({ answers });
  const r = update(w);
  assert.equal(r.status, 0, r.stderr);
  // npm writes the link relative to the global node_modules folder: three levels up from it is the home folder here.
  const folder = join(workdir, 'frostmourne', 'margent');
  assert.equal(
    r.stdout,
    [
      `latest: ${LATEST}`,
      `skipped cli: linked to a folder (${folder})`,
      `skipped plugin: marketplace is a local folder (/Users/dvq/frostmourne/margent)`,
      `global skills: ${BEHIND} → ${LATEST}`,
      '  $ npx -y skills update docs-open docs-review docs-serve margent -g -y',
      NEW_SESSION,
      '',
    ].join('\n')
  );
  assert.deepEqual(r.calls, [
    'npm view margent version',
    'npm ls -g margent --json --depth=0',
    'npm root -g',
    'claude plugin list --json',
    'claude plugin marketplace list --json',
    'npx -y skills update docs-open docs-review docs-serve margent -g -y',
  ]);
});

test('claude not on PATH: no plugin line, and the other channels update', full, () => {
  const w = world({ tools: ['npm', 'npx'], answers: installs(BEHIND) });
  const r = update(w);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /plugin/);
  assert.match(r.stdout, /^latest: 0\.8\.0\ncli: 0\.7\.0 → 0\.8\.0\n {2}\$ npm i -g margent@0\.8\.0\nglobal skills: 0\.7\.0 → 0\.8\.0\n/);
  assert.deepEqual(r.calls, [
    'npm view margent version',
    'npm ls -g margent --json --depth=0',
    'npm i -g margent@0.8.0',
    'npx -y skills update docs-open docs-review docs-serve margent -g -y',
  ]);
});

test('a failing update command prints fail, exits 1, and the next channel still runs', full, () => {
  const answers = {
    ...installs(BEHIND),
    'npm i -g margent@0.8.0': { status: 1, stderr: 'EACCES: permission denied\n' },
  };
  const w = world({ answers });
  const r = update(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^fail cli: npm i -g margent@0\.8\.0 exited 1\n/m);
  assert.match(r.stdout, /^plugin: 0\.7\.0 → 0\.8\.0$/m);
  assert.deepEqual(r.calls, [
    ...DETECT,
    'npm i -g margent@0.8.0',
    'claude plugin marketplace update margent',
    'claude plugin update margent@margent',
    'npx -y skills update docs-open docs-review docs-serve margent -g -y',
  ]);
  // The plugin and the skills updated, so the new-session line still says what to do.
  assert.match(r.stdout, /Start a new agent session/);
});

test('a failing claude step stops that channel and leaves the others', full, () => {
  const answers = {
    ...installs(BEHIND),
    'claude plugin marketplace update margent': { status: 1, stderr: 'no such marketplace\n' },
  };
  const w = world({ answers });
  const r = update(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^fail plugin: claude plugin marketplace update margent exited 1\n/m);
  assert.deepEqual(r.calls, [
    ...DETECT,
    `npm i -g margent@${LATEST}`,
    'claude plugin marketplace update margent',
    'npx -y skills update docs-open docs-review docs-serve margent -g -y',
  ]);
  assert.match(r.stdout, /Start a new agent session/);
});

test('npm view failing: fail latest with its stderr, exit 1, and nothing else runs', full, () => {
  const w = world({ answers: { 'npm view margent version': { status: 1, stderr: 'E404 Not Found - margent\n' } } });
  const r = update(w);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, 'fail latest: E404 Not Found - margent\n');
  assert.deepEqual(r.calls, ['npm view margent version']);
});

test('unreadable claude plugin list output: fail plugin, exit 1, the other channels still report', full, () => {
  const answers = { ...installs(BEHIND), 'claude plugin list --json': { stdout: 'Error: not logged in\n' } };
  const w = world({ answers });
  const r = update(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^fail plugin: claude plugin list --json printed no JSON\n/m);
  assert.match(r.stdout, /^cli: 0\.7\.0 → 0\.8\.0$/m);
  assert.match(r.stdout, /^global skills: 0\.7\.0 → 0\.8\.0$/m);
});

test('a lock entry whose skill folder is missing: fail global skills, exit 1', full, () => {
  const w = world({ answers: installs(BEHIND), skillVersion: null });
  const r = update(w);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^fail global skills: the lock lists dvquy13\/margent skills, but .*SKILL\.md cannot be read/m);
  assert.match(r.stdout, /^cli: 0\.7\.0 → 0\.8\.0$/m);
});

test('nothing installed: the no-install line, exit 0', full, () => {
  const answers = {
    'npm view margent version': { stdout: `${LATEST}\n` },
    'npm ls -g margent --json --depth=0': { stdout: '{"name":"lib"}\n', status: 1 },
    'claude plugin list --json': { stdout: '[]\n' },
    'claude plugin marketplace list --json': { stdout: '[]\n' },
  };
  const w = world({ answers, lock: false, skillVersion: null });
  const r = update(w);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, `latest: ${LATEST}\nno margent install found. Install it with: npm i -g margent\n`);
  // No plugin entry, so the marketplace is not asked about.
  assert.deepEqual(r.calls, DETECT.slice(0, 3));
});

test('project skills are updated with -p in the project folder', full, () => {
  const w = world({
    answers: { ...installs(LATEST), 'npx -y skills update docs-open docs-review docs-serve margent -p -y': {} },
    skillVersion: LATEST,
    project: { skillVersion: BEHIND },
  });
  const r = update(w);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^project skills: 0\.7\.0 → 0\.8\.0\n {2}\$ npx -y skills update docs-open docs-review docs-serve margent -p -y\n/m);
  const npx = w.calls().find((c) => c.tool === 'npx');
  assert.equal(npx.cwd, realpathSync(w.cwd));
  assert.match(r.stdout, /Start a new agent session/);
});

test('an extra argument to update is a usage error, exit 2, and no tool runs', full, () => {
  for (const args of [['--force'], ['--check', 'now']]) {
    const w = world();
    const r = update(w, args);
    assert.equal(r.status, 2, `margent update ${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /^margent: update takes only --check\n/);
    assert.match(r.stderr, /margent update \[--check\]/);
    assert.deepEqual(r.calls, []);
  }
});
