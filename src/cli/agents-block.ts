// The margent block that `init` writes into AGENTS.md / CLAUDE.md and `teardown` removes. Pure text functions, plus the
// git and folder lookups that choose which files they touch.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RenderError } from '../errors.js';
import { displayPath } from '../render/root.js';

// The block text. Its lines are joined with '\n'; each file gets its own line endings when it is written.
export const BLOCK = [
  '<!-- margent:start -->',
  '## margent docs',
  '',
  'The markdown docs here render into pages with [margent](https://github.com/dvquy13/margent). The `.md` is the only copy: renders are never committed.',
  '',
  '- After editing a doc, run `npx -y margent check {file}` and fix every `file:line` it prints.',
  "- `{==text==}` and `{>>[c1] Name: note<<}` are review comments. Keep their markup. To answer one, add `{>>[c1] {your name}: answer<<}` right after the thread's last note, with the same ID. Don't delete a thread: the person who opened it resolves it.",
  '- `<!-- island {name} -->` above a table draws it as a visual with `islands/{name}.island.js`. Keep the marker and the wording of the cells it reads.',
  '- Full workflow: `npx skills add dvquy13/margent`.',
  '<!-- margent:end -->',
].join('\n');

const START = '<!-- margent:start -->';
const END = '<!-- margent:end -->';
const AGENT_FILES = ['AGENTS.md', 'CLAUDE.md'];

// One line of a file: its text without the terminator, and the terminator ('\r\n', '\n' or '' for a last line with none).
interface Line {
  body: string;
  eol: string;
}

// The lines of a file. Splits on '\n' only, as the renderer numbers lines.
function splitLines(source: string): Line[] {
  const lines: Line[] = [];
  let pos = 0;
  while (pos < source.length) {
    const nl = source.indexOf('\n', pos);
    if (nl === -1) {
      lines.push({ body: source.slice(pos), eol: '' });
      break;
    }
    const crlf = nl > pos && source[nl - 1] === '\r';
    lines.push({ body: source.slice(pos, crlf ? nl - 1 : nl), eol: crlf ? '\r\n' : '\n' });
    pos = nl + 1;
  }
  return lines;
}

// The text of some lines, terminators included.
function render(lines: Line[]): string {
  return lines.map((line) => line.body + line.eol).join('');
}

// The 0-based index of the start and end marker lines of the block, both inclusive, or null when the file has no block.
// Malformed markers throw a RenderError at the offending line.
function findBlock(lines: Line[], file: string): { start: number; end: number } | null {
  let first: number | undefined;
  let open: number | undefined;
  let span: { start: number; end: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].body.trim();
    if (text === START) {
      if (first !== undefined) {
        throw new RenderError(displayPath(file), i + 1, `a second margent block (the first starts at line ${first + 1})`);
      }
      first = i;
      open = i;
    } else if (text === END) {
      if (open === undefined) throw new RenderError(displayPath(file), i + 1, 'margent:end with no margent:start');
      span = { start: open, end: i };
      open = undefined;
    }
  }
  if (open !== undefined) throw new RenderError(displayPath(file), open + 1, 'margent:start with no margent:end');
  return span;
}

// Whether a line is blank: only whitespace, or nothing.
function isBlank(line: Line): boolean {
  return line.body.trim() === '';
}

// The result of init on one file: its new text, and what changed.
export interface InitEdit {
  text: string;
  change: 'added' | 'updated' | 'unchanged';
}

// The text of `source` with the block written in: replaced in place when there is one, appended after a blank line
// otherwise. `file` is named in the error for a malformed block. Line endings follow the file (CRLF if it has CRLF).
export function applyBlock(source: string, file: string): InitEdit {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = splitLines(source);
  const span = findBlock(lines, file);
  if (span) {
    // The block keeps the end marker's terminator, so a file whose last line has none still ends without one.
    const blockLines = BLOCK.split('\n').map((body, i, all): Line => ({
      body,
      eol: i === all.length - 1 ? lines[span.end].eol : eol,
    }));
    const text = render([...lines.slice(0, span.start), ...blockLines, ...lines.slice(span.end + 1)]);
    return { text, change: text === source ? 'unchanged' : 'updated' };
  }
  const blockText = BLOCK.split('\n').map((line) => line + eol).join('');
  if (source === '') return { text: blockText, change: 'added' };
  const base = source.endsWith('\n') ? source : source + eol;
  return { text: `${base}${eol}${blockText}`, change: 'added' };
}

// The text of `source` with its block removed, or null when it has none. When the block is the last thing in the file,
// the blank line before it goes too, so applyBlock and removeBlock round-trip.
export function removeBlock(source: string, file: string): string | null {
  const lines = splitLines(source);
  const span = findBlock(lines, file);
  if (!span) return null;
  let from = span.start;
  if (span.end === lines.length - 1 && from > 0 && isBlank(lines[from - 1])) from -= 1;
  return render([...lines.slice(0, from), ...lines.slice(span.end + 1)]);
}

// The git root of the repository that holds `start`, or null when `start` is not in one. Other git failures throw.
export function gitRoot(start: string): string | null {
  try {
    const top = execFileSync('git', ['-C', start, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return realpathSync(top.trim());
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { status?: number | null; stderr?: string };
    if (e.status === 128 && String(e.stderr).includes('not a git repository')) return null;
    throw new Error(`git rev-parse failed in ${start}: ${String(e.stderr || e.message).trim()}`);
  }
}

// The folders from `start` up to `root`, inclusive, nearest first. Never above `root`.
export function walkFolders(start: string, root: string): string[] {
  const folders: string[] = [];
  let dir = start;
  for (;;) {
    folders.push(dir);
    if (dir === root) return folders;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`${start} is not inside ${root}`);
    dir = parent;
  }
}

// Whether a path is an existing regular file (following symlinks).
function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

// The AGENTS.md and CLAUDE.md files that exist in the given folders, in folder order.
export function agentsFilesOn(folders: string[]): string[] {
  return folders.flatMap((folder) => AGENT_FILES.map((name) => join(folder, name))).filter(isFile);
}

// Whether CLAUDE.md imports AGENTS.md, with a line that is exactly `@AGENTS.md`.
function importsAgents(source: string): boolean {
  return source.split('\n').some((line) => line.trim() === '@AGENTS.md');
}

// The files init writes. The nearest folder on the walk that holds an AGENTS.md or CLAUDE.md gets the write. A folder with
// both gets AGENTS.md, and CLAUDE.md too unless it imports AGENTS.md. When no folder has one, AGENTS.md at the git root.
export function initTargets(folders: string[], root: string): string[] {
  for (const folder of folders) {
    const agents = join(folder, 'AGENTS.md');
    const claude = join(folder, 'CLAUDE.md');
    if (isFile(agents) && isFile(claude)) return importsAgents(readFileSync(claude, 'utf8')) ? [agents] : [agents, claude];
    if (isFile(agents)) return [agents];
    if (isFile(claude)) return [claude];
  }
  return [join(root, 'AGENTS.md')];
}
