// Shared helpers for the edit runtime tests. A source is rendered with the edit slot (as `margent serve` does) and
// served at http://localhost/doc.html through Playwright routes, so the page's fetch('/_save') resolves as it does
// under serve. Imports from .build/ (run `npm run build` first).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repo = resolve(here, '..', '..');
export const FIXTURES = join(repo, 'test', 'fixtures', 'edit');

const { renderDoc } = await import(join(repo, '.build', 'render', 'page.js'));
export const { findDocsRoot } = await import(join(repo, '.build', 'render', 'root.js'));

// The bundle and CSS that `serve` inlines (src/serve/server.ts reads the same two files).
export const EDIT_JS = readFileSync(join(repo, '.build', 'runtime', 'edit.js'), 'utf8');
const EDIT_CSS = readFileSync(join(repo, 'runtime', 'edit', 'edit.css'), 'utf8');

// The served page's HTML for `source`. `root` is the docs root (images and links resolve against it), `path` the doc's
// path relative to the root. Throws RenderError (by name) for a doc that does not render.
export function renderServed({ source, root = FIXTURES, path = 'doc.md' }) {
  const file = join(root, path);
  const outFile = join(root, path.replace(/\.md$/, '.html'));
  return renderDoc({
    file,
    source,
    root,
    outFile,
    edit: { state: { path, hash: 'test', source, author: null }, js: EDIT_JS, css: EDIT_CSS },
  }).html;
}

// Opens html at http://localhost/doc.html in a fresh context. `save(route, request)` answers POST /_save when given.
// Returns { page, errors, close }; errors collects page errors, so a test can assert the runtime loaded cleanly.
export async function openServed(browser, html, { save } = {}) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://localhost/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/doc.html') {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    }
    if (url.pathname === '/_save' && save) return save(route, route.request());
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });
  await page.goto('http://localhost/doc.html');
  return { page, errors, close: () => context.close() };
}

// The gate entries of a served source, in document order.
export async function gateOf(browser, source) {
  const { page, errors, close } = await openServed(browser, renderServed({ source }));
  try {
    const gate = await page.evaluate(() => window.margent.gate);
    if (errors.length > 0) throw new Error(`edit runtime errors: ${errors.join('; ')}`);
    return gate;
  } finally {
    await close();
  }
}
