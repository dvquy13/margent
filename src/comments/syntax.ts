// The comment grammar and the pure source edits on one block's text (spec R1; plan "Syntax module"). Nothing here
// imports from node or the DOM, because esbuild bundles this file into the edit runtime as well as into the CLI.
// Every function except nextId works on one block's source and skips backtick code spans.

// {>>[c{n}] {author}: {text}<<}. The author has no ':' or ']', and the text is one non-empty line without '<<}'.
export const NOTE =
  /\{>>\[(?<id>c[1-9]\d*)\] (?<author>(?:(?!<<\})[^:\]\r\n])+): (?<text>(?:(?!<<\}).)+)<<\}/g;

export interface NoteParts {
  id: string;
  author: string;
  text: string;
}

// A thread as the renderer reports it (plan "Render contract").
export interface Thread {
  id: string;
  line: number;
  kind: 'inline' | 'point' | 'block';
  block: string;
  anchor?: string;
  anchorKind?: string; // kind 'block': what the block above is (paragraph, table, island, figure, ...)
  highlight?: string;
  quote?: string; // kind 'block': the quoted phrase the first note starts with, if any
  occurrence?: number; // kind 'block': the 1-based match of that quote the comment means, when the quote names one (0041)
  notes: NoteParts[];
}

interface Span {
  start: number;
  end: number;
}

interface FoundNote extends NoteParts, Span {}

// A line break inside a note's text, as written (`<br>`, `<br/>`, `<br />`, any case). Global, so use it only with
// split and replace, which reset lastIndex themselves.
export const BREAK = /<br\s*\/?>/gi;

// The lines of a note's text: the text split on each break. A text without a break is one line.
export function noteLines(text: string): string[] {
  return text.split(BREAK);
}

// The one-line note source for a multi-line field value (decision 0037): CRLF and CR become LF, the whole value is
// trimmed, and its lines are joined with `<br>`. Empty lines between the others are kept.
export function noteFromField(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim().split('\n').join('<br>');
}

// The field value of a note's text: each break becomes a line feed. The inverse of noteFromField for a one-line text.
export function fieldFromNote(text: string): string {
  return text.replace(BREAK, '\n');
}

// The note text the grammar accepts. A note's text can't hold '<<}', and a note can't hold a line break.
export function noteSource(n: NoteParts): string {
  if (!/^c[1-9]\d*$/.test(n.id)) {
    throw new Error(`noteSource: id ${JSON.stringify(n.id)} must look like c1, c2, ... (no leading zero)`);
  }
  if (n.author.trim() === '') throw new Error('noteSource: the author is empty');
  if (/[:\]\r\n]/.test(n.author)) {
    throw new Error(`noteSource: the author ${JSON.stringify(n.author)} must not hold ':', ']' or a line break`);
  }
  if (n.author.includes('<<}')) throw new Error(`noteSource: the author ${JSON.stringify(n.author)} must not hold '<<}'`);
  if (n.text.trim() === '') throw new Error('noteSource: the note text is empty');
  if (/[\r\n]/.test(n.text)) throw new Error(`noteSource: the note text ${JSON.stringify(n.text)} must be one line`);
  if (n.text.includes('<<}')) throw new Error(`noteSource: the note text ${JSON.stringify(n.text)} must not hold '<<}'`);
  return `{>>[${n.id}] ${n.author}: ${n.text}<<}`;
}

// The next free ID in a whole file: one above the highest in any note, or c1. Gaps are fine.
export function nextId(fileSource: string): string {
  let max = 0;
  for (const m of fileSource.matchAll(NOTE)) {
    max = Math.max(max, Number(idOf(m).slice(1)));
  }
  return `c${max + 1}`;
}

// The ID of a NOTE match. The pattern always captures it, so a match without it is a bug in this file.
function idOf(m: RegExpMatchArray): string {
  const id = m.groups?.id;
  if (id === undefined) throw new Error('syntax: a note match has no id group');
  return id;
}

// Backtick code spans (CommonMark): a run of N backticks closed by the next run of exactly N. An unclosed run is text.
function codeSpans(block: string): Span[] {
  const runs = [...block.matchAll(/`+/g)].map((m) => ({ start: m.index ?? 0, len: m[0].length }));
  const spans: Span[] = [];
  for (let i = 0; i < runs.length; i++) {
    let j = i + 1;
    while (j < runs.length && runs[j].len !== runs[i].len) j++;
    if (j === runs.length) continue;
    spans.push({ start: runs[i].start, end: runs[j].start + runs[j].len });
    i = j;
  }
  return spans;
}

// True when the character at pos sits inside a code span.
function inCode(spans: Span[], pos: number): boolean {
  return spans.some((s) => s.start <= pos && pos < s.end);
}

// A match is text, not markup, when its first or last character is inside a code span. A code span wholly inside the
// match (a code span in a highlight's text) is fine, because only the markers have to be outside code.
function isMarkup(spans: Span[], start: number, end: number): boolean {
  return !inCode(spans, start) && !inCode(spans, end - 1);
}

// Every note in the block outside code spans, in order.
function findNotes(block: string): FoundNote[] {
  const spans = codeSpans(block);
  const found: FoundNote[] = [];
  for (const m of block.matchAll(NOTE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (!isMarkup(spans, start, end)) continue;
    found.push({
      id: idOf(m),
      author: m.groups?.author ?? '',
      text: m.groups?.text ?? '',
      start,
      end,
    });
  }
  return found;
}

// The highlight that ends right where a note starts: the nearest '{==' before a '==}' at that position, both outside
// code spans. Highlights never nest, so the nearest opener is the right one. Null when there is none.
function highlightBefore(block: string, noteStart: number): Span | null {
  const spans = codeSpans(block);
  const end = noteStart;
  if (block.slice(end - 3, end) !== '==}' || inCode(spans, end - 1)) return null;
  let open = block.lastIndexOf('{==', end - 4);
  while (open >= 0 && inCode(spans, open)) open = block.lastIndexOf('{==', open - 1);
  return open < 0 ? null : { start: open, end };
}

// A quoted phrase at the start of a block comment's first note: "quote" → body, with U+2192 and one space each side.
// The quote needs a non-space character, as quotedText does. An optional #n after the closing quote says which match
// of the phrase in the block the comment means, 1-based, with one space each side (decision 0041). Anything that doesn't
// match exactly is plain text, so this never throws: #0, #02, #2→ and # 2 are plain text.
const QUOTED = /^"([^"\r\n]*[^"\s][^"\r\n]*)"(?: #([1-9]\d*))? → (.+)$/;

// The quote, its occurrence (only when #n is written) and the body of a block comment's first note. Text that doesn't
// match is the body alone.
export function splitQuote(text: string): { quote?: string; occurrence?: number; body: string } {
  const m = QUOTED.exec(text);
  if (!m) return { body: text };
  return m[2] === undefined ? { quote: m[1], body: m[3] } : { quote: m[1], occurrence: Number(m[2]), body: m[3] };
}

// The first note's text for a quoted block comment, with #n when an occurrence is given (decision 0041). Throws on a
// quote or an occurrence that splitQuote could not read back.
export function quotedText(quote: string, body: string, occurrence?: number): string {
  if (quote.trim() === '') throw new Error('quotedText: the quote is empty');
  if (/["\r\n]/.test(quote)) throw new Error(`quotedText: the quote ${JSON.stringify(quote)} must not hold '"' or a line break`);
  if (quote.includes('<<}')) throw new Error(`quotedText: the quote ${JSON.stringify(quote)} must not hold '<<}'`);
  if (body.trim() === '') throw new Error('quotedText: the body is empty');
  if (occurrence === undefined) return `"${quote}" → ${body}`;
  if (!Number.isSafeInteger(occurrence) || occurrence < 1) {
    throw new Error(`quotedText: the occurrence ${occurrence} must be a positive integer`);
  }
  return `"${quote}" #${occurrence} → ${body}`;
}

// Appends a note after the last note with this ID in the block.
export function appendNote(block: string, id: string, n: NoteParts): string {
  const notes = findNotes(block).filter((note) => note.id === id);
  if (notes.length === 0) throw new Error(`appendNote: the block has no note with id ${id}`);
  const last = notes[notes.length - 1];
  return block.slice(0, last.end) + noteSource({ ...n, id }) + block.slice(last.end);
}

// The block with the index-th note of thread `id` (0-based, source order among that id's notes) rewritten to `text`.
// The note keeps its author, and a quoted first note of a block comment line keeps its `"phrase" → ` prefix, with its
// `#n` when it has one (decision 0041).
export function replaceNote(block: string, id: string, index: number, text: string): string {
  const notes = findNotes(block).filter((note) => note.id === id);
  if (!Number.isInteger(index) || index < 0 || index >= notes.length) {
    throw new Error(`replaceNote: no note ${index} in thread ${id}`);
  }
  const note = notes[index];
  // A block comment line holds one thread and nothing else; the renderer reads its quote from notes[0].
  const lineStart = block.lastIndexOf('\n', note.start - 1) + 1;
  const onBlockLine = index === 0 && block.slice(lineStart, note.start) === '';
  const { quote, occurrence } = onBlockLine ? splitQuote(note.text) : { quote: undefined, occurrence: undefined };
  const body = quote === undefined ? text : quotedText(quote, text, occurrence);
  return block.slice(0, note.start) + noteSource({ id, author: note.author, text: body }) + block.slice(note.end);
}

// Removes every note with this ID. When the thread's first note sits directly after a highlight, the highlight's
// markers go too, and its text stays as it was.
export function stripThread(block: string, id: string): string {
  const notes = findNotes(block).filter((note) => note.id === id);
  if (notes.length === 0) throw new Error(`stripThread: the block has no note with id ${id}`);
  const first = notes[0];
  const removals: Span[] = notes.map((note) => ({ start: note.start, end: note.end }));
  const highlight = highlightBefore(block, first.start);
  if (highlight) {
    removals.push({ start: highlight.start, end: highlight.start + 3 });
    removals.push({ start: highlight.end - 3, end: highlight.end });
  }
  removals.sort((a, b) => a.start - b.start);
  let out = '';
  let pos = 0;
  for (const r of removals) {
    out += block.slice(pos, r.start);
    pos = r.end;
  }
  return out + block.slice(pos);
}

// stripThread for every thread ID in the block.
export function stripAll(block: string): string {
  const ids = [...new Set(findNotes(block).map((note) => note.id))];
  return ids.reduce((text, id) => stripThread(text, id), block);
}
