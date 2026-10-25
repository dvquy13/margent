// The output of `margent comments` (spec R8): one head line per thread with its notes, then a summary line.
import { displayPath } from '../render/root.js';
import { noteLines, splitQuote, type Thread } from '../comments/syntax.js';
import type { RenderedFile } from './collect.js';

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}

// What a thread is anchored to, as the head line names it.
function what(t: Thread): string {
  if (t.kind === 'inline') return `"${t.highlight ?? ''}"`;
  if (t.kind === 'point') return 'point comment';
  if (t.anchor === undefined || t.anchorKind === undefined) throw new Error(`comments: block thread ${t.id} has no anchor`);
  const quoted = t.quote === undefined ? '' : `, at "${t.quote}"`;
  return `block comment on the ${t.anchorKind} at line ${Number(t.anchor.split('-')[0])}${quoted}`;
}

// The report for docs that all rendered. Threads come in document order, docs in the order given.
export function commentsReport(docs: RenderedFile[]): string {
  const lines: string[] = [];
  let threads = 0;
  let needsAgent = 0;
  let needsYou = 0;
  let docsWithThreads = 0;
  for (const doc of docs) {
    if (doc.rendered.comments.length === 0) continue;
    docsWithThreads++;
    const file = displayPath(doc.file);
    for (const t of doc.rendered.comments) {
      // A thread holds at least one note, and the last one says whose turn it is (spec R8.3).
      const youNext = t.notes[t.notes.length - 1].author === 'Claude';
      const state = youNext ? 'needs you' : 'needs agent';
      threads++;
      if (youNext) needsYou++;
      else needsAgent++;
      lines.push(`${file}:${t.line}: [${t.id}] ${state} · ${what(t)}`);
      t.notes.forEach((n, i) => {
        // A quoted block comment's quote is in the head, so the first note line prints only the body. A note with
        // breaks goes on one line each, indented to the column where its text starts.
        const text = i === 0 && t.quote !== undefined ? splitQuote(n.text).body : n.text;
        const [first, ...rest] = noteLines(text);
        lines.push(`  ${n.author}: ${first}`);
        for (const line of rest) lines.push(`${' '.repeat(2 + n.author.length + 2)}${line}`);
      });
    }
  }
  if (threads === 0) return `no threads in ${docs.length} ${plural(docs.length, 'doc')}\n`;
  const summary =
    `${threads} ${plural(threads, 'thread')} in ${docsWithThreads} ${plural(docsWithThreads, 'doc')}: ` +
    `${needsAgent} needs agent, ${needsYou} needs you`;
  return `${lines.join('\n')}\n${summary}\n`;
}
