// Acceptance M3 A3: copies a docs tree, adds a comment to every block the round-trip gate passes today, and gates the
// commented copy. A passing block (p, h1-h6, ul, ol) gets one thread: its first word is highlighted when it is plain
// text, and a note {>>[cN] Quy: note N<<} follows the highlight, or ends the block's first line when there is none.
// Only copies are written. The source tree is copied first and read only from the copy.
// Usage: node scripts/accept/comment-copies.mjs {srcDocsDir} {outDir}
import { cpSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBrowser } from '../../test/helpers/browser.mjs';
import { openServed, renderServed } from '../../test/helpers/edit-page.mjs';

export const NOTE_AUTHOR = 'Quy';
const PASSABLE_TYPES = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol']);

// Every .md under dir, as paths relative to dir, in name order.
export function markdownFiles(dir, rel = '', out = []) {
  for (const name of readdirSync(join(dir, rel)).sort()) {
    const next = join(rel, name);
    if (statSync(join(dir, next)).isDirectory()) markdownFiles(dir, next, out);
    else if (name.endsWith('.md')) out.push(next);
  }
  return out;
}

// The gate entries of one doc in the given tree. A doc that does not render throws its RenderError, as renderServed does.
export async function gateDoc(browser, root, rel) {
  const source = readFileSync(join(root, rel), 'utf8');
  const { page, errors, close } = await openServed(browser, renderServed({ source, root, path: rel }));
  try {
    if (errors.length > 0) throw new Error(`${rel}: edit runtime errors: ${errors.join('; ')}`);
    return await page.evaluate(() => window.margent.gate);
  } finally {
    await close();
  }
}

// The marker that starts a block's first line: a list marker, or a heading's #s. The rest is the block's content.
function splitMarker(line) {
  const m = /^(\s*(?:[-+*]|\d+\.|#{1,6})\s+)/.exec(line);
  return m ? { prefix: m[1], rest: line.slice(m[1].length) } : { prefix: '', rest: line };
}

// The first word of the content, when it is plain text that starts the content and is followed by a space, punctuation or
// the end of the line. A numbered heading's number (its span.num in the page) is skipped, so the word is the title's first.
function firstWord(rest, type) {
  const number = type.startsWith('h') ? /^\d+\s+/.exec(rest) : null;
  const skip = number ? number[0].length : 0;
  const word = /^[A-Za-z0-9]+(?=[\s.,;:!?)]|$)/.exec(rest.slice(skip));
  return word ? { before: rest.slice(0, skip), word: word[0], after: rest.slice(skip + word[0].length) } : null;
}

// The source with one comment per passing block. `gate` is the block list of the source as rendered. Returns the new
// source and one entry per comment: the block's range, its type, and the highlighted word (null when the note ends the line).
// Line numbers do not change, so the gate ranges of the original stay valid for the commented copy.
export function commentSource(source, gate) {
  const lines = source.split('\n');
  const commented = [];
  for (const g of gate) {
    if (!g.pass) continue;
    if (!PASSABLE_TYPES.has(g.type)) throw new Error(`comment-copies: ${g.range} is a ${g.type}, which the gate does not judge`);
    const i = Number(g.range.split('-')[0]) - 1;
    const n = commented.length + 1;
    const note = `{>>[c${n}] ${NOTE_AUTHOR}: note ${n}<<}`;
    const line = lines[i];
    const cr = line.endsWith('\r') ? '\r' : '';
    const body = cr ? line.slice(0, -1) : line;
    const { prefix, rest } = splitMarker(body);
    const first = firstWord(rest, g.type);
    if (first) {
      lines[i] = `${prefix}${first.before}{==${first.word}==}${note}${first.after}${cr}`;
      commented.push({ range: g.range, type: g.type, word: first.word });
    } else {
      lines[i] = `${body}${note}${cr}`;
      commented.push({ range: g.range, type: g.type, word: null });
    }
  }
  return { text: lines.join('\n'), commented };
}

// The source with every inserted comment and highlight removed. For the sanity check: it must give the original source.
export function unmark(text) {
  return text
    .replace(/\{>>\[c\d+\] Quy: note \d+<<\}/g, '')
    .replace(/\{==([A-Za-z0-9]+)==\}/g, '$1');
}

// Copies srcDir to outDir, comments every passing block of each doc in the copy, and writes the commented doc over the copy.
// Returns one entry per doc: { rel, source, commented, renderError }. Docs that do not render are listed, not commented.
export async function commentTree(browser, srcDir, outDir) {
  cpSync(srcDir, outDir, { recursive: true });
  const docs = [];
  for (const rel of markdownFiles(outDir)) {
    const source = readFileSync(join(outDir, rel), 'utf8');
    let gate;
    try {
      gate = await gateDoc(browser, outDir, rel);
    } catch (err) {
      if (err.name !== 'RenderError') throw err;
      docs.push({ rel, source, commented: [], renderError: err.message });
      continue;
    }
    const { text, commented } = commentSource(source, gate);
    if (commented.length > 0) writeFileSync(join(outDir, rel), text);
    docs.push({ rel, source, text, commented, renderError: null });
  }
  return docs;
}

// The A3 run: comments the tree, gates each commented doc, and reports every commented block that does not pass.
// Returns { commented, passed, failures: [{ rel, range, type, word, reason }], docs }.
export async function runA3(browser, srcDir, outDir) {
  const docs = await commentTree(browser, srcDir, outDir);
  let commented = 0;
  let passed = 0;
  const failures = [];
  for (const doc of docs) {
    if (doc.commented.length === 0) continue;
    commented += doc.commented.length;
    const fail = (c, reason) => failures.push({ rel: doc.rel, range: c.range, type: c.type, word: c.word, reason });
    if (unmark(doc.text) !== doc.source) {
      for (const c of doc.commented) fail(c, 'the inserted markup does not strip back to the source (a bug in commentSource)');
      continue;
    }
    let gate;
    try {
      gate = await gateDoc(browser, outDir, doc.rel);
    } catch (err) {
      if (err.name !== 'RenderError') throw err;
      for (const c of doc.commented) fail(c, `the commented doc does not render: ${err.message}`);
      continue;
    }
    for (const c of doc.commented) {
      const g = gate.find((x) => x.range === c.range);
      if (!g) fail(c, 'the block is missing from the commented copy');
      else if (g.pass) passed++;
      else fail(c, g.reason);
    }
  }
  return { commented, passed, failures, docs };
}

export function reportText(result) {
  const pct = result.commented === 0 ? 'n/a' : `${((100 * result.passed) / result.commented).toFixed(1)}%`;
  const docsCommented = result.docs.filter((d) => d.commented.length > 0).length;
  const lines = [
    `A3 commented copies: ${result.commented} commented blocks in ${docsCommented} docs, ${result.passed} pass the gate (${pct}).`,
    `Failing blocks (${result.failures.length}):`,
    ...result.failures.map((f) => `  ${f.rel}:${f.range} ${f.type} word=${JSON.stringify(f.word)}: ${f.reason}`),
    `Docs that did not render (${result.docs.filter((d) => d.renderError).length}):`,
    ...result.docs.filter((d) => d.renderError).map((d) => `  ${d.rel}: ${d.renderError}`),
  ];
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [, , srcArg, outArg] = process.argv;
  if (!srcArg || !outArg) {
    console.error('usage: node scripts/accept/comment-copies.mjs {srcDocsDir} {outDir}');
    process.exit(2);
  }
  const result = await withBrowser((browser) => runA3(browser, resolve(srcArg), resolve(outArg)));
  console.log(reportText(result));
  process.exitCode = result.commented > 0 && result.passed / result.commented >= 0.95 ? 0 : 1;
}
