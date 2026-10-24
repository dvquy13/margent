// Acceptance A1: every word of the markdown appears in the rendered page's text.
// Usage: node scripts/accept/text-coverage.mjs {page.html} {source.md}
// Exit 0 with `ok {n} words` (n = distinct words in the markdown), exit 1 with one line per missing word
// (and one per console or page error), exit 2 on bad usage.
//
// What counts as page text: every text node in <body>, including island shadow roots (open) and the
// light-DOM fallback tables, plus the `aria-label` and `alt` attributes (an inline SVG's aria-label, a
// gauge's aria-label and a raster image's alt are how the markdown's alt text reaches the page). <script>
// and <style> are skipped. Visibility is not checked, so a fallback table that is hidden once an island
// renders still counts.
//
// What counts as a markdown word: frontmatter is skipped; HTML comments (island markers), link and image
// targets, link reference definitions, and fence lines are dropped; a link's text and an image's alt text
// are kept; code block contents are kept; `\$` is read as `$`. A word is a run of Unicode letters or digits,
// compared case-insensitively. Words are a set, so a repeated word is checked once, at its first line.
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { openPage, withBrowser } from '../../test/helpers/browser.mjs';

const WORD = /[\p{L}\p{N}]+/gu;

// Words of the markdown source, each with the 1-based line where it first appears.
export function markdownWords(source) {
  const first = new Map();
  const add = (text, line) => {
    for (const m of text.toLowerCase().matchAll(WORD)) if (!first.has(m[0])) first.set(m[0], line);
  };
  const lines = source.split(/\r?\n/);
  let i = 0;
  if (lines[0] === '---') {
    const close = lines.indexOf('---', 1);
    if (close > 0) i = close + 1;
  }
  let inComment = false;
  let fence = null; // the opening fence marker while inside a code block
  for (; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;
    if (fence) {
      if (new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null;
      else add(line, ln);
      continue;
    }
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (open) {
      fence = open[1];
      continue;
    }
    if (/^\s{0,3}\[[^\]]+\]:\s*\S+/.test(line)) continue; // link reference definition
    let s = line;
    if (inComment) {
      const end = s.indexOf('-->');
      if (end < 0) continue;
      s = s.slice(end + 3);
      inComment = false;
    }
    for (;;) {
      const start = s.indexOf('<!--');
      if (start < 0) break;
      const end = s.indexOf('-->', start + 4);
      if (end < 0) {
        s = s.slice(0, start);
        inComment = true;
        break;
      }
      s = s.slice(0, start) + s.slice(end + 3);
    }
    // list markers ("-", "1.") and blockquote marks are rendered as markers, not text
    s = s.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/^\s*>\s?/, '');
    s = s
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' $1 ') // image: alt text stays, path goes
      .replace(/\[([^\]]*)\]\([^)]*\)/g, ' $1 ') // inline link: text stays, target goes
      .replace(/\[([^\]]*)\]\[[^\]]*\]/g, ' $1 ') // reference link
      .replace(/<((?:https?|mailto):[^>\s]+)>/g, ' $1 ') // autolink: the URL is rendered as link text
      .replace(/<\/?[a-zA-Z][^>]*>/g, ' ') // raw HTML tags
      .replace(/\\\$/g, '$');
    add(s, ln);
  }
  return first;
}

// Visible and hidden text of the page's body, including open shadow roots and the fallback tables.
function pageTextInBrowser() {
  const out = [];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE']);
  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.textContent);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (SKIP.has(node.tagName)) return;
      for (const attr of ['aria-label', 'alt']) if (node.hasAttribute(attr)) out.push(node.getAttribute(attr));
      if (node.shadowRoot) visit(node.shadowRoot);
    }
    for (const child of node.childNodes) visit(child);
  };
  visit(document.body);
  return out.join('\n');
}

function tokens(text) {
  return new Set([...text.toLowerCase().matchAll(WORD)].map((m) => m[0]));
}

async function main([pageArg, mdArg]) {
  if (!pageArg || !mdArg) {
    process.stderr.write('usage: node scripts/accept/text-coverage.mjs {page.html} {source.md}\n');
    return 2;
  }
  const pagePath = resolve(pageArg);
  const mdPath = resolve(mdArg);
  const mdShown = relative(process.cwd(), mdPath);
  const words = markdownWords(readFileSync(mdPath, 'utf8'));

  const { text, errors } = await withBrowser(async (browser) => {
    const { page, errors, close } = await openPage(browser, pagePath);
    try {
      return { text: await page.evaluate(pageTextInBrowser), errors };
    } finally {
      await close();
    }
  });

  const have = tokens(text);
  const missing = [...words].filter(([w]) => !have.has(w)).sort((a, b) => a[1] - b[1]);
  for (const e of errors) console.log(`error: ${relative(process.cwd(), pagePath)}: ${e}`);
  for (const [w, line] of missing) console.log(`missing: "${w}" first at ${mdShown}:${line}`);
  if (errors.length || missing.length) {
    console.log(`fail: ${missing.length} missing words, ${errors.length} errors`);
    return 1;
  }
  console.log(`ok ${words.size} words`);
  return 0;
}

// Run as a script, not when imported (the test imports markdownWords).
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  process.exitCode = await main(process.argv.slice(2));
}
