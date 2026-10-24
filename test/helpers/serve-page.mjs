// Serves a temp copy of a docs folder with the real `margent serve` server and opens one page in installed Chrome,
// signed in through the token URL. For editing tests that need /_save, /_events and real file writes.
// Imports from .build/ (run `npm run build` first).
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { islandsSettled } from './browser.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { startServer } = await import(join(repo, '.build', 'serve', 'server.js'));

// Copies `folder` to a temp dir and serves it. `options` are startServer's (e.g. { author }). Returns { root, server, url(path),
// read(path), close }.
export async function serveCopy(folder, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'margent-serve-'));
  cpSync(folder, root, { recursive: true });
  const server = await startServer({ root, ...options });
  const base = `http://127.0.0.1:${server.port}`;
  return {
    root,
    server,
    url: (path) => `${base}/${path}`,
    read: (path) => readFileSync(join(root, path), 'utf8'),
    close: async () => {
      await server.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

// Opens `mdPath` (relative to the served root) as its page, after the token URL has set the cookie. Waits for the edit
// runtime. Returns { page, errors, close }; errors collects page errors and console errors. `initScript` (optional) runs
// in every document before the page's own scripts.
export async function openServedPage(browser, served, mdPath, { viewport = { width: 1000, height: 900 }, colorScheme = 'light', initScript } = {}) {
  const context = await browser.newContext({ viewport, colorScheme });
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // A missing favicon is not a page error; the server's own refusals are asserted through responses instead.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().split('\n')[0]}`);
  });
  await page.goto(served.server.url);
  await page.goto(served.url(mdPath.replace(/\.md$/, '.html')));
  await page.waitForFunction(() => window.margent !== undefined);
  // The islands settle before the caller measures the page (see islandsSettled).
  await islandsSettled(page);
  return { page, errors, close: () => context.close() };
}
