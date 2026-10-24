// Strips comment markup, and with `islandMarkup` the island markup, from a doc's source (spec R9; plan "Clean"). Pure:
// text in, text out. Every byte outside a stripped span is kept, line endings included, so a CRLF file stays CRLF.
import { splice } from '../serve/splice.js';
import { stripAll, type Thread } from './syntax.js';

// The islands of a doc as the renderer reports them: kind 'table' (the marker's line) or 'yaml' (the fence's line).
export interface IslandRef {
  name: string;
  kind: string;
  line: number; // 1-based
}

export interface CleanOptions {
  islandMarkup: boolean; // true: also remove island markers and turn island fences into plain yaml fences
}

// One edit, located by the 1-based line it starts at. Edits run bottom-up, so each one sees the lines above it as the
// source has them.
type Edit =
  | { op: 'strip'; line: number; end: number } // a block holding inline or point threads: its markup goes, its text stays
  | { op: 'delete'; line: number; end: number } // a block comment line, or a table island's marker line
  | { op: 'yaml'; line: number }; // a YAML island's fence: `island {name}` becomes `yaml`

// The 1-based inclusive range "start-end" that Thread.block and Thread.anchor carry.
function parseRange(range: string): [number, number] {
  const m = /^(\d+)-(\d+)$/.exec(range);
  if (!m) throw new Error(`clean: ${JSON.stringify(range)} is not a line range`);
  return [Number(m[1]), Number(m[2])];
}

// The byte span of lines start..end in text, without the line break that ends line end.
function lineSpan(text: string, start: number, end: number): [number, number] {
  const pieces = text.split('\n');
  let from = 0;
  for (let i = 0; i < start - 1; i++) from += pieces[i].length + 1;
  let to = from;
  for (let i = start - 1; i < end; i++) to += pieces[i].length + (i < end - 1 ? 1 : 0);
  // A CRLF line keeps its '\r' out of the span, so the terminator survives the edit.
  if (end < pieces.length && pieces[end - 1].endsWith('\r')) to -= 1;
  return [from, to];
}

// Strips the comment markup of `source`. A block comment line goes with splice's delete rule (no doubled blank line).
// With islandMarkup, every island marker goes and every YAML island's fence info becomes `yaml`.
export function cleanSource(source: string, threads: Thread[], islands: IslandRef[], opts: CleanOptions): string {
  const edits: Edit[] = [];
  const stripped = new Set<string>();
  for (const t of threads) {
    const [start, end] = parseRange(t.block);
    if (t.kind === 'block') {
      edits.push({ op: 'delete', line: start, end });
    } else if (!stripped.has(t.block)) {
      stripped.add(t.block);
      edits.push({ op: 'strip', line: start, end });
    }
  }
  if (opts.islandMarkup) {
    for (const island of islands) {
      if (island.kind === 'table') edits.push({ op: 'delete', line: island.line, end: island.line });
      else edits.push({ op: 'yaml', line: island.line });
    }
  }

  edits.sort((a, b) => b.line - a.line);
  let text = source;
  for (const edit of edits) {
    if (edit.op === 'delete') {
      text = splice(text, [edit.line, edit.end], '');
      continue;
    }
    const end = edit.op === 'strip' ? edit.end : edit.line;
    const [from, to] = lineSpan(text, edit.line, end);
    const span = text.slice(from, to);
    const next =
      edit.op === 'strip' ? stripAll(span) : span.replace(/^(\s*(?:`{3,}|~{3,}))\s*island\s+\S+/, '$1yaml');
    if (edit.op === 'yaml' && next === span) {
      throw new Error(`clean: the island fence at line ${edit.line} has no "island {name}" info to change`);
    }
    text = text.slice(0, from) + next + text.slice(to);
  }
  return text;
}
