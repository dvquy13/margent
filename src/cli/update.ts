// `margent update` and `margent update --check` (decision 0042): finds every install of margent (the CLI, the Claude Code
// plugin, and the skills from `npx skills` in the home folder and in the current project), reads the latest version from
// npm, and updates each install that is behind. --check prints the same report and runs nothing.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const IS_WINDOWS = process.platform === 'win32';
const SKILL_SOURCE = 'dvquy13/margent';
// The skill whose SKILL.md names the CLI version its skills were written for.
const VERSION_SKILL = 'margent';
const PLUGIN_ID = 'margent@margent';
const MARKETPLACE = 'margent';
const NEW_SESSION = 'Start a new agent session to load the updated skills.';
const NO_INSTALL = 'no margent install found. Install it with: npm i -g margent';

interface Command {
  file: string;
  args: string[];
}

// What a channel found. A channel that isn't installed is null, not a Found.
type Found =
  | { kind: 'ok'; current: string }
  | { kind: 'skipped'; reason: string; folder: string }
  | { kind: 'behind'; current: string; commands: Command[] };

// Returns what the channel found at the latest version. Throws an Error when the install can't be read.
type Detect = (latest: string) => Found | null;

interface Channel {
  name: string;
  detect: Detect;
  // Whether a successful update of this channel means agents must start a new session to load the skills.
  reloadsSkills: boolean;
}

interface Captured {
  missing: boolean;
  status: number | null;
  stdout: string;
  stderr: string;
}

// stdout is written synchronously: the update commands inherit this process's stdout, and their output must come after
// the report lines that announce them.
function say(line: string): void {
  writeSync(1, `${line}\n`);
}

function show(command: Command): string {
  return [command.file, ...command.args].join(' ');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Runs a tool and captures its output. A tool that isn't on PATH comes back as `missing`, which the channels read as
// "not installed". Any other spawn error is thrown.
function capture(file: string, args: string[]): Captured {
  const r = spawnSync(file, args, { encoding: 'utf8', shell: IS_WINDOWS });
  if (r.error) {
    if ((r.error as NodeJS.ErrnoException).code === 'ENOENT') return { missing: true, status: null, stdout: '', stderr: '' };
    throw r.error;
  }
  return { missing: false, status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// The stderr of a failed tool, for the message, or nothing.
function detail(r: Captured): string {
  const text = r.stderr.trim();
  return text === '' ? '' : `: ${text}`;
}

// The parsed stdout of a tool. A non-zero exit is an error only when `exitMatters`: npm ls exits 1 for a missing package
// and for problems in the tree, and its JSON still says what is installed.
function jsonFrom(r: Captured, name: string, exitMatters: boolean): unknown {
  if (r.missing) throw new Error(`${name} could not run: not on PATH`);
  if (exitMatters && r.status !== 0) throw new Error(`${name} exited ${r.status}${detail(r)}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error(`${name} printed no JSON${detail(r)}`);
  }
}

function record(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${what} is not an object`);
  return value as Record<string, unknown>;
}

function list(value: unknown, what: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${what} is not a list`);
  return value.map((item) => record(item, `an entry of ${what}`));
}

// An x.y.z version, or an error that names where it was read.
function semverOf(value: unknown, where: string): string {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error(`${where} has no x.y.z version: ${JSON.stringify(value)}`);
  }
  return value;
}

function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// An install at `current` is behind when `latest` is newer; an install newer than latest is current.
function judge(current: string, latest: string, commands: Command[]): Found {
  return compareVersions(current, latest) < 0 ? { kind: 'behind', current, commands } : { kind: 'ok', current };
}

function latestVersion(): string {
  const r = capture('npm', ['view', 'margent', 'version']);
  if (r.missing) throw new Error('npm is not on PATH');
  if (r.status !== 0) throw new Error(r.stderr.trim() || `npm view exited ${r.status}`);
  return semverOf(r.stdout.trim(), 'npm view margent version');
}

// The CLI: the global npm package. A link to a folder (npm link) is a development install and is not touched.
function cliChannel(latest: string): Found | null {
  const r = capture('npm', ['ls', '-g', 'margent', '--json', '--depth=0']);
  if (r.missing) return null;
  const tree = record(jsonFrom(r, 'npm ls -g margent --json', false), 'npm ls output');
  const dependencies = tree.dependencies === undefined ? {} : record(tree.dependencies, 'npm ls dependencies');
  if (dependencies.margent === undefined) return null;
  const entry = record(dependencies.margent, 'npm ls margent entry');
  const resolved = entry.resolved;
  if (typeof resolved === 'string' && resolved.startsWith('file:')) {
    // npm writes a link relative to the global node_modules folder.
    const root = capture('npm', ['root', '-g']);
    if (root.missing || root.status !== 0) throw new Error(`npm root -g failed${detail(root)}`);
    const folder = resolve(root.stdout.trim(), resolved.slice('file:'.length));
    return { kind: 'skipped', reason: 'linked to a folder', folder };
  }
  const current = semverOf(entry.version, 'npm ls -g margent');
  return judge(current, latest, [{ file: 'npm', args: ['i', '-g', `margent@${latest}`] }]);
}

// The plugin: margent@margent in the Claude Code plugin list. A plugin read from a local folder, or whose marketplace is a
// local folder, is a development install and is not touched.
function pluginChannel(latest: string): Found | null {
  const listing = capture('claude', ['plugin', 'list', '--json']);
  if (listing.missing) return null;
  const plugins = list(jsonFrom(listing, 'claude plugin list --json', true), 'claude plugin list --json');
  const entry = plugins.find((plugin) => plugin.id === PLUGIN_ID);
  if (entry === undefined) return null;
  const markets = list(
    jsonFrom(capture('claude', ['plugin', 'marketplace', 'list', '--json']), 'claude plugin marketplace list --json', true),
    'claude plugin marketplace list --json'
  );
  const folderMarket = markets.find((market) => market.name === MARKETPLACE && market.source === 'directory');
  if (folderMarket !== undefined) {
    if (typeof folderMarket.path !== 'string') throw new Error('claude plugin marketplace list: margent has no path');
    return { kind: 'skipped', reason: 'marketplace is a local folder', folder: folderMarket.path };
  }
  if (typeof entry.readFromFolder === 'string') {
    return { kind: 'skipped', reason: 'read from a folder', folder: entry.readFromFolder };
  }
  const current = semverOf(entry.version, 'claude plugin list margent@margent');
  return judge(current, latest, [
    { file: 'claude', args: ['plugin', 'marketplace', 'update', MARKETPLACE] },
    { file: 'claude', args: ['plugin', 'update', PLUGIN_ID] },
  ]);
}

// The skills lock file of one scope. The skills CLI reads the global one from $XDG_STATE_HOME/skills when that is set, and
// from ~/.agents otherwise; the project one is skills-lock.json in the project. A missing file is null: nothing installed.
function readLock(path: string): Record<string, unknown> | null {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`cannot read ${path}: ${errorMessage(err)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${path} is not JSON`);
  }
  return record(record(parsed, path).skills, `${path} skills`);
}

// The version a margent skill names: the one margent@{x.y.z} between the release-please markers in its SKILL.md.
function skillVersion(path: string): string {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    throw new Error(`the lock lists ${SKILL_SOURCE} skills, but ${path} cannot be read: ${errorMessage(err)}`);
  }
  const start = text.indexOf('<!-- x-release-please-start-version -->');
  const end = text.indexOf('<!-- x-release-please-end -->');
  if (start === -1 || end === -1 || end < start) throw new Error(`${path} has no version markers`);
  const versions = new Set([...text.slice(start, end).matchAll(/margent@(\d+\.\d+\.\d+)/g)].map((m) => m[1]));
  if (versions.size !== 1) throw new Error(`${path} names ${versions.size === 0 ? 'no' : 'several'} margent@{version}`);
  return [...versions][0];
}

// The skills from `npx skills` whose lock source is this repo. Each scope has its own lock and skills folder.
function skillsChannel(scope: 'global' | 'project', latest: string): Found | null {
  const lockPath =
    scope === 'global'
      ? process.env.XDG_STATE_HOME
        ? join(process.env.XDG_STATE_HOME, 'skills', '.skill-lock.json')
        : join(homedir(), '.agents', '.skill-lock.json')
      : join(process.cwd(), 'skills-lock.json');
  const skills = readLock(lockPath);
  if (skills === null) return null;
  const names = Object.keys(skills)
    .filter((name) => record(skills[name], `${lockPath} entry ${name}`).source === SKILL_SOURCE)
    .sort();
  if (names.length === 0) return null;
  if (!names.includes(VERSION_SKILL)) {
    throw new Error(`${lockPath} lists ${names.join(', ')} from ${SKILL_SOURCE}, but not ${VERSION_SKILL}, whose version it reads`);
  }
  const base = scope === 'global' ? homedir() : process.cwd();
  const current = skillVersion(join(base, '.agents', 'skills', VERSION_SKILL, 'SKILL.md'));
  const commands: Command[] = [
    { file: 'npx', args: ['-y', 'skills', 'update', ...names, scope === 'global' ? '-g' : '-p', '-y'] },
  ];
  return judge(current, latest, commands);
}

const CHANNELS: Channel[] = [
  { name: 'cli', detect: cliChannel, reloadsSkills: false },
  { name: 'plugin', detect: pluginChannel, reloadsSkills: true },
  { name: 'global skills', detect: (latest) => skillsChannel('global', latest), reloadsSkills: true },
  { name: 'project skills', detect: (latest) => skillsChannel('project', latest), reloadsSkills: true },
];

// Runs one update command with stdio inherited. Returns the problem, or null when it exited 0.
function run(command: Command): string | null {
  const r = spawnSync(command.file, command.args, { stdio: 'inherit', shell: IS_WINDOWS });
  if (r.error) return `could not start: ${r.error.message}`;
  if (r.status === 0) return null;
  return `exited ${r.status ?? r.signal}`;
}

// margent update [--check] (decision 0042). Returns the exit code: 1 when any channel failed, else 0.
export function commandUpdate(check: boolean): number {
  let latest: string;
  try {
    latest = latestVersion();
  } catch (err) {
    say(`fail latest: ${errorMessage(err)}`);
    return 1;
  }
  say(`latest: ${latest}`);

  let code = 0;
  let installs = 0;
  const behind: { channel: Channel; commands: Command[] }[] = [];
  for (const channel of CHANNELS) {
    let found: Found | null;
    try {
      found = channel.detect(latest);
    } catch (err) {
      // An install that can't be read is still an install: it is not the "nothing installed" case.
      installs++;
      say(`fail ${channel.name}: ${errorMessage(err)}`);
      code = 1;
      continue;
    }
    if (found === null) continue;
    installs++;
    if (found.kind === 'ok') {
      say(`ok ${channel.name}: ${found.current}`);
    } else if (found.kind === 'skipped') {
      say(`skipped ${channel.name}: ${found.reason} (${found.folder})`);
    } else {
      say(`${channel.name}: ${found.current} → ${latest}`);
      for (const command of found.commands) say(`  $ ${show(command)}`);
      behind.push({ channel, commands: found.commands });
    }
  }

  if (installs === 0) {
    say(NO_INSTALL);
    return 0;
  }
  if (check) return code;

  let reload = false;
  for (const { channel, commands } of behind) {
    let succeeded = true;
    for (const command of commands) {
      const problem = run(command);
      if (problem === null) continue;
      say(`fail ${channel.name}: ${show(command)} ${problem}`);
      code = 1;
      succeeded = false;
      // The next command of this channel may depend on this one, so the channel stops here. The next channel still runs.
      break;
    }
    if (succeeded && channel.reloadsSkills) reload = true;
  }
  if (reload) say(NEW_SESSION);
  return code;
}
