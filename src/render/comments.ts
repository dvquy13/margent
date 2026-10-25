// Comment markup in markdown (spec R1 to R3; plan "Render contract"). Inline rules read {== ==} highlights and
// {>> <<} notes into tokens; the `comments` core rule checks their structure, groups notes into threads, marks block
// comment lines, and records one Thread per thread in env.comments. Inline rules never throw: they push c_error, and
// the core rule raises the RenderError with the file line.
import type { MarkdownIt, StateCore, StateInline, Token } from 'markdown-it';
import { RenderError } from '../errors.js';
import { NOTE, noteLines, splitQuote, type NoteParts, type Thread } from '../comments/syntax.js';
import { escapeHtml, isBlank, lineRange } from './lines.js';
import { displayPath } from './root.js';

// The env fields this plugin reads and writes.
export interface CommentEnv {
  [key: string | symbol]: unknown; // markdown-it's Env is an index-signature type
  file: string; // absolute path of the .md
  lines: string[];
  comments: Thread[];
}

// Token metas. `at` is the number of line breaks before the token in its inline content, so a line is inline
// token's first line plus `at`.
type HighlightMeta = {
  at: number;
  id?: string; // set by the core rule from the thread after the highlight
  text?: string; // the highlight's plain text, set by the core rule
};
type NoteMeta = {
  at: number;
  note: NoteParts;
  src: string; // the exact source of the note
}
type ErrorMeta = {
  at: number;
  message: string;
}
type ThreadMeta = {
  id: string;
  notes: NoteParts[];
  md: string; // the exact source of the notes, concatenated
  quote?: string; // a block comment's quoted phrase: the first note shows it, and its text (the body) follows
}

// The NOTE grammar, anchored, for one whole note. NOTE itself is global, so it is never tested directly.
const WHOLE_NOTE = new RegExp(`^(?:${NOTE.source})$`);
// A note whose head is right but whose text is empty, such as {>>[c1] Quy: <<} or one that is only breaks.
const EMPTY_NOTE = /^\{>>\[c[1-9]\d*\] [^:\]\r\n]+:(?:\s|<br\s*\/?>)*<<\}$/i;
// ASCII punctuation, which a backslash escapes in markdown.
const ASCII_PUNCT = /[!-/:-@[-`{-~]/;
const ISLAND_MARKER = /^<!--\s*island\b/;

const TABLE_MESSAGE =
  'comment markup cannot go in a table cell, because island data is read from cell source: add a block comment line after the table instead';
const FIGURE_MESSAGE =
  'comment markup cannot go in a figure caption: add a block comment line after the figure instead';

// True when inline children hold comment markup, from an inline rule or the core rule.
export function hasCommentTokens(children: Token[] | null | undefined): boolean {
  return (children ?? []).some((c) => c.type.startsWith('c_'));
}

// Text of inline children with notes left out and highlight text kept. Slugs and TOC labels use it (spec R2.2).
export function plainText(children: Token[] | null): string {
  return (children ?? [])
    .map((c) => {
      if (c.type === 'softbreak' || c.type === 'hardbreak') return ' ';
      if (c.type === 'c_note' || c.type === 'c_thread') return '';
      if (c.children) return plainText(c.children);
      return c.content;
    })
    .join('');
}

// ---- inline rules ---------------------------------------------------------

// The meta of a comment token. markdown-it types it loosely; the metas here are written by this file only.
function metaOf<T>(t: Token): T {
  return t.meta as unknown as T;
}

// Line breaks in the inline content before pos.
function lineOffset(src: string, pos: number): number {
  let n = 0;
  for (let i = 0; i < pos; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

// Index of the "==}" that closes a highlight, looking from `from` to `max`. Code spans and escapes are skipped.
// -1 when there is none.
function findHighlightClose(src: string, from: number, max: number): number {
  let i = from;
  while (i < max) {
    const c = src[i];
    if (c === '\\' && i + 1 < max && ASCII_PUNCT.test(src[i + 1])) {
      i += 2;
      continue;
    }
    if (c === '`') {
      let j = i;
      while (j < max && src[j] === '`') j++;
      const len = j - i;
      let end = -1;
      let k = j;
      while (k < max && end < 0) {
        if (src[k] === '`') {
          let m = k;
          while (m < max && src[m] === '`') m++;
          if (m - k === len) end = m;
          k = m;
        } else {
          k++;
        }
      }
      i = end < 0 ? j : end;
      continue;
    }
    if (src.startsWith('==}', i)) return i;
    i++;
  }
  return -1;
}

// Pushes an error token and moves past the markup's opener, so the rest of the inline content still parses.
function errorToken(state: StateInline, at: number, message: string, next: number): boolean {
  const tok = state.push('c_error', '', 0);
  tok.meta = { at, message } satisfies ErrorMeta;
  state.pos = next;
  return true;
}

function highlightDepth(state: StateInline): number {
  return (state as StateInline & { cHlDepth?: number }).cHlDepth ?? 0;
}

// {==text==}: the text is inline markdown. Highlights never nest.
function highlightRule(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (!src.startsWith('{==', start)) return false;
  const close = findHighlightClose(src, start + 3, state.posMax);
  if (silent) {
    if (close < 0) return false;
    state.pos = close + 3;
    return true;
  }
  const at = lineOffset(src, start);
  if (highlightDepth(state) > 0) {
    return errorToken(state, at, 'highlights never nest: close the open ==} before another {==', start + 3);
  }
  if (close < 0) {
    return errorToken(state, at, 'unclosed {==: add ==} after the highlighted text, in the same paragraph', start + 3);
  }

  const open = state.push('c_hl_open', 'mark', 1);
  open.meta = { at } satisfies HighlightMeta;
  const outerMax = state.posMax;
  const extended = state as StateInline & { cHlDepth?: number };
  extended.cHlDepth = highlightDepth(state) + 1;
  state.pos = start + 3;
  state.posMax = close;
  state.md.inline.tokenize(state);
  state.posMax = outerMax;
  extended.cHlDepth -= 1;
  state.push('c_hl_close', 'mark', -1);
  state.pos = close + 3;
  return true;
}

// {>>[c{n}] {author}: {text}<<}: one note. Its source is kept exactly, for data-md and for the edit runtime.
function noteRule(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (!src.startsWith('{>>', start)) return false;
  const idx = src.indexOf('<<}', start + 3);
  const found = idx >= 0 && idx + 3 <= state.posMax;
  if (silent) {
    if (!found) return false;
    state.pos = idx + 3;
    return true;
  }
  const at = lineOffset(src, start);
  if (!found) {
    return errorToken(state, at, 'unclosed {>>: add <<} after the note text', start + 3);
  }
  const end = idx + 3;
  const raw = src.slice(start, end);
  const m = WHOLE_NOTE.exec(raw);
  const groups = m?.groups;
  if (highlightDepth(state) > 0) {
    return errorToken(state, at, "a note cannot sit inside a highlight: put it after the ==}", end);
  }
  // A text of only breaks and spaces has no words, so it is an empty note.
  if (groups && groups.author.trim() !== '' && noteLines(groups.text).join('').trim() !== '') {
    const note: NoteParts = { id: groups.id, author: groups.author, text: groups.text };
    const tok = state.push('c_note', 'span', 0);
    tok.meta = { at, note, src: raw } satisfies NoteMeta;
    state.pos = end;
    return true;
  }
  if (EMPTY_NOTE.test(raw)) {
    return errorToken(state, at, 'comment note has no text: write the note after "{author}: "', end);
  }
  return errorToken(state, at, 'malformed comment note: expected {>>[c{n}] {author}: {text}<<}', end);
}

// ---- renderer rules -------------------------------------------------------

// A note's text as HTML: each line escaped, and each break shown as a line break.
function noteHtml(text: string): string {
  return noteLines(text).map(escapeHtml).join('<br>');
}

export function registerComments(md: MarkdownIt): void {
  md.inline.ruler.before('emphasis', 'margent_comment_highlight', highlightRule);
  md.inline.ruler.before('emphasis', 'margent_comment_note', noteRule);

  md.renderer.rules.c_hl_open = (tokens, idx) => {
    const meta = metaOf<HighlightMeta>(tokens[idx]);
    return `<mark class="c-hl" data-c="${escapeHtml(meta.id ?? '')}">`;
  };
  md.renderer.rules.c_hl_close = () => '</mark>';
  md.renderer.rules.c_thread = (tokens, idx) => {
    const meta = metaOf<ThreadMeta>(tokens[idx]);
    const notes = meta.notes
      .map((n, i) => {
        const quoted = i === 0 && meta.quote !== undefined;
        const text = quoted
          ? `<q class="c-quote">${escapeHtml(meta.quote!)}</q> ${noteHtml(splitQuote(n.text).body)}`
          : noteHtml(n.text);
        return `<span class="c-note"><b class="c-author">${escapeHtml(n.author)}</b> ${text}</span>`;
      })
      .join('');
    return (
      `<span class="c-thread" data-c="${escapeHtml(meta.id)}" data-md="${escapeHtml(meta.md)}" ` +
      `contenteditable="false">${notes}</span>`
    );
  };
}

// ---- core rule ------------------------------------------------------------

interface BlockEntry {
  token: Token;
  range: string; // data-src of the block
  cline: boolean; // a block comment line
}

// The data-src of a top-level block. A table that an island marker sits above takes the marker's line too, the way
// the island's own data-src does (islands.ts), so an anchor covers the whole island.
function blockRange(t: Token, prev: Token | undefined, lines: string[]): string {
  const map = t.map as [number, number];
  if (t.type === 'table_open' && prev?.type === 'html_block' && prev.map && ISLAND_MARKER.test(prev.content)) {
    if (prev.map[1] === map[0]) return lineRange(lines, [prev.map[0], map[1]]);
  }
  return lineRange(lines, map);
}

// What a block comment's anchor is, for the `comments` output. It runs before the island and figure rules have made
// their tokens, so an island is still a table after a marker or a `island` fence, and a figure is an html_block that
// inlineFigures made (meta.rawBlock).
function anchorKindOf(t: Token, prev: Token | undefined): string {
  switch (t.type) {
    case 'paragraph_open':
      return 'paragraph';
    case 'heading_open':
      return 'heading';
    case 'bullet_list_open':
    case 'ordered_list_open':
      return 'list';
    case 'table_open':
      return prev?.type === 'html_block' && ISLAND_MARKER.test(prev.content) ? 'island' : 'table';
    case 'fence':
      return /^island(\s|$)/.test(t.info.trim()) ? 'island' : 'code';
    case 'code_block':
      return 'code';
    case 'html_block':
      return t.meta?.rawBlock ? 'figure' : 'html';
    case 'blockquote_open':
      return 'quote';
    case 'hr':
      return 'rule';
    default:
      throw new Error(`comments: a block comment has no anchor kind for ${t.type}`);
  }
}

// The comments core rule. Runs after inline parsing and before the islands, so island tables still show as tables.
export function commentsRule(state: StateCore): void {
  const env = state.env as unknown as CommentEnv;
  const file = displayPath(env.file);
  const lines = env.lines;
  const tokens = state.tokens;
  const blocks: BlockEntry[] = [];
  const runs = new Set<string>(); // IDs that already have a run in this file
  let tableDepth = 0;
  let current: BlockEntry | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.level === 0 && t.nesting !== -1) {
      if (!t.map) throw new Error(`comments: top-level ${t.type} has no source map`);
      current = { token: t, range: blockRange(t, blocks.at(-1)?.token, lines), cline: false };
      blocks.push(current);
    }
    if (t.type === 'table_open') tableDepth++;
    if (t.type === 'table_close') tableDepth--;
    if (t.type !== 'inline') continue;
    const kids = t.children ?? [];
    if (!hasCommentTokens(kids)) continue;
    if (!current) throw new Error('comments: inline token outside a block');

    const base = (t.map ?? current.token.map)![0] + 1;
    const lineAt = (at: number) => base + at;
    const failAt = (at: number, message: string): never => {
      throw new RenderError(file, lineAt(at), message);
    };

    const error = kids.find((c) => c.type === 'c_error');
    if (error) failAt(metaOf<ErrorMeta>(error).at, metaOf<ErrorMeta>(error).message);
    const first = kids.find((c) => c.type === 'c_hl_open' || c.type === 'c_note');
    if (tableDepth > 0 && first) failAt(metaOf<HighlightMeta | NoteMeta>(first).at, TABLE_MESSAGE);

    const paragraph = tokens[i - 1]?.type === 'paragraph_open' && tokens[i - 1].level === 0 ? tokens[i - 1] : null;
    const out: Token[] = [];
    const threads: { id: string; notes: NoteParts[]; md: string; hl?: Token; hlText?: string; firstAt: number }[] = [];
    let openHl: Token | null = null; // the last c_hl_open
    let openHlKid = -1; // its index in kids
    let closedHl: Token | null = null; // the highlight whose close is directly before the current token
    let closedHlText = '';

    for (let k = 0; k < kids.length; k++) {
      const c = kids[k];
      if (c.type === 'c_hl_open') {
        openHl = c;
        openHlKid = k;
        out.push(c);
      } else if (c.type === 'c_hl_close') {
        const meta = metaOf<HighlightMeta>(openHl!);
        if (kids[k + 1]?.type !== 'c_note') {
          failAt(meta.at, 'highlight has no note after it: add {>>[c{n}] {author}: {text}<<} right after the ==}');
        }
        closedHl = openHl;
        closedHlText = plainText(kids.slice(openHlKid + 1, k));
        out.push(c);
      } else if (c.type === 'c_note') {
        const id = metaOf<NoteMeta>(c).note.id;
        let end = k;
        while (end < kids.length && kids[end].type === 'c_note' && metaOf<NoteMeta>(kids[end]).note.id === id) end++;
        const run = kids.slice(k, end) as Token[];
        const notes = run.map((n) => metaOf<NoteMeta>(n).note);
        const md = run.map((n) => metaOf<NoteMeta>(n).src).join('');
        const hl = kids[k - 1]?.type === 'c_hl_close' ? closedHl : null;
        const hlText = hl ? closedHlText : undefined;
        const firstAt = metaOf<NoteMeta>(c).at;
        if (runs.has(id)) {
          const message = hl
            ? `ID ${id} names two threads: give each thread its own ID`
            : `thread ${id}'s notes are split apart: keep a thread's notes together`;
          failAt(firstAt, message);
        }
        runs.add(id);
        if (hl) metaOf<HighlightMeta>(hl).id = id;
        const tok = new state.Token('c_thread', 'span', 0);
        tok.meta = { id, notes, md } satisfies ThreadMeta;
        out.push(tok);
        threads.push({ id, notes, md, hl: hl ?? undefined, hlText, firstAt });
        k = end - 1;
        closedHl = null;
      } else {
        out.push(c);
      }
    }
    t.children = out;

    const meaningful = out.filter((c) => !(c.type === 'text' && isBlank(c.content)));
    const clineToken = paragraph && meaningful.length === 1 && meaningful[0].type === 'c_thread' ? meaningful[0] : null;
    if (clineToken) {
      current.cline = true;
      let anchor: string | undefined;
      let anchorKind: string | undefined;
      for (let b = blocks.length - 2; b >= 0 && anchor === undefined; b--) {
        if (!blocks[b].cline) {
          anchor = blocks[b].range;
          anchorKind = anchorKindOf(blocks[b].token, blocks[b - 1]?.token);
        }
      }
      if (anchor === undefined) {
        throw new RenderError(
          file,
          base,
          'block comment line has no block above it: put it after a block, or write the note inside text'
        );
      }
      paragraph!.attrSet('class', 'c-line');
      paragraph!.attrSet('data-src', current.range);
      paragraph!.attrSet('data-anchor', anchor);
      t.children = meaningful;
      const thread = threads[0];
      const { quote } = splitQuote(thread.notes[0].text);
      if (quote !== undefined) metaOf<ThreadMeta>(clineToken).quote = quote;
      const record: Thread = {
        id: thread.id,
        line: lineAt(thread.firstAt),
        kind: 'block',
        block: current.range,
        anchor,
        anchorKind,
        notes: thread.notes,
      };
      if (quote !== undefined) record.quote = quote;
      env.comments.push(record);
      continue;
    }

    for (const thread of threads) {
      const line = thread.hl ? lineAt(metaOf<HighlightMeta>(thread.hl).at) : lineAt(thread.firstAt);
      const record: Thread = {
        id: thread.id,
        line,
        kind: thread.hl ? 'inline' : 'point',
        block: current.range,
        notes: thread.notes,
      };
      if (thread.hl) record.highlight = thread.hlText;
      env.comments.push(record);
    }
  }
}
