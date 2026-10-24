// Server tests for comments (T5, spec R2.3, R5.6, acceptance A10 server half): the author in the page state and the open
// thread counts in the `/` index. Run after `npm run build`. Each test starts the real server in-process and closes it in
// t.after, since every server holds a recursive watcher.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { startServer } = await import('../.build/serve/server.js');

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMENT_ERRORS = join(REPO, 'test', 'fixtures', 'comments', 'errors');

const workdir = mkdtempSync(join(tmpdir(), 'margent-comments-serve-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));
let counter = 0;

const DOC = '# Doc\n\nA line of plain text.\n';

// A new docs root holding `files` (path under the root to text). Returns the root.
function makeRoot(files) {
  const root = join(workdir, `root-${counter++}`);
  mkdirSync(root, { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    if (text.startsWith('/')) copyFileSync(text, file);
    else writeFileSync(file, text);
  }
  return root;
}

// Starts the server on `root`, closed when the test ends. Returns the handle and the session cookie.
async function serve(t, root, opts = {}) {
  const h = await startServer({ root, port: 0, ...opts });
  t.after(() => h.close());
  return { h, port: h.port, cookie: `margent-${h.port}=${h.token}` };
}

// One GET with the session cookie and the server's own Host.
function get(s, path) {
  return new Promise((ok, fail) => {
    const req = http.get(
      { host: '127.0.0.1', port: s.port, path, headers: { Host: `127.0.0.1:${s.port}`, Cookie: s.cookie } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => ok({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', fail);
      }
    );
    req.on('error', fail);
  });
}

// The author and other fields of the page's #margent-state JSON.
async function pageState(s, page) {
  const r = await get(s, `/${page}`);
  assert.equal(r.status, 200, r.text);
  const m = /<script type="application\/json" id="margent-state">(.*?)<\/script>/s.exec(r.text);
  assert.ok(m, 'the page carries its edit state');
  return JSON.parse(m[1]);
}

function git(root, args, env = process.env) {
  return execFileSync('git', args, { cwd: root, env, stdio: 'ignore' });
}

// Sets env vars for the test and restores them after it, so git reads no user, global or system config.
function isolateGit(t) {
  const home = mkdtempSync(join(workdir, 'home-'));
  const saved = { HOME: process.env.HOME, GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
  process.env.HOME = home;
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('A10: --author sets the author in the page state', async (t) => {
  const s = await serve(t, makeRoot({ 'doc.md': DOC }), { author: 'Ada' });
  assert.equal(s.h.author, 'Ada');
  assert.equal((await pageState(s, 'doc.html')).author, 'Ada');
});

test('A10: with no --author, the author is git config user.name in the served root', async (t) => {
  isolateGit(t);
  const root = makeRoot({ 'doc.md': DOC });
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Temp User']);
  const s = await serve(t, root);
  assert.equal(s.h.author, 'Temp User');
  assert.equal((await pageState(s, 'doc.html')).author, 'Temp User');
});

test('A10: with no --author and no git user.name, the author is null and the log says how to set one', async (t) => {
  isolateGit(t);
  const root = makeRoot({ 'doc.md': DOC });
  git(root, ['init', '-q']);
  const written = [];
  const writeOrig = process.stderr.write;
  process.stderr.write = (chunk, ...rest) => {
    written.push(String(chunk));
    return writeOrig.call(process.stderr, chunk, ...rest);
  };
  let s;
  try {
    s = await serve(t, root);
  } finally {
    process.stderr.write = writeOrig;
  }
  assert.equal(s.h.author, null);
  assert.equal((await pageState(s, 'doc.html')).author, null);
  const log = written.join('');
  assert.match(log, /no author is configured \(git config user\.name is not set\)/);
  assert.match(log, /serve --author \{name\}/);
  assert.match(log, /git config user\.name \{name\}/);
});

test('A10: an unusable --author is a startup error that names the problem', async () => {
  const root = makeRoot({ 'doc.md': DOC });
  await assert.rejects(startServer({ root, port: 0, author: 'a:b' }), /--author "a:b" is not usable: the name has ":"/);
  await assert.rejects(startServer({ root, port: 0, author: 'a]b' }), /--author "a\]b" is not usable/);
  await assert.rejects(startServer({ root, port: 0, author: '  ' }), /--author "  " is not usable: the name is empty/);
});

test('R2.3: the index shows each doc\'s open thread count, and no count for a doc with none', async (t) => {
  const root = makeRoot({
    'two.md': '# Two\n\nA {==one==}{>>[c1] Ada: first<<} and {==two==}{>>[c2] Ada: second<<}.\n',
    'none.md': DOC,
  });
  const s = await serve(t, root);
  const index = (await get(s, '/')).text;
  assert.equal(index.match(/<span class="fact">2 open<\/span>/g)?.length, 1);
  const none = /<li><a href="none\.html">[\s\S]*?<\/li>/.exec(index)?.[0];
  assert.ok(none, 'the doc with no threads is listed');
  assert.doesNotMatch(none, /open/);
});

test('R2.3: a doc with malformed comment markup is listed with its file and line error', async (t) => {
  const root = makeRoot({ 'bad-head.md': join(COMMENT_ERRORS, 'bad-head.md') });
  const s = await serve(t, root);
  const index = (await get(s, '/')).text;
  const entry = /<li><a href="bad-head\.html">[\s\S]*?<\/li>/.exec(index)?.[0];
  assert.ok(entry, 'the doc that fails to render is still listed');
  assert.match(entry, /<p class="entry-error"><code>[^<]*bad-head\.md:\d+: /);
  assert.doesNotMatch(entry, /open/);
});
