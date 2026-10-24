// Save core for `margent serve` (spec R6.2 to R6.5): hashing, splicing, validation and the atomic write.
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { RenderError } from '../errors.js';
import { renderDoc } from '../render/page.js';

// SHA-256 hex of the bytes. The save path compares it with the hash the page was rendered from (spec R6.2).
export function hash(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// One line of a file: its text without the terminator, and the terminator ('\r\n', '\n' or '' for a last line
// with no final newline). Lines split on '\n' only, the same way the renderer numbers them (spec R1.3).
interface Line {
  body: string;
  eol: string;
}

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

// The file's own line ending: CRLF when its first line break is CRLF, LF otherwise (spec R6.4).
function fileEol(source: string): string {
  const nl = source.indexOf('\n');
  return nl > 0 && source[nl - 1] === '\r' ? '\r\n' : '\n';
}

function render(lines: Line[]): string {
  return lines.map((line) => line.body + line.eol).join('');
}

// Replaces the 1-based inclusive lines `range` of `source` with `text`, under the splice rules in `docs/architecture.md` (Serve).
export function splice(source: string, range: [number, number], text: string): string {
  const lines = splitLines(source);
  const [start, end] = range;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > lines.length) {
    throw new Error(`splice range ${start}-${end} is outside the file, which has ${lines.length} lines`);
  }

  const eol = fileEol(source);
  const hadFinalNewline = lines.length === 0 || lines[lines.length - 1].eol !== '';
  // A single trailing newline on `text` is ignored, so "x" and "x\n" are the same replacement. `text` is LF by
  // contract; a CRLF in it is normalised so that no line gets a doubled CR.
  const body = text.replace(/\r\n/g, '\n').replace(/\n$/, '');
  let prefix = lines.slice(0, start - 1);
  let suffix = lines.slice(end);

  if (body === '') {
    // Deleting a block. Keep the seam from doubling or dangling a blank line (spec R6.4).
    const blank = (line: Line): boolean => line.body.trim() === '';
    if (prefix.length > 0 && suffix.length > 0) {
      if (blank(prefix[prefix.length - 1]) && blank(suffix[0])) suffix = suffix.slice(1);
    } else if (prefix.length > 0) {
      if (blank(prefix[prefix.length - 1])) prefix = prefix.slice(0, -1);
    } else if (suffix.length > 0 && blank(suffix[0])) {
      suffix = suffix.slice(1);
    }
  } else {
    const inserted = body.split('\n').map((line): Line => ({ body: line, eol }));
    // The range reached the last line of a file with no final newline, so the new last line has none either.
    if (!hadFinalNewline && end === lines.length) inserted[inserted.length - 1].eol = '';
    prefix = [...prefix, ...inserted];
  }

  const kept = [...prefix, ...suffix];
  // Deleting the last lines must not leave a terminator on the new last line of a file that had none.
  if (!hadFinalNewline && kept.length > 0) kept[kept.length - 1] = { body: kept[kept.length - 1].body, eol: '' };
  return render(kept);
}

// Renders `newSource` as if it were `file` and returns the errors, one per failure (spec R6.4).
export function validate(file: string, root: string, newSource: string): RenderError[] {
  try {
    renderDoc({ file, source: newSource, root, outFile: file.replace(/\.md$/, '.html') });
    return [];
  } catch (err) {
    if (err instanceof RenderError) return [err];
    throw err;
  }
}

// Writes `text` to `file` through a temp file in the same folder, then a rename (spec R6.5).
export function writeAtomic(file: string, text: string): void {
  const tmp = join(dirname(file), `.${basename(file)}.${randomBytes(8).toString('hex')}.tmp`);
  try {
    const mode = existsSync(file) ? statSync(file).mode & 0o7777 : undefined;
    writeFileSync(tmp, text, { flag: 'wx' });
    // The umask applies to new files, so the original mode is set again explicitly.
    if (mode !== undefined) chmodSync(tmp, mode);
    renameSync(tmp, file);
  } catch (err) {
    if (existsSync(tmp)) rmSync(tmp, { force: true });
    throw err;
  }
}
