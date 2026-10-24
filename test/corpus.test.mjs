// The edit corpus (spec R10, acceptance A1; decision 0018). Each case in test/edit-corpus/cases/ runs its steps on a fresh
// served copy of test/edit-corpus/docs, in installed Chrome, with real keyboard and mouse input. Then the file must equal
// the case's hand-written expected file byte for byte, and no line outside the edited range may change. Run `npm run build`
// first (or `npm test`). Expected files are never edited to match the output: a failing case is a runtime bug.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { serveCopy, openServedPage } from './helpers/serve-page.mjs';
import { runStep, recordSaves, sleep } from './edit-corpus/steps.mjs';
import { full } from './helpers/tier.mjs';

const HERE = join(dirname(fileURLToPath(import.meta.url)), 'edit-corpus');
const DOCS = join(HERE, 'docs');
const CASES = join(HERE, 'cases');

// Every case: { name, doc, steps, expected (path), original (path), json }.
export function loadCases() {
  const out = [];
  for (const dir of readdirSync(CASES).sort()) {
    for (const file of readdirSync(join(CASES, dir)).filter((f) => f.endsWith('.json')).sort()) {
      const base = file.slice(0, -'.json'.length);
      const json = JSON.parse(readFileSync(join(CASES, dir, file), 'utf8'));
      if (json.expect !== undefined && !['stale', 'no-save'].includes(json.expect)) {
        throw new Error(`${dir}/${file}: expect must be "stale" or "no-save", got ${JSON.stringify(json.expect)}`);
      }
      out.push({
        name: `${dir}/${base}`,
        doc: json.doc,
        steps: json.steps,
        author: json.author,
        expect: json.expect,
        expected: readFileSync(join(CASES, dir, `${base}.expected.md`), 'utf8'),
      });
    }
  }
  return out;
}

// A unified diff of two strings, from diff(1).
export function unifiedDiff(a, b) {
  const dir = mkdtempSync(join(tmpdir(), 'corpus-diff-'));
  try {
    writeFileSync(join(dir, 'a'), a);
    writeFileSync(join(dir, 'b'), b);
    try {
      return execFileSync('diff', ['-u', '--label', 'expected', '--label', 'actual', join(dir, 'a'), join(dir, 'b')], { encoding: 'utf8' });
    } catch (err) {
      if (err.status === 1) return err.stdout;
      throw err;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Checks (b): the lines before the range and the lines after it are the original's. A deletion (empty text) between two
// blank lines also takes one of them, as the splice rule says (spec R6.4 and the splice rules), so the line after the
// range is then the one after the blank line that follows the range.
export function outsideRangeProblem(original, actual, start, end, text) {
  const orig = original.split('\n');
  const act = actual.split('\n');
  const before = orig.slice(0, start - 1);
  if (act.slice(0, start - 1).join('\n') !== before.join('\n')) return 'lines before the edited range changed';
  const collapse = text === '' && start > 1 && orig[start - 2] === '' && orig[end] === '';
  const after = collapse ? orig.slice(end + 1) : orig.slice(end);
  const tail = act.slice(act.length - after.length);
  if (act.length < after.length || tail.join('\n') !== after.join('\n')) return 'lines after the edited range changed';
  return null;
}

// Serves the docs with no author: the config reads no user name and no global file while the server starts.
async function serveWithoutAuthor() {
  const home = mkdtempSync(join(tmpdir(), 'corpus-home-'));
  const saved = { HOME: process.env.HOME, GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM, USER: process.env.USER, USERNAME: process.env.USERNAME, LOGNAME: process.env.LOGNAME };
  process.env.HOME = home;
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  for (const key of ['USER', 'USERNAME', 'LOGNAME']) delete process.env[key];
  try {
    return await serveCopy(DOCS);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  }
}

let browser;
before(async () => {
  browser = await chromium.launch({ channel: 'chrome' });
});
after(async () => {
  await browser.close();
});

// Each wait is bounded and named. Under the full suite's load a case once never settled, which hung the whole run with
// no failure shown; now the stuck phase fails its case by name and the run goes on.
function bounded(promise, ms, what) {
  let timer;
  const limit = new Promise((_, fail) => {
    timer = setTimeout(() => fail(new Error(`${what} did not finish within ${ms} ms`)), ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

for (const c of loadCases()) {
  test(c.name, { ...full, timeout: 120_000 }, async (t) => {
    const original = readFileSync(join(DOCS, c.doc), 'utf8');
    // Closed by t.after, so a page that fails to open cannot leak the server: its watcher would keep this file's process
    // alive after the tests end, and the whole run would hang with no failure shown.
    const served = c.author === null ? await serveWithoutAuthor() : await serveCopy(DOCS, { author: c.author ?? 'Quy' });
    t.after(() => bounded(served.close(), 15_000, 'closing the server'));
    const { page, errors, close } = await bounded(openServedPage(browser, served, c.doc), 30_000, 'opening the page');
    const saves = recordSaves(page);
    // The page reloads itself after a 200. The runner checks the file, not the reloaded page (spec R10.4), so the reload
    // is stubbed: a reload in flight at close time left Chrome waiting in the earlier runs.
    await page.evaluate(() => {
      window.margent.reload = () => {};
    });
    // A 409 reloads the page through the stale path (location.reload), which the stub above doesn't cover. A stale case
    // waits for that reload to finish before it closes the page, or Chrome can hang on the close.
    const reloaded = c.expect === 'stale' ? page.waitForEvent('load') : null;
    try {
      for (const step of c.steps) await bounded(runStep(page, step, { served, doc: c.doc }), 30_000, `step ${JSON.stringify(step)}`);
      // A case whose expected file is the original sends nothing (a refused comment, a blur without change). "stale" is
      // a save refused with 409 because the file changed on disk: the expected file holds that change.
      const sentNothing = c.expect === 'no-save' || (c.expect !== 'stale' && c.expected === original);
      if (sentNothing) {
        assert.equal(c.expected, original, 'a no-save case must expect the original file');
        await sleep(300);
        assert.equal(saves.requests.length, 0, 'a /_save request was sent, but the case expects no save');
      } else {
        for (let i = 0; i < 250 && saves.statuses.length === 0; i++) await sleep(20);
        assert.ok(saves.statuses.length > 0, 'no /_save request was answered: the edit did not save');
        const want = c.expect === 'stale' ? 409 : 200;
        assert.equal(saves.statuses[0], want, `the save answered HTTP ${saves.statuses[0]}, expected ${want}`);
        if (reloaded) await bounded(reloaded, 15_000, 'the reload after the 409');
      }
      assert.deepEqual(errors, [], 'the page reported errors');
      const actual = served.read(c.doc);
      if (actual !== c.expected) {
        assert.fail(`file differs from the expected file:\n${unifiedDiff(c.expected, actual)}`);
      }
      // The range check needs the original file as its base, so a stale case (which holds an outside change) skips it.
      if (!sentNothing && c.expect !== 'stale') {
        const { range: [start, end], text } = JSON.parse(saves.requests[0]);
        const problem = outsideRangeProblem(original, actual, start, end, text);
        assert.equal(problem, null, `bytes outside the edited range ${start}-${end} changed: ${problem}`);
      }
    } finally {
      await bounded(close(), 15_000, 'closing the page');
    }
  });
}
