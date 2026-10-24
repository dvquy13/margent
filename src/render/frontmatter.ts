import YAML from 'yaml';
import { RenderError } from '../errors.js';
import { displayPath } from './root.js';

export interface DocMeta {
  title?: string;
  status?: string;
  updated?: string;
  version?: string;
}

const KEYS = ['title', 'status', 'updated', 'version'] as const;

// `meta` is the YAML between the two `---` lines. `openLine` is the 1-based line of the opening `---`,
// so content line k is file line openLine + k.
// The failsafe schema keeps every scalar as written: `2026-10-23` stays a string, and so does `1.10`.
export function parseFrontMatter(meta: string, file: string, openLine: number): DocMeta {
  const where = displayPath(file);
  const doc = YAML.parseDocument(meta, { schema: 'failsafe' });
  if (doc.errors.length > 0) {
    const err = doc.errors[0];
    const pos = err.linePos?.[0];
    const first = err.message.split('\n')[0];
    const inner = pos?.line ?? 1;
    // no position: keep the library's first line whole rather than hide it
    if (!pos) throw new RenderError(where, openLine + inner, `invalid frontmatter YAML: ${first}`);
    // the file:line prefix already says the line, so drop yaml's " at line L, column C:" tail
    const reason = first.replace(/ at line \d+, column \d+:$/, '');
    // an unclosed quote or bracket is reported where yaml gave up, on a later line, so quoting that line would mislead
    if (err.code === 'MISSING_CHAR' || err.code === 'BAD_INDENT') {
      throw new RenderError(where, openLine + inner, `invalid frontmatter YAML: ${reason}`);
    }
    const source = (meta.split('\n')[inner - 1] ?? '').trim();
    const quoted = source.length > 80 ? `${source.slice(0, 80)}…` : source;
    // an unquoted value with ": " inside parses as a nested mapping, so the fix is quoting it
    const unquotedColon = reason === 'Nested mappings are not allowed in compact mappings' && /:\s.*:\s/.test(`${source} `);
    const hint = unquotedColon ? '. Quote the value: it contains ": "' : '';
    throw new RenderError(where, openLine + inner, `invalid frontmatter YAML at column ${pos.col}: ${reason} in "${quoted}"${hint}`);
  }
  const value: unknown = doc.toJS();
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new RenderError(where, openLine, 'frontmatter must be a mapping of key: value lines');
  }
  const record = value as Record<string, unknown>;
  const out: DocMeta = {};
  const lines = meta.split('\n');
  for (const key of KEYS) {
    const v = record[key];
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') {
      const idx = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
      throw new RenderError(where, openLine + idx + 1, `frontmatter key "${key}" must be a single value`);
    }
    const text = String(v);
    if (text === '') continue;
    out[key] = text;
  }
  return out;
}
