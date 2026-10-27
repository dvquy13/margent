// Server tests (T4, spec R1, R2, R6.1, R6.6, R7.1, acceptance A8). Run after `npm run build`. Requests go through
// node:http, not fetch: fetch drops the Host header, and the Host and Origin checks are what these tests exercise.
// Anything that writes works on a temp copy of test/fixtures/serve/docs. The index check on the margent corpus only reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { networkInterfaces, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { MARGENT_CORPUS } from './helpers/corpus.mjs';

const { startServer } = await import('../.build/serve/server.js');
const { markdownUnder } = await import('../.build/cli/collect.js');

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'dist', 'cli.js');
const FIXTURE = join(REPO, 'test', 'fixtures', 'serve', 'docs');

const workdir = mkdtempSync(join(tmpdir(), 'margent-serve-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

let counter = 0;
// A temp site: `docs/` is a copy of the fixture, and `outside/` sits beside it so traversal has a real target.
// The server closes when its test ends. Each server holds a recursive watcher, and macOS delivers events late and
// unreliably once many are alive in one process.
async function site(t) {
  const base = join(workdir, `site-${counter++}`);
  const root = join(base, 'docs');
  cpSync(FIXTURE, root, { recursive: true });
  mkdirSync(join(base, 'outside'));
  writeFileSync(join(base, 'outside', 'secret.txt'), 'SECRET\n');
  const h = await startServer({ root, port: 0 });
  t.after(() => h.close());
  return { h, root, port: h.port, cookie: `margent-${h.port}=${h.token}`, base };
}

// One request with explicit headers. Host defaults to the server's own address.
function request(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((ok, fail) => {
    const h = { Host: `127.0.0.1:${port}`, ...headers };
    if (body !== undefined) {
      h['Content-Type'] = 'application/json';
      h['Content-Length'] = Buffer.byteLength(body);
    }
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: h }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        ok({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') })
      );
      res.on('error', fail);
    });
    req.on('error', fail);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const sha = (text) => createHash('sha256').update(text).digest('hex');

// The state script the page embeds (spec R3.2).
function pageState(text) {
  const m = /<script type="application\/json" id="margent-state">([\s\S]*?)<\/script>/.exec(text);
  assert.ok(m, 'page has no margent-state script');
  return JSON.parse(m[1]);
}

// Opens the SSE stream for a page rendered from the .md bytes with hash `rendered`, and collects its events. `next(name)`
// waits for the next event.
function openEvents(port, cookie, page, rendered) {
  const events = [];
  let wake = () => {};
  let req;
  const ready = new Promise((ok, fail) => {
    req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: `/_events?path=${encodeURIComponent(page)}&hash=${rendered}`,
        headers: { Host: `127.0.0.1:${port}`, Cookie: cookie, Accept: 'text/event-stream' },
      },
      (res) => {
        ok({ status: res.statusCode, type: res.headers['content-type'] });
        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
          let end;
          while ((end = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const name = /^event: (.+)$/m.exec(block)?.[1];
            if (name) events.push(name);
            wake();
          }
        });
        res.on('error', () => {});
      }
    );
    req.on('error', fail);
    req.end();
  });
  const next = async (name, timeoutMs) => {
    const started = Date.now();
    while (!events.includes(name)) {
      if (Date.now() - started > timeoutMs) throw new Error(`no "${name}" event within ${timeoutMs} ms`);
      await new Promise((r) => {
        wake = r;
        setTimeout(r, 20);
      });
    }
    return Date.now() - started;
  };
  return { ready, next, events, close: () => req.destroy() };
}

const save = (port, cookie, body) =>
  request(port, {
    method: 'POST',
    path: '/_save',
    headers: { Cookie: cookie, Origin: `http://127.0.0.1:${port}` },
    body: JSON.stringify(body),
  });

// ---- A8: bind, cookie, Host, Origin

test('A8: the server listens on 127.0.0.1 only', async (t) => {
  const s = await site(t);
  assert.equal(new URL(s.h.url).hostname, '127.0.0.1');
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal);
  if (lan === undefined) return; // no LAN address on this machine: nothing to refuse
  await assert.rejects(
    new Promise((ok, fail) => {
      const sock = net.connect({ host: lan.address, port: s.port }, () => {
        sock.destroy();
        ok();
      });
      sock.on('error', fail);
    })
  );
});

test('A8: a request without the cookie gets 403', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: '/' });
  assert.equal(r.status, 403);
  assert.match(r.text, /no session cookie/);
});

test('A8: a foreign Host gets 403 even with the cookie', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: '/', headers: { Host: `evil.test:${s.port}`, Cookie: s.cookie } });
  assert.equal(r.status, 403);
  assert.match(r.text, /Host header/);
});

test('A8: localhost is an allowed Host', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: '/', headers: { Host: `localhost:${s.port}`, Cookie: s.cookie } });
  assert.equal(r.status, 200);
});

test('A8: a POST with a foreign Origin gets 403 even with the cookie', async (t) => {
  const s = await site(t);
  const before = readFileSync(join(s.root, 'valid.md'));
  const r = await request(s.port, {
    method: 'POST',
    path: '/_save',
    headers: { Cookie: s.cookie, Origin: 'http://evil.test' },
    body: JSON.stringify({ path: 'valid.md', range: [3, 3], hash: 'x'.repeat(64), text: 'Hacked.' }),
  });
  assert.equal(r.status, 403);
  assert.match(r.text, /Origin/);
  assert.deepEqual(readFileSync(join(s.root, 'valid.md')), before, 'the file was not written');
});

test('A8: the token URL sets an HttpOnly, SameSite=Strict cookie and redirects to the same path without the query', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: `/?token=${s.h.token}` });
  assert.equal(r.status, 302);
  assert.equal(r.headers.location, '/');
  const cookie = [].concat(r.headers['set-cookie'])[0];
  assert.match(cookie, new RegExp(`^margent-${s.port}=${s.h.token};`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  // The cookie it set is the one that opens the index.
  const index = await request(s.port, { path: '/', headers: { Cookie: `margent-${s.port}=${s.h.token}` } });
  assert.equal(index.status, 200);
});

test('A8: a bad token gets 403 and no cookie', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: `/?token=${'0'.repeat(32)}` });
  assert.equal(r.status, 403);
  assert.equal(r.headers['set-cookie'], undefined);
});

test('A8: the token is required on every route, reads included', async (t) => {
  const s = await site(t);
  for (const path of ['/valid.html', '/data.json', '/_events?path=valid.md&hash=0']) {
    const r = await request(s.port, { path });
    assert.equal(r.status, 403, path);
  }
});

// ---- pages

test('a page carries the edit state, and its hash is the hash of the file bytes', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: '/valid.html', headers: { Cookie: s.cookie } });
  assert.equal(r.status, 200);
  assert.equal(r.headers['cache-control'], 'no-store');
  const state = pageState(r.text);
  const bytes = readFileSync(join(s.root, 'valid.md'));
  assert.equal(state.path, 'valid.md');
  assert.equal(state.hash, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(state.source, bytes.toString('utf8'));
  assert.match(r.text, /<style>[\s\S]*\.wrap/, 'the shell CSS is in the page');
});

test('a page in a subfolder without its own islands/ gets the served root as its docs root', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: '/sub/nested.html', headers: { Cookie: s.cookie } });
  assert.equal(r.status, 200);
  assert.equal(pageState(r.text).path, 'sub/nested.md');
});

// A doc that still fails in Node (M5 R1.2): its island names a module that does not exist. The island's data checks
// moved into the guest (M5 R1.3), so the fixture's own broken table renders now and no longer fails here.
function breakDoc(root) {
  writeFileSync(join(root, 'broken.md'), '# Broken doc\n\nIntro.\n\n<!-- island nosuch -->\n| Verdict |\n|---|\n| x |\n');
}

test('a broken doc returns 500 with the error page listing file:line', async (t) => {
  const s = await site(t);
  breakDoc(s.root);
  const r = await request(s.port, { path: '/broken.html', headers: { Cookie: s.cookie } });
  assert.equal(r.status, 500);
  assert.match(r.text, /broken\.md:5: island &quot;nosuch&quot; has no module islands\/nosuch/);
  const brokenHash = sha(readFileSync(join(s.root, 'broken.md')));
  assert.ok(r.text.includes(`new EventSource('/_events?path=' + encodeURIComponent("broken.md") + '&hash=${brokenHash}')`));
});

test('a doc that does not exist gets 404', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: '/missing.html', headers: { Cookie: s.cookie } });
  assert.equal(r.status, 404);
});

// ---- M5 R4: the script policy as a header, and no dot paths

// The policy in a page's meta tag, unescaped. The shell escapes it as text, so `&amp;` is the last to undo.
function metaPolicy(text) {
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(text);
  assert.ok(m, 'page has no Content-Security-Policy meta');
  return m[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// The sha256 CSP source of an inline script's exact text, as the policy lists it.
const scriptSource = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

// The sources of the script-src directive of a policy.
function scriptSrc(policy) {
  const m = /(?:^|; )script-src([^;]*)/.exec(policy);
  assert.ok(m, 'policy has no script-src');
  return m[1].trim().split(/\s+/).filter((s) => s !== '');
}

test('R4.1: a rendered page sends its meta policy as the Content-Security-Policy header', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: '/valid.html', headers: { Cookie: s.cookie } });
  assert.equal(r.status, 200);
  const header = r.headers['content-security-policy'];
  assert.equal(header, metaPolicy(r.text));
  assert.match(header, /connect-src 'self'/, 'a serve page may fetch from its own server');
  assert.ok(scriptSrc(header).length > 0, 'the page lists the hash of its inline scripts');
});

test('R4.1: the error page sends a header whose script-src is the hash of its inline script', async (t) => {
  const s = await site(t);
  breakDoc(s.root);
  const r = await request(s.port, { path: '/broken.html', headers: { Cookie: s.cookie } });
  assert.equal(r.status, 500);
  const scripts =[...r.text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1, 'the error page has one inline script');
  const header = r.headers['content-security-policy'];
  assert.ok(header, 'the error page carries the policy header');
  assert.deepEqual(scriptSrc(header), [scriptSource(scripts[0])]);
  assert.match(header, /connect-src 'self'/);
});

test('R4.1: the index sends a policy with no script hash, since it has no inline script', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: '/', headers: { Cookie: s.cookie } });
  assert.equal(r.status, 200);
  assert.doesNotMatch(r.text, /<script/, 'the index has no script to hash');
  const header = r.headers['content-security-policy'];
  assert.ok(header, 'the index carries the policy header');
  assert.deepEqual(scriptSrc(header), ["'none'"]);
  assert.match(header, /object-src 'none'/);
});

test('R4.2: dot paths get 404 even with a valid cookie, and a page under a dot name is not rendered', async (t) => {
  const s = await site(t);
  // The files exist, so each 404 is the refusal, not an absence.
  writeFileSync(join(s.root, '.env'), 'TOKEN=1\n');
  mkdirSync(join(s.root, '.git'));
  writeFileSync(join(s.root, '.git', 'config'), '[core]\n');
  writeFileSync(join(s.root, 'sub', '.hidden.md'), '# Hidden\n');
  writeFileSync(join(s.root, '.secret.md'), '# Secret\n');
  for (const path of ['/.env', '/.git/config', '/sub/.hidden.md', '/%2Eenv', '/.secret.html']) {
    const r = await request(s.port, { path, headers: { Cookie: s.cookie } });
    assert.equal(r.status, 404, path);
    assert.doesNotMatch(r.text, /TOKEN|\[core\]|Hidden|Secret/, path);
  }
});

test('R4.2: an asset with no dot segment is still served', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: '/chart.svg', headers: { Cookie: s.cookie } });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'image/svg+xml');
});

// ---- index

test('the index lists every doc with its title, status and updated from frontmatter', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: '/', headers: { Cookie: s.cookie } });
  assert.equal(r.status, 200);
  assert.match(r.text, /<a href="framed\.html">Framed doc<\/a>/, 'frontmatter title wins over the heading');
  assert.match(r.text, /<span class="fact">draft<\/span><span class="fact">updated 2026-10-24<\/span>/);
  assert.match(r.text, /<a href="valid\.html">Valid doc<\/a>/, 'first heading is the title');
  assert.match(r.text, /<a href="sub\/nested\.html">/, 'a subfolder doc links with its folder');
  for (const path of ['framed.md', 'valid.md', 'figure.md', 'broken.md', 'sub/nested.md']) {
    assert.ok(r.text.includes(`<span class="entry-path">${path}</span>`), `entry shows ${path}`);
  }
});

test('the index shows a doc with bad frontmatter with its file:line, never drops it', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: '/', headers: { Cookie: s.cookie } });
  assert.match(r.text, /<a href="bad-meta\.html">/);
  assert.match(r.text, /<span class="entry-path">bad-meta\.md<\/span>/, 'the entry with bad frontmatter shows its path');
  assert.match(r.text, /bad-meta\.md:3: invalid frontmatter YAML: Flow sequence/);
});

test('the index on the frozen margent docs lists every .md that markdownUnder finds (read only)', async (t) => {
  const h = await startServer({ root: MARGENT_CORPUS, port: 0 });
  t.after(() => h.close());
  const cookie = `margent-${h.port}=${h.token}`;
  const r = await request(h.port, { path: '/', headers: { Cookie: cookie } });
  assert.equal(r.status, 200);
  const files = markdownUnder(MARGENT_CORPUS);
  assert.ok(files.length > 0, 'the frozen margent docs have markdown');
  for (const file of files) {
    const rel = relative(MARGENT_CORPUS, file).split('/').map(encodeURIComponent).join('/').replace(/\.md$/, '.html');
    assert.ok(r.text.includes(`href="${rel}"`), `index links ${rel}`);
    const shown = relative(MARGENT_CORPUS, file);
    assert.ok(r.text.includes(`<span class="entry-path">${shown}</span>`), `index shows the path ${shown}`);
  }
});

// ---- assets and traversal

test('a file under the root is served with its content type', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: '/data.json', headers: { Cookie: s.cookie } });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(r.text, '{"hello": "world"}\n');
  const svg = await request(s.port, { path: '/chart.svg', headers: { Cookie: s.cookie } });
  assert.equal(svg.headers['content-type'], 'image/svg+xml');
});

test('traversal out of the root gets 404: literal, encoded and through a symlink', async (t) => {
  const s = await site(t);
  // Raw paths: fetch and WHATWG URL resolve dot segments before sending, so these go over node:http unchanged.
  for (const path of ['/../outside/secret.txt', '/%2e%2e/outside/secret.txt', '/%2E%2E/outside/secret.txt', '/..%2foutside%2fsecret.txt']) {
    const r = await request(s.port, { path, headers: { Cookie: s.cookie } });
    assert.equal(r.status, 404, path);
    assert.doesNotMatch(r.text, /SECRET/, path);
  }
  symlinkSync(join(s.base, 'outside', 'secret.txt'), join(s.root, 'link.txt'));
  const link = await request(s.port, { path: '/link.txt', headers: { Cookie: s.cookie } });
  assert.equal(link.status, 404);
  assert.doesNotMatch(link.text, /SECRET/);
});

test('a folder path and a missing file get 404', async (t) => {
  const s = await site(t);
  assert.equal((await request(s.port, { path: '/sub/', headers: { Cookie: s.cookie } })).status, 404);
  assert.equal((await request(s.port, { path: '/nope.png', headers: { Cookie: s.cookie } })).status, 404);
});

// ---- save

test('A8/R6: a save splices the range, returns the new hash, and logs the save', async (t) => {
  const s = await site(t);
  const state = pageState((await request(s.port, { path: '/valid.html', headers: { Cookie: s.cookie } })).text);
  const before = readFileSync(join(s.root, 'valid.md'), 'utf8');
  const lines = [];
  const write = process.stdout.write;
  process.stdout.write = (chunk, ...rest) => {
    lines.push(String(chunk));
    return write.call(process.stdout, chunk, ...rest);
  };
  let r;
  try {
    r = await save(s.port, s.cookie, { path: 'valid.md', range: [3, 3], hash: state.hash, text: 'Intro, edited.' });
  } finally {
    process.stdout.write = write;
  }
  assert.equal(r.status, 200, r.text);
  const expected = before.replace('Intro.\n', 'Intro, edited.\n');
  assert.equal(readFileSync(join(s.root, 'valid.md'), 'utf8'), expected);
  assert.equal(JSON.parse(r.text).hash, sha(expected));
  assert.ok(lines.some((l) => l.includes('saved valid.md lines 3-3 (1 → 1 lines)')), lines.join(''));
});

test('R6.2: a save against a stale hash gets 409 and writes nothing', async (t) => {
  const s = await site(t);
  const before = readFileSync(join(s.root, 'valid.md'));
  const r = await save(s.port, s.cookie, { path: 'valid.md', range: [3, 3], hash: '0'.repeat(64), text: 'Stale.' });
  assert.equal(r.status, 409);
  const body = JSON.parse(r.text);
  assert.equal(body.error, 'stale');
  assert.equal(body.hash, sha(before));
  assert.deepEqual(readFileSync(join(s.root, 'valid.md')), before);
});

test('R6.3: a save that breaks an island marker gets 422 with file:line and writes nothing', async (t) => {
  const s = await site(t);
  const before = readFileSync(join(s.root, 'valid.md'));
  const state = pageState((await request(s.port, { path: '/valid.html', headers: { Cookie: s.cookie } })).text);
  // Line 5 is the island marker. An uppercase name is refused in Node; a bad table is not (M5 R1.4: the guest shows it).
  const r = await save(s.port, s.cookie, {
    path: 'valid.md',
    range: [5, 5],
    hash: state.hash,
    text: '<!-- island Tally -->',
  });
  assert.equal(r.status, 422, r.text);
  const { errors } = JSON.parse(r.text);
  assert.ok(errors.length >= 1);
  assert.match(errors[0], /valid\.md:5: island name "Tally" must be lowercase/);
  assert.deepEqual(readFileSync(join(s.root, 'valid.md')), before);
});

test('R6.1: a bad range gets 400 and writes nothing', async (t) => {
  const s = await site(t);
  const before = readFileSync(join(s.root, 'valid.md'));
  const state = pageState((await request(s.port, { path: '/valid.html', headers: { Cookie: s.cookie } })).text);
  const past = await save(s.port, s.cookie, { path: 'valid.md', range: [3, 99], hash: state.hash, text: 'x' });
  assert.equal(past.status, 400);
  assert.match(JSON.parse(past.text).errors[0], /outside the file/);
  const backwards = await save(s.port, s.cookie, { path: 'valid.md', range: [5, 2], hash: state.hash, text: 'x' });
  assert.equal(backwards.status, 400);
  assert.match(JSON.parse(backwards.text).errors[0], /range must be/);
  const notJson = await request(s.port, { method: 'POST', path: '/_save', headers: { Cookie: s.cookie }, body: '{nope' });
  assert.equal(notJson.status, 400);
  assert.deepEqual(readFileSync(join(s.root, 'valid.md')), before);
});

test('R6.1: a save of a doc that is not under the root, or not a .md, gets 404', async (t) => {
  const s = await site(t);
  const body = { range: [1, 1], hash: '0'.repeat(64), text: 'x' };
  assert.equal((await save(s.port, s.cookie, { path: '../outside/secret.txt', ...body })).status, 404);
  assert.equal((await save(s.port, s.cookie, { path: 'data.json', ...body })).status, 404);
  assert.equal((await save(s.port, s.cookie, { path: 'missing.md', ...body })).status, 404);
});

test('R6.1: a body over 5 MB gets 413', async (t) => {
  const s = await site(t);
  const big = JSON.stringify({ path: 'valid.md', range: [1, 1], hash: '0'.repeat(64), text: 'x'.repeat(5 * 1024 * 1024 + 10) });
  const r = await save(s.port, s.cookie, JSON.parse(big));
  assert.equal(r.status, 413);
});

// ---- live reload

test('R7.1: an external write to the page .md sends changed within 1 second', async (t) => {
  const s = await site(t);
  assert.equal((await request(s.port, { path: '/valid.html', headers: { Cookie: s.cookie } })).status, 200);
  const sse = openEvents(s.port, s.cookie, 'valid.md', sha(readFileSync(join(s.root, 'valid.md'))));
  const opened = await sse.ready;
  assert.equal(opened.status, 200);
  assert.equal(opened.type, 'text/event-stream');
  writeFileSync(join(s.root, 'valid.md'), readFileSync(join(s.root, 'valid.md'), 'utf8') + '\nMore.\n');
  const ms = await sse.next('changed', 1000);
  sse.close();
  assert.ok(ms < 1000);
});

test('R7.1: a change to an island module the page uses sends changed', async (t) => {
  const s = await site(t);
  assert.equal((await request(s.port, { path: '/valid.html', headers: { Cookie: s.cookie } })).status, 200);
  const sse = openEvents(s.port, s.cookie, 'valid.md', sha(readFileSync(join(s.root, 'valid.md'))));
  await sse.ready;
  writeFileSync(join(s.root, 'islands', 'tally.island.js'), readFileSync(join(s.root, 'islands', 'tally.island.js'), 'utf8') + '\n// touched\n');
  await sse.next('changed', 1000);
  sse.close();
});

test('R7.1: a change to an SVG the page inlines sends changed', async (t) => {
  const s = await site(t);
  assert.equal((await request(s.port, { path: '/figure.html', headers: { Cookie: s.cookie } })).status, 200);
  const sse = openEvents(s.port, s.cookie, 'figure.md', sha(readFileSync(join(s.root, 'figure.md'))));
  await sse.ready;
  writeFileSync(join(s.root, 'chart.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="9" height="9"/></svg>\n');
  await sse.next('changed', 1000);
  sse.close();
});

test('R1.5: a broken page reloads when the doc is fixed', async (t) => {
  const s = await site(t);
  breakDoc(s.root);
  assert.equal((await request(s.port, { path: '/broken.html', headers: { Cookie: s.cookie } })).status, 500);
  const sse = openEvents(s.port, s.cookie, 'broken.md', sha(readFileSync(join(s.root, 'broken.md'))));
  await sse.ready;
  writeFileSync(join(s.root, 'broken.md'), readFileSync(join(s.root, 'valid.md')));
  await sse.next('changed', 1000);
  sse.close();
  const fixed = await request(s.port, { path: '/broken.html', headers: { Cookie: s.cookie } });
  assert.equal(fixed.status, 200);
});

test('R7.1: a page whose .md already holds the written bytes gets no changed, any other page does', async (t) => {
  const s = await site(t);
  const file = join(s.root, 'valid.md');
  const before = readFileSync(file, 'utf8');
  const r = await request(s.port, { path: '/valid.html', headers: { Cookie: s.cookie } });
  // A save, as the editing page sends it. The saving page reloads itself on the 200, so its own write must not reload
  // it again; it is played here by a stream opened with the saved hash. Another tab still shows the old bytes.
  const saved = await save(s.port, s.cookie, { path: 'valid.md', range: [1, 1], hash: pageState(r.text).hash, text: '# Valid doc, saved' });
  assert.equal(saved.status, 200);
  const current = openEvents(s.port, s.cookie, 'valid.md', JSON.parse(saved.text).hash);
  const other = openEvents(s.port, s.cookie, 'valid.md', sha(before));
  await current.ready;
  await other.ready;
  await other.next('changed', 1000);
  // The same bytes written again: an event from the watcher, and no change to show.
  writeFileSync(file, readFileSync(file));
  await new Promise((r) => setTimeout(r, 500));
  assert.deepEqual(current.events, []);
  writeFileSync(file, before);
  await current.next('changed', 1000);
  current.close();
  other.close();
});

test('R7.1: /_events without the hash the page was rendered from gets 400', async (t) => {
  const s = await site(t);
  const r = await request(s.port, { path: '/_events?path=valid.md', headers: { Cookie: s.cookie } });
  assert.equal(r.status, 400);
  assert.match(r.text, /hash=\{the hash it was rendered from\}/);
});

test('decision 0038: a changed margent script sends outdated to open streams and to new ones; the same bytes send nothing', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'margent-self-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const self = join(dir, 'cli.js');
  writeFileSync(self, 'v1\n');
  const root = join(dir, 'docs');
  cpSync(FIXTURE, root, { recursive: true });
  const h = await startServer({ root, port: 0, self });
  t.after(() => h.close());
  const cookie = `margent-${h.port}=${h.token}`;
  const hashOf = () => sha(readFileSync(join(root, 'valid.md')));
  const sse = openEvents(h.port, cookie, 'valid.md', hashOf());
  t.after(() => sse.close());
  assert.equal((await sse.ready).status, 200);
  writeFileSync(self, 'v1\n');
  await new Promise((ok) => setTimeout(ok, 2500));
  assert.ok(!sse.events.includes('outdated'), 'same bytes must not send outdated');
  writeFileSync(self, 'v2\n');
  await sse.next('outdated', 5000);
  const late = openEvents(h.port, cookie, 'valid.md', hashOf());
  t.after(() => late.close());
  assert.equal((await late.ready).status, 200);
  await late.next('outdated', 1000);
});

test('decision 0038: a self script that cannot be read fails startup loudly, naming the file, with nothing left open', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'margent-self-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'docs');
  cpSync(FIXTURE, root, { recursive: true });
  await assert.rejects(startServer({ root, port: 0, self: join(dir, 'missing.js') }), /cannot read margent's own script .*missing\.js/);
});

// ---- the serve command

function runServe(args) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, [CLI, 'serve', ...args], { cwd: REPO, env: { ...process.env, BROWSER: 'true' } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('exit', (code, signal) => ok({ code, signal, stdout, stderr, child }));
  });
}

test('serve prints the serving line and runs until SIGTERM, then exits 0', async (t) => {
  const s = await site(t);
  const child = spawn(process.execPath, [CLI, 'serve', s.root, '--no-open', '--port', '0'], { cwd: REPO });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c) => (stdout += c));
  child.stderr.on('data', (c) => (stderr += c));
  const exited = new Promise((ok) => child.on('exit', (code, signal) => ok({ code, signal })));
  const started = Date.now();
  while (!/serving .* at http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{32}\n/.test(stdout)) {
    if (Date.now() - started > 10000) {
      child.kill('SIGKILL');
      assert.fail(`no serving line; stdout: ${stdout} stderr: ${stderr}`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  child.kill('SIGTERM');
  const { code } = await exited;
  assert.equal(code, 0, stderr);
});

test('serve with a port in use exits 1 and names the port', async (t) => {
  const blocker = net.createServer();
  await new Promise((ok) => blocker.listen(0, '127.0.0.1', ok));
  const port = blocker.address().port;
  try {
    const s = await site(t);
    const r = await runServe([s.root, '--no-open', '--port', String(port)]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, new RegExp(`port ${port} is in use`));
  } finally {
    blocker.close();
  }
});

test('serve with no folder, or a bad port, is a usage error and exits 2', async () => {
  for (const args of [['--no-open'], ['/tmp', '--port', 'abc', '--no-open'], ['/tmp', '--port', '70000']]) {
    const r = await runServe(args);
    assert.equal(r.code, 2, `serve ${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /usage:/);
  }
});
