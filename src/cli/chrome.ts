// Headless Chrome for `margent check` (spec R4). Speaks the DevTools Protocol over --remote-debugging-pipe:
// Chrome reads commands on fd 3 and writes responses and events on fd 4; each JSON message ends with a NUL byte.
// No dependencies: this file is the whole browser driver, bundled into dist/cli.js.
import { spawn, type ChildProcess } from 'node:child_process';
import { accessSync, constants, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { Readable, Writable } from 'node:stream';

export const PAGE_TIMEOUT_MS = 10_000;

const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PATH_NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function onPath(name: string, env: NodeJS.ProcessEnv): string | null {
  for (const dir of (env.PATH ?? '').split(delimiter)) {
    if (dir === '') continue;
    const candidate = join(dir, name);
    if (isExecutable(candidate)) return candidate;
  }
  return null;
}

// MARGENT_CHROME wins and must exist: a bad override fails instead of silently using another browser.
export function findChrome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.MARGENT_CHROME;
  if (override) {
    if (isExecutable(override)) return override;
    throw new Error(`MARGENT_CHROME is set to "${override}", which is not an executable file`);
  }
  if (isExecutable(MAC_CHROME)) return MAC_CHROME;
  for (const name of PATH_NAMES) {
    const found = onPath(name, env);
    if (found) return found;
  }
  throw new Error(
    `headless Chrome is needed to check islands, but none was found (looked at "${MAC_CHROME}" and ` +
      `${PATH_NAMES.join(', ')} on PATH). Install Google Chrome, or set MARGENT_CHROME to the browser binary.`
  );
}

type EventHandler = (method: string, params: any, sessionId: string | undefined) => void;

interface Pending {
  method: string;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

// Request/response and event dispatch over the pipe pair. Any pipe failure rejects everything still waiting.
class Cdp {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly handlers = new Set<EventHandler>();
  private buffer: Buffer = Buffer.alloc(0);
  private failure: Error | null = null;

  constructor(
    private readonly out: Writable,
    input: Readable
  ) {
    input.on('data', (chunk: Buffer) => this.onData(chunk));
    input.on('end', () => this.fail(new Error('Chrome closed the DevTools pipe')));
    input.on('error', (err) => this.fail(err));
    out.on('error', (err) => this.fail(err));
  }

  fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear();
    this.handlers.clear();
  }

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // Resolves with the next `method` event for the session. Rejects after timeoutMs.
  nextEvent(method: string, sessionId: string, timeoutMs: number, timeoutMessage: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let stop: () => void = () => {};
      const timer = setTimeout(() => {
        stop();
        reject(new Error(timeoutMessage));
      }, timeoutMs);
      stop = this.onEvent((m, _params, sid) => {
        if (m !== method || sid !== sessionId) return;
        clearTimeout(timer);
        stop();
        resolve();
      });
    });
  }

  send(method: string, params: object, sessionId?: string, timeoutMs = PAGE_TIMEOUT_MS): Promise<any> {
    if (this.failure) return Promise.reject(this.failure);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Chrome did not answer ${method} within ${timeoutMs / 1000}s`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      const message = sessionId === undefined ? { id, method, params } : { id, method, params, sessionId };
      this.out.write(`${JSON.stringify(message)}\0`);
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (let end = this.buffer.indexOf(0); end >= 0; end = this.buffer.indexOf(0)) {
      const text = this.buffer.subarray(0, end).toString('utf8');
      this.buffer = this.buffer.subarray(end + 1);
      if (text !== '') this.dispatch(JSON.parse(text));
    }
  }

  private dispatch(msg: {
    id?: number;
    method?: string;
    params?: any;
    sessionId?: string;
    error?: { message: string };
    result?: any;
  }): void {
    if (msg.id !== undefined) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(`${pending.method} failed: ${msg.error.message}`));
      else pending.resolve(msg.result ?? {});
      return;
    }
    if (msg.method) {
      for (const handler of [...this.handlers]) handler(msg.method, msg.params, msg.sessionId);
    }
  }
}

// One Chrome for the whole run, with one tab that navigates from page to page.
export class ChromeSession {
  private readonly exceptions: string[] = [];
  private readonly cdp: Cdp;
  private readonly child: ChildProcess;
  private readonly profile: string;
  private readonly exited: Promise<void>;
  private readonly stderrTail = { text: '' };
  private sessionId = '';

  constructor(child: ChildProcess, profile: string) {
    this.child = child;
    this.profile = profile;
    const write = child.stdio[3] as Writable | null;
    const read = child.stdio[4] as Readable | null;
    if (!write || !read) throw new Error('could not open the DevTools pipes to Chrome');
    this.cdp = new Cdp(write, read);
    // Spawn failures emit 'error' and no 'exit', so either one ends the wait.
    this.exited = new Promise((resolve) => {
      child.once('exit', () => resolve());
      child.once('error', () => resolve());
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderrTail.text = (this.stderrTail.text + chunk.toString('utf8')).slice(-1500);
    });
    child.once('error', (err) => this.cdp.fail(new Error(`could not start Chrome: ${err.message}`)));
    child.once('exit', (code, signal) => {
      const tail = this.stderrTail.text.trim();
      this.cdp.fail(
        new Error(`Chrome exited (${code ?? signal}) while margent was using it${tail ? `:\n${tail}` : ''}`)
      );
    });
    this.cdp.onEvent((method, params, sessionId) => {
      if (method === 'Runtime.exceptionThrown' && sessionId === this.sessionId) {
        this.exceptions.push(describeException(params.exceptionDetails));
      }
    });
  }

  async start(): Promise<void> {
    await this.cdp.send('Browser.getVersion', {});
    const { targetId } = await this.cdp.send('Target.createTarget', { url: 'about:blank' });
    const attached = await this.cdp.send('Target.attachToTarget', { targetId, flatten: true });
    this.sessionId = attached.sessionId;
    await this.cdp.send('Page.enable', {}, this.sessionId);
    await this.cdp.send('Runtime.enable', {}, this.sessionId);
  }

  // Sets the viewport of the tab. Width and height are CSS pixels; scale is 1 and the page is not mobile-emulated.
  async setViewport(width: number, height: number): Promise<void> {
    await this.cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: false },
      this.sessionId
    );
  }

  // Navigates the tab to url and waits for its load event. Uncaught exceptions are collected from here on.
  async navigate(url: string): Promise<void> {
    this.exceptions.length = 0;
    const loaded = this.cdp.nextEvent(
      'Page.loadEventFired',
      this.sessionId,
      PAGE_TIMEOUT_MS,
      `${url} did not finish loading within ${PAGE_TIMEOUT_MS / 1000}s`
    );
    loaded.catch(() => {}); // if navigation fails, that error is thrown below and this timeout is moot
    const nav = await this.cdp.send('Page.navigate', { url }, this.sessionId);
    if (nav.errorText) throw new Error(`Chrome could not open ${url}: ${nav.errorText}`);
    await loaded;
  }

  // Evaluates an expression in the current page and returns its value by value. With awaitPromise, a promise is awaited.
  // timeoutMs bounds the call (default PAGE_TIMEOUT_MS); a longer-running page call passes its own bound.
  async evaluate(expression: string, awaitPromise = false, timeoutMs = PAGE_TIMEOUT_MS): Promise<unknown> {
    const result = await this.cdp.send(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise },
      this.sessionId,
      timeoutMs
    );
    if (result.exceptionDetails) {
      throw new Error(`evaluating the island check failed: ${describeException(result.exceptionDetails)}`);
    }
    return result.result.value;
  }

  // The first line of each uncaught exception since the last navigate().
  pageExceptions(): string[] {
    return [...this.exceptions];
  }

  // Stops Chrome and removes its profile. Chrome gets a short chance to close, then SIGKILL.
  async close(): Promise<void> {
    try {
      await this.cdp.send('Browser.close', {}, undefined, 2000);
    } catch {
      // Chrome is already gone or not answering; the kill below covers it.
    }
    if (this.child.exitCode === null && this.child.signalCode === null) {
      const stopped = await Promise.race([this.exited.then(() => true), delay(3000).then(() => false)]);
      if (!stopped) this.child.kill('SIGKILL');
    }
    await this.exited;
    rmSync(this.profile, { recursive: true, force: true, maxRetries: 3 });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref());
}

function describeException(details: any): string {
  const text: string = details?.exception?.description ?? details?.text ?? 'unknown exception';
  return text.split('\n')[0];
}

// Starts one headless Chrome. The caller must call close() in a finally block.
export async function launchChrome(env: NodeJS.ProcessEnv = process.env): Promise<ChromeSession> {
  const binary = findChrome(env);
  const profile = mkdtempSync(join(tmpdir(), 'margent-chrome-'));
  const child = spawn(
    binary,
    [
      '--headless=new',
      '--remote-debugging-pipe',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      `--user-data-dir=${profile}`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] }
  );
  const session = new ChromeSession(child, profile);
  try {
    await session.start();
  } catch (err) {
    await session.close();
    throw err;
  }
  return session;
}
