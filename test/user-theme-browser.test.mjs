// The user theme in island frames (M9 spec U3; acceptance A4). A page rendered with a theme gives each island frame the
// theme text after the fonts link, and the theme's tokens reach the island's :host in light and dark. Browser checks use
// Chrome via playwright-core and read the island inside its frame (M5 R3). Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPage, withBrowser, islandFrame } from './helpers/browser.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// A page with one island (the phrases island of the comment UI fixture, which needs no data beyond its lines).
const DOC = join(REPO, 'test', 'fixtures', 'comments', 'ui-island', 'docs', 'island.md');

const { renderDoc } = await import('../.build/render/page.js');

const workdir = mkdtempSync(join(tmpdir(), 'margent-user-theme-browser-'));
process.on('exit', () => rmSync(workdir, { recursive: true, force: true }));

// Renders DOC with the given theme (or none) into the work folder and returns its file path.
function pageFile(name, theme) {
  const outFile = join(workdir, `${name}.html`);
  const source = readFileSync(DOC, 'utf8');
  const html = renderDoc({ file: DOC, source, root: dirname(DOC), outFile, theme }).html;
  writeFileSync(outFile, html);
  return outFile;
}

// Light sets --accent on :root; dark sets it on the data-theme="dark" selector, which the house dark rule shares.
const THEME_CSS = [
  ':root { --accent: rgb(1, 2, 3); }',
  '@media screen { :root[data-theme="dark"] { --accent: rgb(4, 5, 6); } }'
].join('\n');

// The computed --accent of the island's :host, read inside its frame.
async function hostAccent(frame) {
  return frame.evaluate(() => {
    const host = [...document.body.children].find((e) => e.shadowRoot);
    return getComputedStyle(host).getPropertyValue('--accent').trim();
  });
}

// The texts of the <style> elements in a frame's head.
async function frameHeadStyles(frame) {
  return frame.evaluate(() => [...document.head.querySelectorAll('style')].map((s) => s.textContent));
}

test('A4 U3.3 a theme token reaches the island in light, and the dark override reaches it after a switch to dark', async () => {
  const file = pageFile('token', { file: join(workdir, 'theme.css'), css: THEME_CSS });
  await withBrowser(async (browser) => {
    const { page, errors, close } = await openPage(browser, file);
    try {
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), null);
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),
        'rgb(1, 2, 3)'
      );
      const frame = await islandFrame(page, 0);
      assert.equal(await hostAccent(frame), 'rgb(1, 2, 3)');

      await page.click('#theme-toggle');
      await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark');
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),
        'rgb(4, 5, 6)'
      );
      // Tokens reach the frame by message, so wait for the island to take the dark value.
      await frame.waitForFunction(() => {
        const host = [...document.body.children].find((e) => e.shadowRoot);
        return getComputedStyle(host).getPropertyValue('--accent').trim() === 'rgb(4, 5, 6)';
      });
      assert.deepEqual(errors, []);
    } finally {
      await close();
    }
  });
});

test('A4 U3.1 the island frame carries the theme text in a style after the fonts link', async () => {
  const file = pageFile('frame-style', { file: join(workdir, 'theme.css'), css: THEME_CSS });
  await withBrowser(async (browser) => {
    const { page, close } = await openPage(browser, file);
    try {
      const pageThemeText = await page.evaluate(() => document.getElementById('margent-user-theme').textContent);
      const frame = await islandFrame(page, 0);
      const styles = await frameHeadStyles(frame);
      // The theme style follows the fonts link, ahead of the frame's own layout style (spec U3.1).
      assert.equal(styles.length, 2, 'frame head has the theme style and the frame style');
      assert.equal(styles[0], pageThemeText);
      assert.ok(styles[0].includes(THEME_CSS), 'the theme text is the page theme');
      const order = await frame.evaluate(() => [...document.head.children].map((e) => e.tagName));
      assert.deepEqual(order, ['META', 'META', 'LINK', 'STYLE', 'STYLE']);
    } finally {
      await close();
    }
  });
});

test('U3.2 a page without a theme gives its frame no theme style', async () => {
  const file = pageFile('no-theme', undefined);
  await withBrowser(async (browser) => {
    const { page, close } = await openPage(browser, file);
    try {
      assert.equal(await page.evaluate(() => document.getElementById('margent-user-theme')), null);
      const frame = await islandFrame(page, 0);
      const styles = await frameHeadStyles(frame);
      // Only the frame's own style: the same head as before the theme existed.
      assert.equal(styles.length, 1);
      assert.ok(!styles[0].includes(':root'), 'the one style is the frame style, not a theme');
      const order = await frame.evaluate(() => [...document.head.children].map((e) => e.tagName));
      assert.deepEqual(order, ['META', 'META', 'LINK', 'STYLE']);
    } finally {
      await close();
    }
  });
});
