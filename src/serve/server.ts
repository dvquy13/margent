// HTTP server for `margent serve` (spec R1, R2, R6.1, R6.6, R7.1). Pages are rendered in memory per request, saves
// splice one block into the file, and a file watcher (watch.ts) tells open pages when a file they use has changed.
import editJs from '../../.build/runtime/edit.js?raw';
import editCss from '../../runtime/edit/edit.css?raw';
import shellCss from '../../shell/shell.css?raw';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync, realpathSync, statSync, unwatchFile, watchFile } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { RenderError } from '../errors.js';
import { renderDoc } from '../render/page.js';
import { pagePolicy } from '../render/policy.js';
import { findDocsRoot } from '../render/root.js';
import { indexPage } from './index-page.js';
import { hash, splice, validate, writeAtomic } from './splice.js';
import { resolveAuthor } from './author.js';
import { watchTree } from './watch.js';

// The edit runtime, inlined into every page the server renders. Imported here so the bundle is wired end to end.
export const EDIT_RUNTIME = { js: editJs, css: editCss };

export interface ServeOptions {
  root: string; // absolute docs root
  port?: number; // 0 or undefined picks a free port
  // `serve --author`. Absent, the author comes from `git config user.name` in root, else the OS user (see resolveAuthor).
  author?: string;
  // The file the running margent was loaded from. When its bytes change, open pages are told the server is out of
  // date. Absent, nothing is watched.
  self?: string;
}

export interface ServeHandle {
  url: string;
  port: number;
  token: string; // the value of the ?token= that sets the cookie (spec R2)
  author: string | null; // the name new notes are signed with; null refuses notes (spec R5.6)
  close(): Promise<void>;
}

const MAX_BODY_BYTES = 5 * 1024 * 1024; // spec R6.1
const DEBOUNCE_MS = 50; // spec R7.1

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  md: 'text/plain; charset=utf-8',
};

interface SaveBody {
  path: string;
  range: [number, number];
  hash: string;
  text: string;
}

class BodyTooLarge extends Error {}

// True when `target` is `dir` or inside it. Both are absolute paths, compared lexically.
function within(dir: string, target: string): boolean {
  const rel = relative(dir, target);
  return rel === '' || (rel.split(sep)[0] !== '..' && !isAbsolute(rel));
}

// The real path of a file under the real root, or null when it is missing, a folder, or a link out of the root.
function realFileUnder(rootReal: string, path: string): string | null {
  let real: string;
  try {
    real = realpathSync(path);
  } catch (err) {
    // Missing is the normal 404. Any other failure (permissions, I/O) is an error and is raised.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ENOTDIR') return null;
    throw err;
  }
  if (!within(rootReal, real) || !statSync(real).isFile()) return null;
  return real;
}

// The path segments of a raw URL path. Null when a segment would step out of the root: `.`, `..`, or a segment that
// decodes to hold a separator (`..%2Foutside`), a backslash or a NUL.
function safeSegments(rawPath: string): string[] | null {
  const segments = rawPath.slice(1).split('/').map((s) => decodeURIComponent(s));
  for (const s of segments) {
    if (s === '.' || s === '..' || /[/\\\0]/.test(s)) return null;
  }
  return segments;
}

function linesIn(text: string): number {
  const t = text.replace(/\r\n/g, '\n').replace(/\n$/, '');
  return t === '' ? 0 : t.split('\n').length;
}

function send(
  res: ServerResponse,
  status: number,
  type: string,
  body: string,
  extra: Record<string, string> = {}
): void {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}

function sendText(res: ServerResponse, status: number, text: string): void {
  send(res, status, 'text/plain; charset=utf-8', `${text}\n`);
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(value));
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The script of the error page (spec R1.5). It reloads the page when the doc changes, so a fix brings the page back with
// no manual reload. Its text is both the element's content and the input of the page's script hash (M5 R4.1).
function errorScript(path: string, mdHash: string): string {
  // The path is JSON in a script. "<" is escaped, so nothing in it can close the element.
  const pathJs = JSON.stringify(path).replace(/</g, '\\u003c');
  return `
(function () {
  var es = new EventSource('/_events?path=' + encodeURIComponent(${pathJs}) + '&hash=${mdHash}');
  es.addEventListener('changed', function () { location.reload(); });
})();
`;
}

// The page shown in place of a doc that failed to render (spec R1.5), with the policy that sends it as a header.
function errorPage(path: string, mdHash: string, messages: string[]): { html: string; policy: string } {
  const items = messages.map((m) => `<li><code>${escapeHtml(m)}</code></li>`).join('');
  const script = errorScript(path, mdHash);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Render error: ${escapeHtml(path)}</title>
<style>
${shellCss}
.render-errors code { font-family: var(--mono); font-size: var(--font-sm); white-space: pre-wrap; color: var(--red); }
.render-errors li { margin: var(--gap-sm) 0; }
</style>
</head>
<body>
<header class="top"><div class="wrap"><a class="wordmark" href="/">margent</a><span class="top-meta">render error</span></div></header>
<main class="wrap">
<h1>${escapeHtml(path)} did not render</h1>
<p>Fix the file and this page comes back. It reloads when the file changes.</p>
<ul class="render-errors">${items}</ul>
</main>
<script>${script}</script>
</body>
</html>
`;
  return { html, policy: pagePolicy([script], 'serve') };
}

// The request body, up to the limit (spec R6.1). Past the limit the body is abandoned and BodyTooLarge is thrown.
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.pause();
        fail(new BodyTooLarge(`body is larger than ${MAX_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

// Shape errors of a save body (spec R6.1). An empty list means the body has the right shape.
function saveShapeErrors(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return ['body must be a JSON object'];
  const o = body as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof o.path !== 'string') errors.push('path must be a string');
  const range = o.range;
  if (
    !Array.isArray(range) ||
    range.length !== 2 ||
    !range.every((n) => Number.isInteger(n)) ||
    (range[0] as number) < 1 ||
    (range[1] as number) < (range[0] as number)
  ) {
    errors.push('range must be [start, end] with 1 <= start <= end');
  }
  if (typeof o.hash !== 'string' || !/^[0-9a-f]{64}$/.test(o.hash)) errors.push('hash must be a 64-character hex SHA-256');
  if (typeof o.text !== 'string') errors.push('text must be a string');
  return errors;
}

// The hash of margent's own script as it is on disk now (decision 0038). A failure names the file and is never swallowed.
function hashSelf(file: string): string {
  try {
    return hash(readFileSync(file));
  } catch (err) {
    throw new Error(`cannot read margent's own script ${file}: ${(err as Error).message}`, { cause: err });
  }
}

// Starts the server. Resolves once it listens on 127.0.0.1. A port in use rejects with the port in the message.
export async function startServer(opts: ServeOptions): Promise<ServeHandle> {
  const root = resolve(opts.root);
  const rootReal = realpathSync(root);
  const requestedPort = opts.port ?? 0;
  const token = randomBytes(16).toString('hex');
  const { author, source: authorSource, reason: authorReason } = resolveAuthor(opts.author, root);
  // Read before any watcher starts, so a failure here leaves nothing open.
  const self = opts.self;
  const selfHash = self === undefined ? '' : hashSelf(self);

  // Per page path (posix, relative to the root): the files it depends on, and its open SSE clients, each with the hash
  // of the .md its page was rendered from.
  const deps = new Map<string, string[]>();
  const clients = new Map<string, Map<ServerResponse, string>>();
  const timers = new Map<string, NodeJS.Timeout>();
  // Pages with a pending change to a dep other than their own .md, or to a folder that holds one.
  const otherChanged = new Set<string>();
  let port = 0;
  let cookieName = '';

  const log = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };
  const logError = (line: string): void => {
    process.stderr.write(`margent serve: ${line}\n`);
  };
  if (author === null) {
    logError(
      `no author is configured (${authorReason}); the page refuses notes until one is set: serve --author {name}, or git config user.name {name}`
    );
  } else if (authorSource === 'os') {
    log(`notes are signed "${author}", the OS user name (${authorReason}); to change it: serve --author {name}, or git config user.name {name}`);
  }
  // Every refused request is logged and answered, so a 403 never happens silently.
  const deny = (req: IncomingMessage, res: ServerResponse, reason: string): void => {
    logError(`refused ${req.method} ${req.url}: ${reason}`);
    sendText(res, 403, `403 forbidden: ${reason}`);
  };

  const tokenMatches = (given: string): boolean => {
    const a = Buffer.from(given);
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  const hasCookie = (req: IncomingMessage): boolean => {
    const header = req.headers.cookie ?? '';
    for (const part of header.split(';')) {
      const eq = part.indexOf('=');
      if (eq === -1 || part.slice(0, eq).trim() !== cookieName) continue;
      if (tokenMatches(part.slice(eq + 1).trim())) return true;
    }
    return false;
  };

  // ---- live reload (spec R7.1)

  // The hash of a page's .md as it is on disk now; '' when it is gone or outside the root, which no rendered page has.
  const mdHashNow = (page: string): string => {
    const real = realFileUnder(rootReal, join(root, page));
    return real === null ? '' : hash(readFileSync(real));
  };

  // A client is told to reload unless the only change is to the .md and its page already shows those bytes. That
  // skips the event a save's own write causes, since the saving page reloads itself on the 200.
  const notify = (page: string): void => {
    const other = otherChanged.delete(page);
    const current = mdHashNow(page);
    for (const [res, rendered] of clients.get(page) ?? []) {
      if (other || rendered !== current) res.write('event: changed\ndata: {}\n\n');
    }
  };

  const schedule = (page: string, other: boolean): void => {
    if (!clients.has(page)) return;
    if (other) otherChanged.add(page);
    const pending = timers.get(page);
    if (pending) clearTimeout(pending);
    timers.set(
      page,
      setTimeout(() => {
        timers.delete(page);
        notify(page);
      }, DEBOUNCE_MS)
    );
  };

  const onFileEvent = (filename: string | null): void => {
    // Some platforms do not report the name, and a burst of changes can be reported as its folder (macOS FSEvents).
    // Either way every page with a dep at or under the reported path is told to reload. That may over-notify, never miss.
    const abs = filename === null ? root : join(root, filename);
    for (const [page, files] of deps) {
      if (files.some((file) => file === abs || within(abs, file))) schedule(page, abs !== join(root, page));
    }
  };

  const watcher = watchTree(root, onFileEvent, (err) => logError(`watcher error: ${err.message}`));

  // ---- out of date: margent itself changed on disk (decision 0038)

  // The modules this server runs were loaded at startup. When the file they came from changes, the server is out of
  // date: every open page is told, and so is each page opened after that.
  const outdatedEvent = 'event: outdated\ndata: {}\n\n';
  let outdated = false;
  if (self !== undefined) {
    watchFile(self, { interval: 1000 }, (cur) => {
      if (outdated || cur.mtimeMs === 0) return; // gone mid-install: the next change brings it back
      let now: string;
      try {
        now = hash(readFileSync(self));
      } catch {
        return; // vanished between the stat and the read: the next poll retries
      }
      if (now === selfHash) return; // same bytes (a reinstall, a touch)
      outdated = true;
      logError(`margent changed on disk since this server started (${self}); restart margent serve to use the new version`);
      for (const set of clients.values()) for (const res of set.keys()) res.write(outdatedEvent);
    });
  }

  // ---- pages

  // The docs root of a page: the nearest islands/ folder from the page up to the served root, else the served root.
  const docsRootFor = (file: string): string => findDocsRoot(file, root);

  const servePage = (res: ServerResponse, mdRel: string): void => {
    const file = join(root, mdRel);
    const bytes = readFileSync(file);
    const source = bytes.toString('utf8');
    try {
      const rendered = renderDoc({
        file,
        source,
        root: docsRootFor(file),
        outFile: join(root, mdRel.replace(/\.md$/, '.html')),
        edit: { state: { path: mdRel, hash: hash(bytes), source, author }, js: EDIT_RUNTIME.js, css: EDIT_RUNTIME.css },
      });
      deps.set(mdRel, rendered.deps);
      send(res, 200, 'text/html; charset=utf-8', rendered.html, { 'Content-Security-Policy': rendered.policy });
    } catch (err) {
      if (!(err instanceof RenderError)) throw err;
      deps.set(mdRel, [file]);
      logError(`render error: ${err.message}`);
      const page = errorPage(mdRel, hash(bytes), [err.message]);
      send(res, 500, 'text/html; charset=utf-8', page.html, { 'Content-Security-Policy': page.policy });
    }
  };

  const serveAsset = (res: ServerResponse, segments: string[]): void => {
    const file = join(root, ...segments);
    const real = realFileUnder(rootReal, file);
    if (real === null) {
      sendText(res, 404, `404 not found: /${segments.join('/')}`);
      return;
    }
    const type = TYPES[extname(real).slice(1).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(readFileSync(real));
  };

  // ---- save (spec R6)

  const refuse = (path: string, start: number, end: number, reasons: string[]): void => {
    for (const reason of reasons) log(`refused ${path} lines ${start}-${end}: ${reason}`);
  };

  const handleSave = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let raw: string;
    try {
      raw = await readBody(req);
    } catch (err) {
      if (!(err instanceof BodyTooLarge)) throw err;
      log(`refused save: ${err.message}`);
      res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
      res.end(`413 payload too large: ${err.message}\n`, () => req.socket.destroy());
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const errors = [`body is not valid JSON: ${(err as Error).message}`];
      log(`refused save: ${errors[0]}`);
      sendJson(res, 400, { errors });
      return;
    }
    const shape = saveShapeErrors(parsed);
    if (shape.length > 0) {
      for (const e of shape) log(`refused save: ${e}`);
      sendJson(res, 400, { errors: shape });
      return;
    }
    const body = parsed as SaveBody;
    const [start, end] = body.range;

    const file = resolve(root, body.path);
    const exists = body.path.endsWith('.md') && within(root, file) && realFileUnder(rootReal, file) !== null;
    if (!exists) {
      log(`refused ${body.path} lines ${start}-${end}: no such doc under the served root`);
      sendJson(res, 404, { error: `no such doc: ${body.path}` });
      return;
    }

    const bytes = readFileSync(file);
    const current = hash(bytes);
    if (current !== body.hash) {
      refuse(body.path, start, end, ['stale']);
      sendJson(res, 409, { error: 'stale', hash: current });
      return;
    }

    let next: string;
    try {
      next = splice(bytes.toString('utf8'), [start, end], body.text);
    } catch (err) {
      const message = (err as Error).message;
      refuse(body.path, start, end, [message]);
      sendJson(res, 400, { errors: [message] });
      return;
    }

    const errors = validate(file, docsRootFor(file), next).map((e) => e.message);
    if (errors.length > 0) {
      refuse(body.path, start, end, errors);
      sendJson(res, 422, { errors });
      return;
    }

    writeAtomic(file, next);
    const old = end - start + 1;
    log(`saved ${body.path} lines ${start}-${end} (${old} → ${linesIn(body.text)} lines)`);
    sendJson(res, 200, { hash: hash(next) });
  };

  // ---- events (spec R7.1)

  const openEvents = (res: ServerResponse, page: string | null, rendered: string | null): void => {
    if (page === null || !page.endsWith('.md') || rendered === null) {
      sendText(res, 400, '400 bad request: /_events needs ?path={the page\'s .md path}&hash={the hash it was rendered from}');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write(': ok\n\n');
    const set = clients.get(page) ?? new Map<ServerResponse, string>();
    set.set(res, rendered);
    clients.set(page, set);
    // A write between the page's render and this stream would otherwise never reach it.
    if (rendered !== mdHashNow(page)) res.write('event: changed\ndata: {}\n\n');
    // A page opened after the change still learns of it.
    if (outdated) res.write(outdatedEvent);
    // The response closes when the client goes away. The request's own 'close' fires once its body is read, which for
    // a GET is at once, so it cannot end the stream.
    res.on('close', () => {
      const current = clients.get(page);
      current?.delete(res);
      if (current?.size === 0) clients.delete(page);
    });
  };

  // ---- routing (spec R2)

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // 1. Host: blocks DNS rebinding.
    const host = req.headers.host;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      return deny(req, res, `Host header must be 127.0.0.1:${port} or localhost:${port}`);
    }
    // 2. Origin: a POST from another site is refused, even with a cookie.
    const origin = req.headers.origin;
    if (
      req.method === 'POST' &&
      origin !== undefined &&
      origin !== `http://127.0.0.1:${port}` &&
      origin !== `http://localhost:${port}`
    ) {
      return deny(req, res, 'POST Origin must be this server');
    }

    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    // The raw path, not url.pathname: WHATWG URL resolves "%2e%2e" and "..", which would hide a traversal attempt.
    const rawPath = (req.url ?? '/').split('?')[0];

    // 3. Token: sets the cookie and redirects to the same path without the query.
    if (url.searchParams.has('token')) {
      if (!tokenMatches(url.searchParams.get('token') ?? '')) {
        return deny(req, res, 'the token in the URL is not valid');
      }
      res.writeHead(302, {
        Location: rawPath,
        'Set-Cookie': `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`,
        'Cache-Control': 'no-store',
      });
      res.end();
      return;
    }

    // 4. Cookie: every route needs it, reads included.
    if (!hasCookie(req)) {
      return deny(req, res, 'no session cookie; open the URL that margent serve printed');
    }

    if (rawPath === '/') {
      if (req.method !== 'GET') return sendText(res, 405, '405 method not allowed: GET only');
      // The index has no script, so its policy lists none (M5 R4.1).
      return send(res, 200, 'text/html; charset=utf-8', indexPage(root), {
        'Content-Security-Policy': pagePolicy([], 'serve'),
      });
    }

    if (rawPath === '/_events') {
      if (req.method !== 'GET') return sendText(res, 405, '405 method not allowed: GET only');
      return openEvents(res, url.searchParams.get('path'), url.searchParams.get('hash'));
    }

    if (rawPath === '/_save') {
      if (req.method !== 'POST') return sendText(res, 405, '405 method not allowed: POST only');
      return handleSave(req, res);
    }

    if (req.method !== 'GET') return sendText(res, 405, '405 method not allowed: GET only');

    let segments: string[] | null;
    try {
      segments = safeSegments(rawPath);
    } catch {
      return sendText(res, 400, '400 bad request: the URL path is not valid percent-encoding');
    }
    // A dot segment (`.env`, `.git/config`, `sub/.hidden.md`) is never served, a page included (M5 R4.2).
    if (segments === null || segments.length === 0 || segments.some((s) => s.startsWith('.'))) {
      return sendText(res, 404, `404 not found: ${rawPath}`);
    }

    // {path}.html is a page when {path}.md exists under the root. Any other path is a file under the root.
    const last = segments[segments.length - 1];
    if (last.endsWith('.html')) {
      const mdRel = [...segments.slice(0, -1), `${last.slice(0, -'.html'.length)}.md`].join('/');
      if (realFileUnder(rootReal, join(root, mdRel)) !== null) return servePage(res, mdRel);
    }
    return serveAsset(res, segments);
  };

  const server: Server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logError(`${req.method} ${req.url}: ${message}`);
      if (res.headersSent) res.end();
      else sendText(res, 500, `500 internal error: ${message}`);
    });
  });

  // Listens before the handle exists, so a port in use rejects here (spec R1.1, no retry on another port).
  await new Promise<void>((ok, fail) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      watcher.close();
      if (self !== undefined) unwatchFile(self);
      fail(err.code === 'EADDRINUSE' ? new Error(`port ${requestedPort} is in use`) : err);
    };
    server.once('error', onError);
    server.listen(requestedPort, '127.0.0.1', () => {
      server.off('error', onError);
      ok();
    });
  });
  server.on('error', (err) => logError(`server error: ${err.message}`));

  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind a TCP port');
  port = address.port;
  cookieName = `margent-${port}`;

  return {
    url: `http://127.0.0.1:${port}/?token=${token}`,
    port,
    token,
    author,
    close: () =>
      new Promise<void>((ok, fail) => {
        for (const pending of timers.values()) clearTimeout(pending);
        timers.clear();
        watcher.close();
        if (self !== undefined) unwatchFile(self);
        for (const set of clients.values()) for (const res of set.keys()) res.end();
        clients.clear();
        server.close((err) => (err ? fail(err) : ok()));
        server.closeAllConnections();
      }),
  };
}
