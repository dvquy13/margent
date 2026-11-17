// Captures the demo's browser clips from the real `margent serve` on a copy of sample-docs.
// Each clip is a CDP screencast: public/capture/{clip}/{n}.jpg, plus frames.json (time of each frame and of each mouse
// event, in seconds from the clip's start). Remotion plays them back (src/ScreencastClip.tsx).
// Needs `npm run build` in the repo first (it runs dist/cli.js) and the network for the page's Google Fonts.
// playwright-core comes from the repo's own node_modules (a devDependency there), not from demo/package.json.
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const OUT = join(here, 'public', 'capture');
// 1:1 with the video: headless screencast frames come at 1x whatever the device scale, so the page is never scaled.
// The video draws a 40px browser bar above it (src/BrowserBar.tsx).
const VIEWPORT = { width: 1280, height: 680 };
// Note stamps read the page clock, so the captured `.md` never depends on the day the demo was made.
const PINNED_NOW = '2026-11-14T09:30:00Z';

const only = process.argv.slice(2);
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// Starts `margent serve` on root and resolves with { url, stop } once it prints its serving line.
function serve(root) {
  const child = spawn(process.execPath, [join(repo, 'dist', 'cli.js'), 'serve', root, '--no-open', '--author', 'Quy'], {
    env: { ...process.env, MARGENT_HOME: join(here, 'no-margent-home'), BROWSER: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (d) => (err += d));
  const stop = () => new Promise((done) => {
    if (child.exitCode !== null) return done();
    child.once('exit', done);
    child.kill('SIGTERM');
  });
  return new Promise((ok, fail) => {
    let out = '';
    child.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/^margent serving (.+) at (\S+)$/m);
      if (m) ok({ line: m[0], url: m[2], stop });
    });
    child.once('exit', (code) => fail(new Error(`margent serve exited with ${code} before serving:\n${out}${err}`)));
  });
}

// One clip: a fresh page, a screencast while `script` runs, and a log of mouse events for the cursor overlay.
async function clip(browser, name, start, script, { now: clockAt = PINNED_NOW } = {}) {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: 'light' });
  await context.clock.setFixedTime(new Date(clockAt));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await start(page);
  const cdp = await context.newCDPSession(page);
  const frames = [];
  const mouse = [];
  let t0 = null;
  const pending = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    if (t0 === null) t0 = metadata.timestamp;
    const file = `${frames.length}.jpg`;
    frames.push({ t: metadata.timestamp - t0, file });
    writeFileSync(join(dir, file), Buffer.from(data, 'base64'));
    pending.push(cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}));
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  while (t0 === null) await wait(20);
  const clockStart = Date.now();
  const now = () => (Date.now() - clockStart) / 1000;
  let pos = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
  // A mouse that logs where it goes. Moves are eased in small steps so the overlay cursor can follow them.
  const m = {
    async move(x, y, ms = 600) {
      const steps = Math.max(2, Math.round(ms / 16));
      const from = pos;
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        pos = { x: from.x + (x - from.x) * e, y: from.y + (y - from.y) * e };
        await page.mouse.move(pos.x, pos.y);
        mouse.push({ t: now(), x: pos.x, y: pos.y, type: 'move' });
        await wait(ms / steps);
      }
    },
    async down() { mouse.push({ t: now(), ...pos, type: 'down' }); await page.mouse.down(); },
    async up() { mouse.push({ t: now(), ...pos, type: 'up' }); await page.mouse.up(); },
    async click(x, y, ms) { await m.move(x, y, ms); await m.down(); await wait(60); await m.up(); },
  };
  // Mouse and screencast times share one origin: the first frame arrived just before clockStart.
  mouse.push({ t: 0, ...pos, type: 'move' });
  await script({ page, m, wait, now });
  await wait(400);
  await cdp.send('Page.stopScreencast');
  await Promise.all(pending);
  const duration = now();
  writeFileSync(join(dir, 'frames.json'), JSON.stringify({ name, width: VIEWPORT.width, height: VIEWPORT.height, duration, frames, mouse, errors }, null, 1));
  await context.close();
  console.log(`${name}: ${frames.length} frames, ${duration.toFixed(1)}s${errors.length ? `, page errors: ${errors.join('; ')}` : ''}`);
  return { errors };
}

// The center of the first element matching `selector`, in page coordinates.
async function center(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`not on the page: ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// The point at character `index` of the first text node holding `text` (at its left edge, or the right edge past the end).
function pointAt(page, text, index) {
  return page.evaluate(([text, index]) => {
    const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT);
    for (let node; (node = walker.nextNode()); ) {
      const i = node.data.indexOf(text);
      if (i < 0) continue;
      const r = document.createRange();
      const at = i + Math.min(index, text.length - 1);
      r.setStart(node, at);
      r.setEnd(node, at + 1);
      const b = r.getBoundingClientRect();
      return { x: index < text.length ? b.left + 1 : b.right - 1, y: (b.top + b.bottom) / 2 };
    }
    throw new Error(`text not found: ${text}`);
  }, [text, index]);
}

const CLIPS = {
  // The folder tree `serve` opens on, then a click into the review.
  async index(browser, s) {
    return clip(browser, 'index', async (page) => {
      await page.goto(s.url);
      await page.waitForLoadState('networkidle');
    }, async ({ page, m, wait }) => {
      await wait(900);
      const notes = await center(page, 'summary');
      await m.click(notes.x, notes.y, 700);
      await wait(900);
      const doc = await center(page, 'a[href$="launch-review.html"]');
      await m.click(doc.x, doc.y, 800);
      await page.waitForFunction(() => window.margent !== undefined);
      await page.waitForFunction(() => [...document.querySelectorAll('agent-island')].every((h) => h.hasAttribute('data-state')));
      await wait(1500);
    });
  },

  // The review page: scroll past the funnel island and the rollout diagram.
  async page(browser, s) {
    return clip(browser, 'page', (page) => openDoc(page, s, 'launch-review.html'), async ({ page, m, wait }) => {
      await wait(800);
      await m.move(700, 420, 500);
      await scroll(page, 330, 1400);
      await wait(1400);
      await scroll(page, 520, 1600);
      await wait(1600);
    });
  },

  // A phrase dragged with the mouse, Comment, a note and Enter: the note lands in the .md and the page reloads.
  async comment(browser, s) {
    const before = readFileSync(join(s.root, 'launch-review.md'), 'utf8');
    await clip(browser, 'comment', (page) => openDoc(page, s, 'launch-review.html'), async ({ page, m, wait }) => {
      await wait(700);
      const phrase = 'a third came back the next week';
      const a = await pointAt(page, phrase, 0);
      const b = await pointAt(page, phrase, phrase.length);
      await m.move(a.x - 1, a.y, 800);
      await m.down();
      await m.move(b.x, b.y, 900);
      await m.up();
      await wait(500);
      const tool = await center(page, '.comment-tool');
      await m.click(tool.x, tool.y, 600);
      await page.locator('.comment-box:not([hidden]) textarea').waitFor();
      await wait(300);
      await page.keyboard.type('Is week 2 the right window? Most teams search on Mondays.', { delay: 45 });
      await wait(500);
      await saveVia(page, () => page.keyboard.press('Enter'));
      await wait(2200);
    });
    s.diffs.comment = { before, after: readFileSync(join(s.root, 'launch-review.md'), 'utf8') };
  },

  // What the agent does when told "I commented": it runs `margent comments` (its real output goes into the terminal
  // scene), makes the change, and replies under the thread. Here the script writes that edit, as the agent would, and
  // the open page reloads by itself (serve watches the .md) with the reply in the thread's card.
  async reply(browser, s) {
    const project = dirname(s.root);
    const listed = await run(process.execPath, [join(repo, 'dist', 'cli.js'), 'comments', 'docs/launch-review.md'], project);
    writeFileSync(join(OUT, 'comments.json'), JSON.stringify({ command: 'margent comments docs/launch-review.md', lines: listed.trimEnd().split('\n') }, null, 1));
    const file = join(s.root, 'launch-review.md');
    const before = readFileSync(file, 'utf8');
    const quy = /(\{>>\[c1 [^\]]+\] Quy: [^<]*<<\})/;
    if (!quy.test(before)) throw new Error('reply: no c1 note from the comment clip in launch-review.md');
    const after = before
      .replace(quy, '$1{>>[c1 2026-11-14T09:32Z] Claude: Week 2 means days 8 to 14 after the invite, so a Monday habit still counts. I defined it in the funnel caption.<<}')
      .replace('between the first search and the second week,', 'between the first search and the second week (days 8 to 14 after the invite),');
    if (after === before) throw new Error('reply: the edit changed nothing');
    await clip(browser, 'reply', (page) => openDoc(page, s, 'launch-review.html'), async ({ page, wait }) => {
      await wait(1200);
      await page.evaluate(() => (window.__marker = 'before-reply'));
      writeFileSync(file, after);
      await page.waitForFunction(() => window.margent !== undefined && window.__marker === undefined, null, { timeout: 10000 });
      await page.waitForFunction(() => [...document.querySelectorAll('agent-island')].every((h) => h.hasAttribute('data-state')));
      await wait(3000);
    }, { now: '2026-11-14T09:33:00Z' });
    s.diffs.reply = { before, after };
  },

  // A click into a paragraph, a few words typed, a click away: the block saves into the .md.
  async edit(browser, s) {
    const before = readFileSync(join(s.root, 'launch-review.md'), 'utf8');
    await clip(browser, 'edit', async (page) => {
      await openDoc(page, s, 'launch-review.html');
      await page.evaluate(() => document.querySelector('#next-steps')?.scrollIntoView({ block: 'start' }));
      await wait(300);
    }, async ({ page, m, wait }) => {
      await wait(700);
      const end = await pointAt(page, 'bring people back in week two', 'bring people back in week two'.length);
      await m.click(end.x, end.y, 900);
      await page.waitForSelector('[data-editing]');
      await wait(400);
      await page.keyboard.type(' and are the most requested feature', { delay: 55 });
      await wait(700);
      await saveVia(page, () => m.click(1150, 600, 600));
      await wait(2000);
    });
    s.diffs.edit = { before, after: readFileSync(join(s.root, 'launch-review.md'), 'utf8') };
  },
};

// Runs a command in cwd and resolves with its stdout; a non-zero exit rejects with its stderr.
function run(command, args, cwd) {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, MARGENT_HOME: join(here, 'no-margent-home') } });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.once('exit', (code) => (code === 0 ? ok(out) : fail(new Error(`${command} ${args.join(' ')} exited with ${code}: ${err}`))));
  });
}

// Signs in through the token URL, then opens a doc page and waits for its edit runtime and islands.
async function openDoc(page, s, path) {
  await page.goto(s.url);
  await page.goto(`${s.base}/${path}`);
  await page.waitForFunction(() => window.margent !== undefined);
  await page.waitForFunction(() => [...document.querySelectorAll('agent-island')].every((h) => h.hasAttribute('data-state')));
  await page.evaluate(() => document.fonts.ready);
  await wait(800);
}

// Scrolls by `dy` with real wheel events over `ms`.
async function scroll(page, dy, ms) {
  const steps = Math.round(ms / 16);
  for (let i = 0; i < steps; i++) {
    const k = (i + 0.5) / steps;
    await page.mouse.wheel(0, (dy / steps) * (Math.PI / 2) * Math.sin(Math.PI * k));
    await wait(16);
  }
}

// Runs an action that saves, waits for the 200, then for the page's own reload (the marker set before is gone).
async function saveVia(page, action) {
  await page.evaluate(() => (window.__marker = 'before-save'));
  const response = page.waitForResponse((r) => r.url().endsWith('/_save') && r.request().method() === 'POST');
  await action();
  const status = (await response).status();
  if (status !== 200) throw new Error(`save answered ${status}`);
  await page.waitForFunction(() => window.margent !== undefined && window.__marker === undefined, null, { timeout: 10000 });
}

// The served folder is search-beta/docs, as in the README's `margent serve docs`: page headers name the project after
// the folder above docs/, so the temp folder's random name stays out of the video.
const tmp = mkdtempSync(join(tmpdir(), 'margent-demo-'));
const root = join(tmp, 'search-beta', 'docs');
cpSync(join(here, 'sample-docs'), root, { recursive: true });
let served;
let browser;
try {
  served = await serve(root);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'serve.json'), JSON.stringify({ line: served.line.replace(root, '~/search-beta/docs') }, null, 1));
  browser = await chromium.launch({ channel: 'chrome' });
  // Each clip's page signs in through the token URL first, which sets the session cookie and shows the index.
  const s = { url: served.url, root, base: new URL(served.url).origin, diffs: {} };
  for (const [name, run] of Object.entries(CLIPS)) {
    if (only.length && !only.includes(name)) continue;
    await run(browser, s);
  }
  if (Object.keys(s.diffs).length) writeFileSync(join(OUT, 'diffs.json'), JSON.stringify(s.diffs, null, 1));
} finally {
  await browser?.close();
  await served?.stop();
  rmSync(tmp, { recursive: true, force: true });
}
