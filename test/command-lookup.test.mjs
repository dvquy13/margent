// Finding Chrome (M1 spec R4) and the browser opener `doctor` checks (M5 spec R7), on Windows and elsewhere. platform
// and env are passed in, so every case runs on any OS: fake executables live in temp folders, and no case reads the
// machine's own Chrome or PATH. Imported from .build/ (run `npm run build` first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromeLocations, findChrome } = await import('../.build/cli/chrome.js');
const { openerCommand, openerResolves } = await import('../.build/cli/opener.js');
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
const PATHEXT = '.com;.exe;.bat;.cmd';

// ---- Chrome on Windows

for (const name of ['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA']) {
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

test('win32: findChrome finds chrome.exe on PATH through PATHEXT', () => {
  const bin = tmp('bin');
  const chrome = fakeExe(bin, 'chrome.exe');
  assert.equal(findChrome({ PATH: bin, PATHEXT }, 'win32'), chrome);
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
  const chrome = fakeExe(bin, 'google-chrome');
  assert.equal(findChrome({ PATH: bin }, 'linux'), chrome);
  const exeOnly = tmp('exe-only');
  fakeExe(exeOnly, 'google-chrome.exe');
  assert.throws(() => findChrome({ PATH: exeOnly, PATHEXT }, 'linux'), /none was found/);
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

test('win32: cmd resolves to cmd.exe on PATH through PATHEXT, from Path in any case', () => {
  const system32 = tmp('system32');
  const cmd = fakeExe(system32, 'cmd.exe');
  assert.equal(findOnPath('cmd', { Path: system32, PATHEXT }, 'win32'), cmd);
  assert.equal(openerResolves('cmd', { PATH: system32, PATHEXT }, 'win32'), true);
  // Without PATHEXT the Windows default list applies (.COM;.EXE;.BAT;.CMD); match its case so case-sensitive file
  // systems find it too.
  const upper = tmp('upper');
  fakeExe(upper, 'cmd.EXE');
  assert.equal(openerResolves('cmd', { PATH: upper }, 'win32'), true);
  assert.equal(openerResolves('definitely-not-a-command-xyz', { PATH: system32, PATHEXT }, 'win32'), false);
});

test('win32: an absolute BROWSER path is checked as given, not searched on PATH', () => {
  const dir = tmp('browser');
  const browser = fakeExe(dir, 'browser.exe');
  // On Windows join() gives backslashes and no slash at all.
  assert.equal(resolveCommand(browser, { PATH: '', PATHEXT }, 'win32'), browser);
  assert.equal(openerResolves(browser, { PATH: '' }, 'win32'), true);
  assert.equal(openerResolves(join(dir, 'browser'), { PATH: '', PATHEXT }, 'win32'), true, 'PATHEXT applies to a path');
  assert.equal(openerResolves('C:\\Nope\\browser.exe', { PATH: dir, PATHEXT }, 'win32'), false);
});

test('linux and macOS: a bare name is searched on PATH as is, a path with a slash is checked as given', () => {
  const bin = tmp('bin');
  // Forward slashes, so the path reads as a path for a POSIX platform when this test runs on Windows too.
  const opener = fakeExe(bin, 'xdg-open').split('\\').join('/');
  fakeExe(bin, 'cmd.exe');
  for (const platform of ['linux', 'darwin']) {
    assert.equal(openerResolves('xdg-open', { PATH: bin }, platform), true);
    assert.equal(openerResolves('cmd', { PATH: bin, PATHEXT }, platform), false, 'no PATHEXT off Windows');
    assert.equal(resolveCommand(opener, { PATH: '' }, platform), opener);
    assert.equal(openerResolves(`${opener}-nope`, { PATH: bin }, platform), false);
  }
});
