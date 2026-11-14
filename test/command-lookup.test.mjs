// Finding Chrome (M1 spec R4) and the browser opener `doctor` checks (M5 spec R7), on Windows and elsewhere. platform
// and env are passed in, so every case runs on any OS: fake executables live in temp folders, and no case reads the
// machine's own Chrome or PATH. Imported from .build/ (run `npm run build` first).
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromeLocations, findChrome } = await import('../.build/cli/chrome.js');
const { openerCommand, openerResolves, openerSpawn } = await import('../.build/cli/opener.js');
const { findOnPath, resolveCommand } = await import('../.build/cli/command-lookup.js');

const made = [];
// A fresh temp folder, removed when the test process exits.
function tmp(label) {
  const dir = mkdtempSync(join(tmpdir(), `margent-lookup-${label}-`));
  made.push(dir);
  return dir;
}
process.on('exit', () => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

// An executable file at dir/...parts. Windows has no mode bits: any file passes X_OK there.
function fakeExe(dir, ...parts) {
  const path = join(dir, ...parts);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, '#!/bin/sh\nexit 0\n');
  chmodSync(path, 0o755);
  return path;
}

const chromeUnder = (root) => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe');
// A folder as a POSIX PATH entry. A POSIX PATH is split on ":", so on a Windows host the drive is dropped: the
// drive-relative path names the same folder on the current drive.
const posixDir = (dir) => (process.platform === 'win32' ? dir.replace(/^[A-Za-z]:/, '') : dir);
// A PATHEXT that lists .bat and .cmd too, as Windows does: lookups must not use it, since spawn starts neither.
const PATHEXT = '.com;.exe;.bat;.cmd';

// ---- Chrome on Windows

for (const name of ['PROGRAMFILES', 'PROGRAMW6432', 'PROGRAMFILES(X86)', 'LOCALAPPDATA']) {
  test(`win32: findChrome finds chrome.exe under %${name}%`, () => {
    const root = tmp('root');
    const chrome = fakeExe(root, 'Google', 'Chrome', 'Application', 'chrome.exe');
    assert.equal(findChrome({ [name]: root, PATH: '' }, 'win32'), chrome);
  });
}

test('win32: the machine-wide install wins over the per-user one, and env names match in any case', () => {
  const machine = tmp('machine');
  const user = tmp('user');
  const chrome = fakeExe(machine, 'Google', 'Chrome', 'Application', 'chrome.exe');
  fakeExe(user, 'Google', 'Chrome', 'Application', 'chrome.exe');
  assert.equal(findChrome({ ProgramFiles: machine, LocalAppData: user, PATH: '' }, 'win32'), chrome);
});

test('win32: under 32-bit Node, a 64-bit Chrome is found through ProgramW6432', () => {
  const x86 = tmp('x86');
  const x64 = tmp('x64');
  const chrome = fakeExe(x64, 'Google', 'Chrome', 'Application', 'chrome.exe');
  const env = { ProgramFiles: x86, 'ProgramFiles(x86)': x86, ProgramW6432: x64, PATH: '' };
  assert.equal(findChrome(env, 'win32'), chrome);
  assert.deepEqual(chromeLocations(env, 'win32'), [chromeUnder(x86), chromeUnder(x64)], 'the x86 folder is listed once');
});

test('win32: findChrome finds chrome.exe on PATH with .exe appended', () => {
  const bin = tmp('bin');
  const chrome = fakeExe(bin, 'chrome.exe');
  assert.equal(findChrome({ PATH: bin, PATHEXT }, 'win32'), chrome);
});

test('win32: PATH is split on ";" whatever the OS running the lookup', () => {
  const empty = tmp('empty');
  const bin = tmp('bin');
  const chrome = fakeExe(bin, 'chrome.exe');
  assert.equal(findChrome({ PATH: `"${empty}";${bin}`, PATHEXT }, 'win32'), chrome);
});

test('a directory is not an executable: not as MARGENT_CHROME, an install location or a PATH entry', () => {
  const root = tmp('dir-root');
  mkdirSync(join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'), { recursive: true });
  assert.throws(() => findChrome({ MARGENT_CHROME: join(root, 'Google'), PATH: '' }, 'win32'), /not an executable file/);
  assert.throws(() => findChrome({ PROGRAMFILES: root, PATH: '' }, 'win32'), /none was found/);
  const bin = tmp('dir-bin');
  mkdirSync(join(bin, 'google-chrome'));
  assert.throws(() => findChrome({ PATH: posixDir(bin) }, 'linux'), /none was found/);
  assert.equal(resolveCommand(bin, { PATH: '' }, 'linux'), null);
});

test('win32: with no Chrome, the error names the Windows locations it checked and not the macOS one', () => {
  const pf = tmp('pf');
  const local = tmp('local');
  const env = { PROGRAMFILES: pf, LOCALAPPDATA: local, PATH: '' };
  assert.deepEqual(chromeLocations(env, 'win32'), [chromeUnder(pf), chromeUnder(local)]);
  assert.throws(
    () => findChrome(env, 'win32'),
    (err) => {
      assert.ok(err.message.includes(`looked at "${chromeUnder(pf)}", "${chromeUnder(local)}" and chrome, google-chrome,`));
      assert.ok(!err.message.includes('/Applications/'), err.message);
      assert.match(err.message, /set MARGENT_CHROME to the browser binary\.$/);
      return true;
    }
  );
});

test('win32: MARGENT_CHROME still wins over an installed Chrome', () => {
  const root = tmp('root');
  fakeExe(root, 'Google', 'Chrome', 'Application', 'chrome.exe');
  const other = fakeExe(tmp('other'), 'other.exe');
  assert.equal(findChrome({ PROGRAMFILES: root, MARGENT_CHROME: other, PATH: '' }, 'win32'), other);
});

// ---- Chrome elsewhere: unchanged

test('linux: findChrome finds google-chrome on PATH, and no PATHEXT is tried', () => {
  const bin = tmp('bin');
  const chrome = posixDir(fakeExe(bin, 'google-chrome'));
  assert.equal(findChrome({ PATH: posixDir(bin) }, 'linux'), chrome);
  const exeOnly = tmp('exe-only');
  fakeExe(exeOnly, 'google-chrome.exe');
  assert.throws(() => findChrome({ PATH: posixDir(exeOnly), PATHEXT }, 'linux'), /none was found/);
});

test('linux: with no Chrome, the error lists the PATH names only; macOS checks the app bundle', () => {
  assert.deepEqual(chromeLocations({}, 'linux'), []);
  assert.throws(
    () => findChrome({ PATH: '' }, 'linux'),
    /\(looked for google-chrome, google-chrome-stable, chromium, chromium-browser on PATH\)\. Install Google Chrome/
  );
  assert.deepEqual(chromeLocations({}, 'darwin'), ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']);
});

// ---- the opener

test('openerCommand: BROWSER wins, else open, cmd or xdg-open by platform', () => {
  assert.equal(openerCommand({ BROWSER: 'firefox' }, 'win32'), 'firefox');
  assert.equal(openerCommand({}, 'darwin'), 'open');
  assert.equal(openerCommand({}, 'win32'), 'cmd');
  assert.equal(openerCommand({}, 'linux'), 'xdg-open');
});

test('win32: cmd resolves to cmd.exe on PATH with .exe appended, from Path in any case', () => {
  const system32 = tmp('system32');
  const cmd = fakeExe(system32, 'cmd.exe');
  assert.equal(findOnPath('cmd', { Path: system32, PATHEXT }, 'win32'), cmd);
  assert.equal(openerResolves('cmd', { PATH: system32 }, 'win32'), true);
  assert.equal(openerResolves('definitely-not-a-command-xyz', { PATH: system32, PATHEXT }, 'win32'), false);
});

// spawn without a shell starts only .com and .exe files, so doctor must not pass an opener it could never start.
test('win32: a .cmd or .bat opener does not resolve, even though PATHEXT lists it', () => {
  const bin = tmp('cmd-bin');
  const code = fakeExe(bin, 'code.cmd');
  fakeExe(bin, 'opener.bat');
  assert.equal(openerResolves('code', { PATH: bin, PATHEXT }, 'win32'), false);
  assert.equal(openerResolves('opener', { PATH: bin, PATHEXT }, 'win32'), false);
  assert.equal(openerResolves(code, { PATH: '', PATHEXT }, 'win32'), false, 'not as a path either');
});

test('win32: an absolute BROWSER path is checked as given, not searched on PATH', () => {
  const dir = tmp('browser');
  const browser = fakeExe(dir, 'browser.exe');
  // On Windows join() gives backslashes and no slash at all.
  assert.equal(resolveCommand(browser, { PATH: '', PATHEXT }, 'win32'), browser);
  assert.equal(openerResolves(browser, { PATH: '' }, 'win32'), true);
  assert.equal(openerResolves(join(dir, 'browser'), { PATH: '', PATHEXT }, 'win32'), true, '.exe is appended to a path');
  assert.equal(openerResolves('C:\\Nope\\browser.exe', { PATH: dir, PATHEXT }, 'win32'), false);
});

test('linux and macOS: a bare name is searched on PATH as is, a path with a slash is checked as given', () => {
  const bin = tmp('bin');
  // Forward slashes, so the path reads as a path for a POSIX platform when this test runs on Windows too.
  const opener = fakeExe(bin, 'xdg-open').split('\\').join('/');
  fakeExe(bin, 'cmd.exe');
  for (const platform of ['linux', 'darwin']) {
    assert.equal(openerResolves('xdg-open', { PATH: posixDir(bin) }, platform), true);
    assert.equal(openerResolves('cmd', { PATH: posixDir(bin), PATHEXT }, platform), false, 'no .exe appended off Windows');
    assert.equal(resolveCommand(opener, { PATH: '' }, platform), opener);
    assert.equal(openerResolves(`${opener}-nope`, { PATH: posixDir(bin) }, platform), false);
  }
});

// ---- how the opener is run

test('openerSpawn: on Windows the path goes to cmd in MARGENT_OPEN_PATH, never in the command line', () => {
  const path = 'C:\\docs\\100%\\%PATH%\\a & b.html';
  const spawn = openerSpawn(path, { PATH: 'x' }, 'win32');
  assert.equal(spawn.command, 'cmd');
  assert.deepEqual(spawn.args, ['/c', 'start "" "%MARGENT_OPEN_PATH%"']);
  assert.equal(spawn.env.MARGENT_OPEN_PATH, path);
  assert.equal(spawn.windowsVerbatimArguments, true);
  assert.ok(!spawn.args.join(' ').includes('docs'), 'the path is not on the command line');
  for (const [env, platform] of [[{ BROWSER: 'firefox' }, 'win32'], [{}, 'linux'], [{}, 'darwin']]) {
    const plain = openerSpawn(path, env, platform);
    assert.deepEqual(plain.args, [path]);
    assert.equal(plain.windowsVerbatimArguments, false);
    assert.equal(plain.env.MARGENT_OPEN_PATH, undefined);
  }
});

// The real cmd, with echo in place of start: a path holding %NAME% pairs, & and ^ reaches the command unchanged.
test('win32: cmd passes MARGENT_OPEN_PATH through unexpanded', { skip: process.platform !== 'win32' && 'Windows only' }, () => {
  const path = 'C:\\docs\\%PATH%\\100%\\a & b ^ c.html';
  const spawn = openerSpawn(path, { ...process.env, BROWSER: '' }, 'win32');
  const args = [spawn.args[0], spawn.args[1].replace('start ""', 'echo')];
  const result = spawnSync(spawn.command, args, { env: spawn.env, windowsVerbatimArguments: true, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `"${path}"`);
});
