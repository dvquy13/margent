// Hostile fixture repo (M5 acceptance A2, spec R1 to R4): nothing from a doc or an island escapes. Node never runs island
// code (R1), the frame and the page policy block what an island and the markdown try (R2, R3), and serve refuses dot paths
// (R4). Anything that writes works on a temp copy of test/fixtures/hostile/docs. Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBrowser, islandFrameByName } from './helpers/browser.mjs';
import { serveCopy, openServedPage } from './helpers/serve-page.mjs';
import { full } from './helpers/tier.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'dist', 'cli.js');
const FIXTURE = join(REPO, 'test', 'fixtures', 'hostile', 'docs');
const MARKER_ENV = 'MARGENT_HOSTILE_MARKER';

const workdir = mkdtempSync(join(tmpdir(), 'margent-hostile-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

let counter = 0;
// A fresh copy of the hostile docs folder, under its own parent so `out/` and `cache/` sit beside it.
function copyFixture() {
  const base = join(workdir, `case-${counter++}`);
  cpSync(FIXTURE, join(base, 'docs'), { recursive: true });
  return { base, docs: join(base, 'docs'), marker: join(base, 'marker') };
}

// Runs the CLI from the repo root with the marker variable set. BROWSER=true stands in for the default browser.
function cli(args, { marker, base }) {
  const env = { ...process.env, BROWSER: 'true', XDG_CACHE_HOME: join(base, 'cache'), [MARKER_ENV]: marker };
  delete env.MARGENT_CHROME;
  return spawnSync(process.execPath, [CLI, ...args], { cwd: REPO, encoding: 'utf8', env });
}

// One GET to a running server with the session cookie, over node:http so the Host header is the server's own.
function get(server, path) {
  return new Promise((ok, fail) => {
    const headers = { Host: `127.0.0.1:${server.port}`, Cookie: `margent-${server.port}=${server.token}` };
    const req = http.get({ host: '127.0.0.1', port: server.port, path, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => ok({ status: res.statusCode, body }));
    });
    req.on('error', fail);
  });
}

// ---- R1: Node never runs island code

for (const [label, args] of [
  ['open', (c) => ['open', join(c.docs, 'doc.md')]],
  ['export', (c) => ['export', join(c.docs, 'doc.md'), '--out', join(c.base, 'out')]],
  ['check', (c) => ['check', c.docs]],
]) {
  test(`R1: ${label} of the hostile repo leaves no marker file`, () => {
    const c = copyFixture();
    const r = cli(args(c), c);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(existsSync(c.marker), false, 'island module code ran in Node');
  });
}

test('R1: serve renders the hostile page and leaves no marker file', async (t) => {
  const c = copyFixture();
  const previous = process.env[MARKER_ENV];
  process.env[MARKER_ENV] = c.marker;
  t.after(() => {
    if (previous === undefined) delete process.env[MARKER_ENV];
    else process.env[MARKER_ENV] = previous;
  });
  const served = await serveCopy(FIXTURE);
  t.after(() => served.close());
  const r = await get(served.server, '/doc.html');
  assert.equal(r.status, 200);
  assert.match(r.body, /data-island|agent-island/);
  assert.equal(existsSync(c.marker), false, 'island module code ran in Node under serve');
});

// ---- A2: browser probes, markdown HTML, form

test('A2: every probe from the island frame is blocked, and the page runs no markdown script or handler', async (t) => {
  const served = await serveCopy(FIXTURE);
  t.after(() => served.close());
  await withBrowser(async (browser) => {
    const opened = await openServedPage(browser, served, 'doc.md');
    try {
      const { page } = opened;
      await page.waitForSelector('agent-island[data-state="rendered"]', { timeout: 15000 });
      const frame = await islandFrameByName(page, 'evil');
      // The done marker is an empty span, so it is attached but never visible.
      await frame.waitForSelector('[data-probes-done]', { state: 'attached', timeout: 15000 });
      const probes = await frame.locator('[data-probe]').evaluateAll((els) =>
        els.map((e) => ({ name: e.getAttribute('data-probe'), text: e.textContent })));
      assert.deepEqual(probes.map((p) => p.name).sort(), [
        'document-cookie', 'example', 'local-storage', 'parent-document', 'save-post', 'top-location',
      ]);
      for (const p of probes) assert.match(p.text, /^blocked: /, `probe ${p.name} was allowed: ${p.text}`);

      const ran = await page.evaluate(() => ({
        script: typeof window.__pwnScript,
        img: typeof window.__pwnImg,
      }));
      assert.deepEqual(ran, { script: 'undefined', img: 'undefined' });
    } finally {
      await opened.close();
    }
  });
});

test('A2: a real click on the markdown form does not submit, navigate or change doc.md', full, async (t) => {
  const served = await serveCopy(FIXTURE);
  t.after(() => served.close());
  const before = served.read('doc.md');
  await withBrowser(async (browser) => {
    const opened = await openServedPage(browser, served, 'doc.md');
    try {
      const { page } = opened;
      await page.waitForSelector('agent-island[data-state="rendered"]', { timeout: 15000 });
      const url = page.url();
      await page.evaluate(() => { window.__keep = 'still here'; });
      // The page policy refuses the submission, so there is no navigation for Playwright to wait for.
      await page.click('#pwn-form', { noWaitAfter: true });
      await page.waitForTimeout(1000);
      assert.equal(page.url(), url);
      assert.equal(await page.evaluate(() => window.__keep), 'still here');
      assert.ok(opened.errors.some((e) => /form-action 'none'/.test(e)), `the policy did not report the form: ${opened.errors.join('; ')}`);
    } finally {
      await opened.close();
    }
  });
  assert.equal(served.read('doc.md'), before);
});

// ---- R4: dot paths

test('R4: GET /.env with the session cookie is a 404, though the file exists in the copy', async (t) => {
  const served = await serveCopy(FIXTURE);
  t.after(() => served.close());
  assert.equal(existsSync(join(served.root, '.env')), true);
  const r = await get(served.server, '/.env');
  assert.equal(r.status, 404);
  assert.doesNotMatch(r.body, /TOKEN=secret/);
});

// ---- R5: check on the hostile docs

test('R5: check on the hostile docs exits 0 and prints the island count', full, () => {
  const c = copyFixture();
  const r = cli(['check', c.docs], c);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, 'ok 1 docs, 1 islands\n');
});
