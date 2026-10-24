import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { VERSION } from './helpers/version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { RenderError } = await import('../.build/errors.js');

// `npx skills add` parses frontmatter strictly and skips a skill it can't read, where Claude Code is lenient.
test('every skill has strict-YAML frontmatter naming its folder', () => {
  const dirs = readdirSync(join(root, 'skills'));
  assert.ok(dirs.length > 0);
  for (const dir of dirs) {
    const text = readFileSync(join(root, 'skills', dir, 'SKILL.md'), 'utf8');
    const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
    assert.ok(front, `skills/${dir}/SKILL.md: no frontmatter`);
    const data = parseYaml(front[1]);
    assert.equal(data.name, dir, `skills/${dir}/SKILL.md: name`);
    assert.equal(typeof data.description, 'string', `skills/${dir}/SKILL.md: description`);
  }
});

test('RenderError formats file:line: message', () => {
  const err = new RenderError('docs/a.md', 12, 'bad thing');
  assert.equal(err.message, 'docs/a.md:12: bad thing');
  assert.equal(err.name, 'RenderError');
  assert.equal(err.file, 'docs/a.md');
  assert.equal(err.line, 12);
  assert.equal(err.detail, 'bad thing');
  assert.ok(err instanceof Error);
});

test('dist/cli.js --version prints the package version', () => {
  const out = execFileSync(process.execPath, [join(root, 'dist', 'cli.js'), '--version'], { encoding: 'utf8' });
  assert.equal(out, `${VERSION}\n`);
});

// release-please's generic updater bumps only the first version on a line, so a second one would go stale.
test('no line in skills/ holds more than one version', () => {
  const crowded = [];
  for (const rel of readdirSync(join(root, 'skills'), { recursive: true })) {
    if (!rel.endsWith('.md')) continue;
    readFileSync(join(root, 'skills', rel), 'utf8').split('\n').forEach((line, i) => {
      if ((line.match(/\b\d+\.\d+\.\d+\b/g) ?? []).length > 1) crowded.push(`skills/${rel.split(sep).join('/')}:${i + 1}`);
    });
  }
  assert.deepEqual(crowded, []);
});

test('package.json, plugin.json, skills and dist/cli.js carry one version', () => {
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  const pluginVersion = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  const pins = [];
  for (const rel of readdirSync(join(root, 'skills'), { recursive: true })) {
    if (!rel.endsWith('.md')) continue;
    const text = readFileSync(join(root, 'skills', rel), 'utf8');
    // Every x.y.z in a skill pins the CLI: `npx -y margent@x.y.z` and "if it prints `x.y.z`" (decision 0024).
    for (const m of text.matchAll(/\b\d+\.\d+\.\d+\b/g)) {
      pins.push({ file: `skills/${rel.split(sep).join('/')}`, version: m[0] });
    }
  }
  assert.ok(pins.length > 0, 'expected a version pin in skills/');
  const cliVersion = execFileSync(process.execPath, [join(root, 'dist', 'cli.js'), '--version'], { encoding: 'utf8' }).trim();
  const mismatches = [];
  if (pluginVersion !== version) mismatches.push(`.claude-plugin/plugin.json: ${pluginVersion}`);
  if (cliVersion !== version) mismatches.push(`dist/cli.js --version: ${cliVersion}`);
  for (const pin of pins) {
    if (pin.version !== version) mismatches.push(`${pin.file}: ${pin.version}`);
  }
  assert.deepEqual(mismatches, []);
});

test('unknown command prints usage to stderr and exits 2', () => {
  const res = spawnSync(process.execPath, [join(root, 'dist', 'cli.js'), 'nope'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
  assert.equal(res.stdout, '');
  assert.match(res.stderr, /^margent: unknown command "nope"\nusage:\n/);
});
