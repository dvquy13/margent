// Acceptance A10: every link in a rendered page lands.
// Usage: node scripts/accept/link-walk.mjs {page.html}
// Checks every <a href> in the page (light DOM and open shadow roots):
//   - "#x" links, including the table of contents: an element with id "x" must exist on this page.
//   - relative links to .html (with or without "#x"): the file must exist. The file is opened in Chrome, and
//     with "#x" an element with id "x" must exist there. A target page with console or page errors is broken too.
//   - other relative links (for example an image or a .md link the renderer did not rewrite): the file must exist.
//   - external links (http, https, mailto) are not fetched and are not counted.
// Exit 0 with `ok {n} links` (n = links checked), exit 1 with one `broken:` line per broken link, exit 2 on bad usage.
import { existsSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openPage, withBrowser } from '../../test/helpers/browser.mjs';

const rel = (p) => relative(process.cwd(), p) || '.';

// Links of a page, and the ids that a fragment can land on (light DOM only: an id inside a shadow root is not a
// place a link can scroll to).
function pageFacts() {
  const links = [];
  const ids = new Set();
  const walk = (root, lightOnly) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.tagName === 'A' && el.hasAttribute('href')) {
        links.push({ href: el.getAttribute('href'), text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40) });
      }
      if (lightOnly) {
        if (el.id) ids.add(el.id);
        if (el.tagName === 'A' && el.hasAttribute('name')) ids.add(el.getAttribute('name'));
      }
      if (el.shadowRoot) walk(el.shadowRoot, false);
    }
  };
  walk(document, true);
  return { links, ids: [...ids] };
}

function idsInBrowser() {
  const ids = new Set();
  for (const el of document.querySelectorAll('*')) {
    if (el.id) ids.add(el.id);
    if (el.tagName === 'A' && el.hasAttribute('name')) ids.add(el.getAttribute('name'));
  }
  return [...ids];
}

function decodeFragment(hash) {
  const raw = hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function main([pageArg]) {
  if (!pageArg) {
    process.stderr.write('usage: node scripts/accept/link-walk.mjs {page.html}\n');
    return 2;
  }
  const pagePath = resolve(pageArg);
  const pageUrl = pathToFileURL(pagePath);
  const broken = [];
  let checked = 0;

  await withBrowser(async (browser) => {
    const main = await openPage(browser, pagePath);
    const targets = new Map(); // file path -> { ids, errors } or null when missing
    try {
      for (const e of main.errors) broken.push(`error: ${rel(pagePath)}: ${e}`);
      const { links, ids: ownIds } = await main.page.evaluate(pageFacts);
      const ownSet = new Set(ownIds);

      for (const { href, text } of links) {
        const where = `${rel(pagePath)} "${text}" -> ${href}`;
        let url;
        try {
          url = new URL(href, pageUrl);
        } catch {
          checked++;
          broken.push(`broken: ${where}: not a valid URL`);
          continue;
        }
        if (url.protocol !== 'file:') continue; // external: not fetched

        const file = fileURLToPath(url);
        const fragment = url.hash ? decodeFragment(url.hash) : null;
        checked++;

        if (file === pagePath) {
          if (fragment === null || fragment === '') continue;
          if (!ownSet.has(fragment)) broken.push(`broken: ${where}: no element with id "${fragment}" on this page`);
          continue;
        }

        if (!existsSync(file)) {
          broken.push(`broken: ${where}: no such file ${rel(file)}`);
          continue;
        }
        if (!file.endsWith('.html')) {
          if (fragment) broken.push(`broken: ${where}: fragment on a non-html file`);
          continue;
        }
        if (!targets.has(file)) {
          if (statSync(file).isDirectory()) {
            targets.set(file, null);
          } else {
            const opened = await openPage(browser, file);
            try {
              const { ids } = await opened.page.evaluate(idsInBrowser).then((ids) => ({ ids }));
              targets.set(file, { ids: new Set(ids), errors: opened.errors });
            } finally {
              await opened.close();
            }
          }
          const t = targets.get(file);
          if (t) for (const e of t.errors) broken.push(`error: ${rel(file)}: ${e}`);
        }
        const t = targets.get(file);
        if (t === null) {
          broken.push(`broken: ${where}: ${rel(file)} is a folder, not a page`);
        } else if (fragment && !t.ids.has(fragment)) {
          broken.push(`broken: ${where}: no element with id "${fragment}" in ${rel(file)}`);
        }
      }
    } finally {
      await main.close();
    }
  });

  for (const line of broken) console.log(line);
  if (broken.length) {
    console.log(`fail: ${broken.length} broken`);
    return 1;
  }
  console.log(`ok ${checked} links`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
