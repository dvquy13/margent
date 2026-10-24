// Island markup in markdown (spec R3.1, R3.4, R3.6; contract v1). A markdown-it core rule turns
//   <!-- island {name} [key=value ...] -->   directly above a GFM table, and
//   ```island {name}                         a fence holding YAML
// into one <agent-island> element: its JSON data, its row lines, and the fallback (the table, or the YAML source).
// The island DOM is the one in docs/architecture.md ("Island DOM").
import type { StateCore, Token } from 'markdown-it';
import YAML from 'yaml';
import { RenderError } from '../errors.js';
import { displayPath } from '../render/root.js';
import { loadIsland, type IslandKind, type ModuleSource, type TableData } from './validate.js';

export interface IslandRecord {
  name: string;
  kind: IslandKind;
  line: number; // 1-based line of the marker or the fence opening
  data: unknown; // table: { columns, rows, attrs }; yaml: the parsed value
  rowLines: number[]; // table: 1-based source line of each row; yaml: empty
  module: ModuleSource;
}

// The parts of the render env this rule reads.
interface IslandEnv {
  [key: string | symbol]: unknown; // markdown-it's Env is an index-signature type
  file: string; // absolute path of the .md
  root: string; // absolute docs root
  lines: string[];
  islands: IslandRecord[];
}

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const MARKER_RE = /^<!--\s*island\s+(\S+)((?:\s+[^\s=]+=\S+)*)\s*-->$/;
const ATTR_RE = /([^\s=]+)=(\S+)/g;
const ATTR_NAME_RE = /^[a-z][a-z0-9_-]*$/i;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Column key (spec R3.4): lowercase, every run of characters outside letters and digits becomes "_", ends trimmed.
export function columnKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

// One GFM row on unescaped pipes, with \| read as |. Cells are trimmed.
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (c === '|') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseAttrs(text: string, file: string, line: number): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of text.matchAll(ATTR_RE)) {
    const [, key, value] = m;
    if (!ATTR_NAME_RE.test(key)) {
      throw new RenderError(file, line, `island attribute name "${key}" must be letters, digits, "-" or "_"`);
    }
    if (key in attrs) throw new RenderError(file, line, `island attribute "${key}" is given twice`);
    attrs[key] = value;
  }
  return attrs;
}

// Column keys and rows of a table. Header and row lines are 0-based indexes into the source.
function tableData(tokens: Token[], lines: string[], file: string): { data: TableData; rowLines: number[] } {
  const open = tokens[0];
  const headerLine = open.map![0];
  const labels = splitRow(lines[headerLine]);
  const columns = labels.map((label, i) => {
    const key = columnKey(label);
    if (key === '') {
      throw new RenderError(file, headerLine + 1, `column ${i + 1} ("${label}") has no name to derive a key from`);
    }
    return { key, label };
  });
  const seen = new Set<string>();
  for (const c of columns) {
    if (seen.has(c.key)) {
      throw new RenderError(file, headerLine + 1, `two columns map to the key "${c.key}"`);
    }
    seen.add(c.key);
  }

  const rowLines: number[] = [];
  const rows: Record<string, string>[] = [];
  let inBody = false;
  for (const t of tokens) {
    if (t.type === 'tbody_open') inBody = true;
    if (t.type === 'tbody_close') inBody = false;
    if (inBody && t.type === 'tr_open') {
      const cells = splitRow(lines[t.map![0]]);
      const row: Record<string, string> = {};
      // GFM: a short row is padded with empty cells, and cells past the header are ignored, as the table renders them.
      columns.forEach((c, i) => {
        row[c.key] = cells[i] ?? '';
      });
      rows.push(row);
      rowLines.push(t.map![0] + 1);
    }
  }
  return { data: { columns, rows, attrs: {} }, rowLines };
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// The island element. `fallback` is the HTML shown without JS, in errors, and in print.
function islandElement(rec: IslandRecord, range: string, fallback: string): string {
  const payload = jsonForScript({ data: rec.data, rowLines: rec.rowLines });
  return (
    `<agent-island name="${rec.name}" data-kind="${rec.kind}" data-src="${range}">\n` +
    `<script type="application/json" class="island-data">${payload}</script>\n` +
    `<div class="island-fallback">${fallback}</div>\n` +
    `</agent-island>\n`
  );
}

function htmlBlock(state: StateCore, content: string, map: [number, number]): Token {
  const tok = new state.Token('html_block', '', 0);
  tok.content = content;
  tok.block = true;
  tok.map = map;
  // Already complete HTML: source-map and figure rules skip it, and the renderer emits it verbatim.
  tok.meta = { rawBlock: true };
  return tok;
}

function islandOpen(text: string): boolean {
  return /^<!--\s*island\b/.test(text);
}

function isIslandFence(info: string): boolean {
  return /^island(\s|$)/.test(info.trim());
}

// Core rule. Runs after the figure and image rules and before source maps, so the tables it consumes are not
// given a data-src of their own.
export function islandRule(state: StateCore): void {
  const env = state.env as unknown as IslandEnv;
  const file = displayPath(env.file);
  const tokens = state.tokens;
  const out: Token[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t.type === 'html_block' && islandOpen(t.content)) {
      const line = t.map![0] + 1;
      if (t.level !== 0) throw new RenderError(file, line, 'an island marker must be a top-level block, not inside a list or quote');
      const m = t.content.trim().match(MARKER_RE);
      if (!m) throw new RenderError(file, line, 'malformed island marker; expected <!-- island {name} [key=value ...] -->');
      const name = m[1];
      if (!NAME_RE.test(name)) {
        throw new RenderError(file, line, `island name "${name}" must be lowercase letters, digits and dashes`);
      }
      const next = tokens[i + 1];
      if (!next || next.type !== 'table_open' || next.level !== 0 || next.map![0] !== t.map![1]) {
        throw new RenderError(file, line, `island "${name}" marker must sit directly above a table (no blank line)`);
      }
      let close = i + 1;
      while (tokens[close].type !== 'table_close') close++;

      const parsed = tableData(tokens.slice(i + 1, close + 1), env.lines, file);
      parsed.data.attrs = parseAttrs(m[2] ?? '', file, line);
      const rec = { name, kind: 'table' as const, line, data: parsed.data, rowLines: parsed.rowLines };
      const island: IslandRecord = { ...rec, ...loadIsland(rec, env.file, env.root) };
      env.islands.push(island);

      // The fallback is the table as the renderer shows it. Its wrapper carries no data-src: the island does.
      const fallback = state.md.renderer.render(tokens.slice(i + 1, close + 1), state.md.options, env);
      const range = `${line}-${next.map![1]}`;
      out.push(htmlBlock(state, islandElement(island, range, fallback), [t.map![0], next.map![1]]));
      i = close;
      continue;
    }

    if (t.type === 'fence' && isIslandFence(t.info)) {
      const line = t.map![0] + 1;
      if (t.level !== 0) throw new RenderError(file, line, 'an island fence must be a top-level block, not inside a list or quote');
      const parts = t.info.trim().split(/\s+/);
      if (parts.length !== 2) throw new RenderError(file, line, `island fence must read "island {name}", got "${t.info.trim()}"`);
      const name = parts[1];
      if (!NAME_RE.test(name)) {
        throw new RenderError(file, line, `island name "${name}" must be lowercase letters, digits and dashes`);
      }
      // Comment markup in island YAML is an error at its own line (spec M3 R3.5). Content line i is source line map+2+i.
      const markup = t.content.split('\n').findIndex((l) => /\{==|\{>>/.test(l));
      if (markup >= 0) {
        throw new RenderError(
          file,
          t.map![0] + 2 + markup,
          'comment markup cannot go in island YAML, because island data is read from it: add a block comment line after the island instead'
        );
      }
      const doc = YAML.parseDocument(t.content);
      if (doc.errors.length > 0) {
        const e = doc.errors[0];
        const inner = e.linePos?.[0]?.line ?? 1;
        const reason = e.message.split('\n')[0].replace(/ at line \d+, column \d+:?$/, '');
        throw new RenderError(file, line + inner, `invalid YAML in island "${name}": ${reason}`);
      }
      const value: unknown = doc.toJS();
      if (value === null || typeof value !== 'object') {
        throw new RenderError(file, line, `island "${name}" YAML must be a mapping or a sequence`);
      }
      const rec = { name, kind: 'yaml' as const, line, data: value, rowLines: [] };
      const island: IslandRecord = { ...rec, ...loadIsland(rec, env.file, env.root) };
      env.islands.push(island);

      const fallback = `<pre>${escapeHtml(t.content)}</pre>`;
      out.push(htmlBlock(state, islandElement(island, `${line}-${t.map![1]}`, fallback), t.map as [number, number]));
      continue;
    }

    out.push(t);
  }
  state.tokens = out;
}
