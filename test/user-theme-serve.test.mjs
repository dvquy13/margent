// The user's theme in `margent serve` (spec U2.1, U2.3, U4.1, U4.2, acceptance A5). Pages are read over HTTP and the
// reload events over a raw SSE client, with real file writes to the margent home folder, as the user would make them.
// Run `npm run build` first (or `npm test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveCopy } from './helpers/serve-page.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(REPO, 'test', 'fixtures', 'panel', 'docs');
const { startServer } = await import('../.build/serve/server.js');

const THEME_CSS = 'body { --margent-test-theme: rebeccapurple; }\n';
// The style element as the page writes it: the theme's bytes, as they are.
const themeBlock = (css) => `<style id="margent-user-theme">\n${css}\n</style>`;

// A margent home folder for one test, removed when the test ends.
function homeFor(t) {
  const home = mkdtempSync(join(tmpdir(), 'margent-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

// The session cookie the token URL sets (every route needs it).
async function sessionCookie(served) {
  const res = await fetch(served.server.url, { redirect: 'manual' });
  const cookie = res.headers.get('set-cookie');
  assert.ok(cookie, 'the token URL sets a cookie');
  return cookie.split(';')[0];
}

async function get(served, cookie, path) {
  const res = await fetch(served.url(path), { headers: { cookie } });
  return { status: res.status, text: await res.text() };
}

// An SSE client on /_events for one doc, rendered from its current bytes. Every event name it gets is recorded.
function openStream(served, cookie, mdPath) {
  const hashHex = createHash('sha256').update(readFileSync(join(served.root, mdPath))).digest('hex');
  const events = new EventEmitter();
  const names = [];
  let buffer = '';
  const req = http.get(
    {
      host: '127.0.0.1',
      port: served.server.port,
      path: `/_events?path=${encodeURIComponent(mdPath)}&hash=${hashHex}`,
      headers: { cookie },
    },
    (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        let end;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const match = /^event: (.+)$/m.exec(block);
          if (match) {
            names.push(match[1]);
            events.emit('event', match[1]);
          }
        }
      });
    }
  );
  req.on('error', () => {}); // destroyed when the test ends: the socket error is expected then
  return { names, events, close: () => req.destroy() };
}

// Resolves when the stream gets the named event. Bounded: rejects after `ms`.
function nextEvent(stream, name, ms = 5000) {
  return new Promise((ok, fail) => {
    const on = (event) => {
      if (event !== name) return;
      clearTimeout(timer);
      stream.events.off('event', on);
      ok();
    };
    const timer = setTimeout(() => {
      stream.events.off('event', on);
      fail(new Error(`no "${name}" event within ${ms} ms`));
    }, ms);
    stream.events.on('event', on);
  });
}

test('A5 U4.1: creating, editing and deleting theme.css sends each open page a changed event', async (t) => {
  const home = homeFor(t);
  const served = await serveCopy(FIXTURE, { home });
  t.after(() => served.close());
  const cookie = await sessionCookie(served);
  const stream = openStream(served, cookie, 'panel.md');
  t.after(() => stream.close());
  const theme = join(home, 'theme.css');

  // No theme.css, no write: no event.
  await new Promise((ok) => setTimeout(ok, 600));
  assert.deepEqual(stream.names, []);

  writeFileSync(theme, THEME_CSS);
  await nextEvent(stream, 'changed');

  writeFileSync(theme, 'body { --margent-test-theme: teal; }\n');
  await nextEvent(stream, 'changed');

  unlinkSync(theme);
  await nextEvent(stream, 'changed');
  assert.deepEqual(stream.names, ['changed', 'changed', 'changed']);
});

test('U2.1: a theme is in the doc page and the index, after the house style', async (t) => {
  const home = homeFor(t);
  writeFileSync(join(home, 'theme.css'), THEME_CSS);
  const served = await serveCopy(FIXTURE, { home });
  t.after(() => served.close());
  const cookie = await sessionCookie(served);

  const doc = await get(served, cookie, 'panel.html');
  assert.equal(doc.status, 200);
  assert.ok(doc.text.includes(themeBlock(THEME_CSS)), 'the doc page carries the theme');
  assert.ok(doc.text.indexOf('<style id="margent-user-theme">') > doc.text.indexOf('</style>'), 'the theme follows the house style');

  const index = await get(served, cookie, '');
  assert.equal(index.status, 200);
  assert.ok(index.text.includes(themeBlock(THEME_CSS)), 'the index carries the theme');
});

test('U2.1: without a home folder, neither page has a theme, and a home with no theme.css changes no bytes', async (t) => {
  const plain = await serveCopy(FIXTURE);
  t.after(() => plain.close());
  const home = homeFor(t);
  const withHome = await serveCopy(FIXTURE, { home });
  t.after(() => withHome.close());
  const plainCookie = await sessionCookie(plain);
  const homeCookie = await sessionCookie(withHome);

  // Each served copy has its own temp folder name, which the pages print: it is set aside before the comparison.
  const named = (served, text) => text.split(basename(served.root)).join('ROOT');
  for (const path of ['panel.html', '']) {
    const a = await get(plain, plainCookie, path);
    assert.equal(a.text.includes('<style id="margent-user-theme">'), false, `no home: ${path || 'index'} has no theme`);
    const b = await get(withHome, homeCookie, path);
    assert.equal(named(withHome, b.text), named(plain, a.text), `no theme.css: ${path || 'index'} is byte-identical`);
  }
});

test('U2.1: a theme that holds "</style" fails the doc with its message, and the page comes back when fixed', async (t) => {
  const home = homeFor(t);
  const served = await serveCopy(FIXTURE, { home });
  t.after(() => served.close());
  const cookie = await sessionCookie(served);
  const stream = openStream(served, cookie, 'panel.md');
  t.after(() => stream.close());
  const theme = join(home, 'theme.css');

  writeFileSync(theme, 'body { color: red; }\n</style><p>escape</p>\n');
  await nextEvent(stream, 'changed');
  const broken = await get(served, cookie, 'panel.html');
  assert.equal(broken.status, 500);
  assert.match(broken.text, /did not render/);
  assert.match(broken.text, /theme\.css:2: theme\.css must not contain &quot;&lt;\/style&quot;/);

  // The index stays up, unthemed, and says why.
  const index = await get(served, cookie, '');
  assert.equal(index.status, 200);
  assert.match(index.text, /<p class="entry-error"><code>[^<]*theme\.css:2: theme\.css must not contain/);
  assert.equal(index.text.includes('<style id="margent-user-theme">'), false);

  writeFileSync(theme, THEME_CSS);
  await nextEvent(stream, 'changed');
  const fixed = await get(served, cookie, 'panel.html');
  assert.equal(fixed.status, 200);
  assert.ok(fixed.text.includes(themeBlock(THEME_CSS)));
});

test('U4.2: a theme that holds "</style" when the server starts makes startServer reject with its line', async (t) => {
  const home = homeFor(t);
  writeFileSync(join(home, 'theme.css'), 'body {}\n</style>\n');
  await assert.rejects(startServer({ root: FIXTURE, port: 0, home }), /theme\.css:2: theme\.css must not contain/);
});

test('U4.2: a theme that cannot be read when the server starts makes startServer reject with the reason', async (t) => {
  const home = homeFor(t);
  mkdirSync(join(home, 'theme.css'));
  await assert.rejects(startServer({ root: FIXTURE, port: 0, home }), /theme\.css: cannot read the theme/);
});
