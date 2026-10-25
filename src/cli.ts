// The margent CLI (spec R4): open, check, export, --version. Built into dist/cli.js.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, type Stats } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { VERSION } from './version.js';
import { displayPath, findDocsRoot } from './render/root.js';
import { renderDoc } from './render/page.js';
import {
  cacheDir,
  htmlUnder,
  markdownUnder,
  renderOne,
  renderSet,
  type DocSeed,
  type RenderedFile,
  type RenderSet,
} from './cli/collect.js';
import { openInBrowser } from './cli/opener.js';
import { runIslandPages, type IslandPage } from './cli/islands-run.js';
import { commentsReport } from './cli/comments.js';
import { commandDoctor } from './cli/doctor.js';
import { linkProblems } from './cli/links.js';
import { cleanSource } from './comments/clean.js';
import { startServer } from './serve/server.js';

const USAGE = `usage:
  margent open {file}
  margent check {path}
  margent doctor
  margent comments {path}
  margent export {path} --out {dir} [--md] [--clean]
  margent serve {docs root} [--port {n}] [--no-open] [--author {name}]
  margent --version`;

// Wrong arguments: printed with the usage, exit 2.
class UsageError extends Error {}

function statOrFail(target: string): Stats {
  try {
    return statSync(resolve(target));
  } catch {
    throw new Error(`no such file or folder: ${target}`);
  }
}

// The absolute path of a markdown file argument.
function markdownFile(target: string): string {
  const file = resolve(target);
  if (!statOrFail(target).isFile() || !file.endsWith('.md')) throw new Error(`not a markdown file: ${target}`);
  return file;
}

// Renders a target. A folder renders every .md under it, each with its own docs root. A file renders itself and its
// linked closure. outFileFor gets the doc and its base: the folder for a folder, the docs root for a file.
function renderTarget(target: string, outFileFor: (file: string, base: string) => string): RenderSet {
  const path = resolve(target);
  if (statOrFail(target).isDirectory()) {
    const files = markdownUnder(path);
    if (files.length === 0) {
      throw new Error(`no .md files under ${target} (node_modules, dot-folders and gitignored files are skipped)`);
    }
    const seeds: DocSeed[] = files.map((file) => ({ file, root: findDocsRoot(file) }));
    return renderSet(seeds, { follow: false, outFileFor: (file) => outFileFor(file, path) });
  }
  const file = markdownFile(target);
  const root = findDocsRoot(file);
  return renderSet([{ file, root }], { follow: true, outFileFor });
}

// Prints every render error to stderr. Returns false when there were any, so the caller writes nothing.
function reportErrors(set: RenderSet): boolean {
  for (const e of set.errors) process.stderr.write(`${e.message}\n`);
  return set.errors.length === 0;
}

// Writes each file, creating its folder. Nothing is written until the caller has every text.
function writeFiles(files: { outFile: string; text: string | Buffer }[]): void {
  for (const file of files) {
    mkdirSync(dirname(file.outFile), { recursive: true });
    writeFileSync(file.outFile, file.text);
  }
}

// margent open {file}: the file and its linked closure, into the cache, then the browser.
function commandOpen(target: string): number {
  const file = markdownFile(target);
  const root = findDocsRoot(file);
  const set = renderSet([{ file, root }], {
    follow: true,
    outFileFor: (f, r) => htmlUnder(cacheDir(r), r, f),
  });
  if (!reportErrors(set)) return 1;
  writeFiles(set.docs.map((doc) => ({ outFile: doc.outFile, text: doc.rendered.html })));
  // The seed is rendered first, and with no errors every doc rendered, so docs[0] is the page for `file`.
  const page = set.docs[0].outFile;
  try {
    openInBrowser(page);
  } catch (err) {
    process.stderr.write(`margent: ${(err as Error).message}\n`);
    return 1;
  }
  process.stdout.write(`${page}\n`);
  return 0;
}

// The flags of `export`: --md writes markdown instead of pages, --clean strips the comments (and with --md, the islands).
interface ExportMode {
  md: boolean;
  clean: boolean;
}

// What one doc exports as. A page is rendered from the cleaned source with --clean, so the stripping is the same for
// both forms. --md without --clean copies the source bytes.
function exportText(doc: RenderedFile, mode: ExportMode): string | Buffer {
  if (mode.md && !mode.clean) return readFileSync(doc.file);
  if (!mode.md && !mode.clean) return doc.rendered.html;
  const cleaned = cleanSource(readFileSync(doc.file, 'utf8'), doc.rendered.comments, doc.rendered.islands, {
    islandMarkup: mode.md,
  });
  if (mode.md) return cleaned;
  return renderDoc({ file: doc.file, source: cleaned, root: doc.root, outFile: doc.outFile }).html;
}

// margent export {path} --out {dir}: as open, without the browser. A folder exports every .md under it.
// With --md the files are .md at the same relative paths.
function commandExport(target: string, outArg: string, mode: ExportMode): number {
  const out = resolve(outArg);
  const outFileFor = mode.md
    ? (file: string, base: string): string => join(out, relative(base, file))
    : (file: string, base: string): string => htmlUnder(out, base, file);
  const set = renderTarget(target, outFileFor);
  if (!reportErrors(set)) return 1;
  // Every text is made before anything is written, so a failing clean leaves the output folder as it was.
  const files = set.docs.map((doc) => ({ outFile: doc.outFile, text: exportText(doc, mode) }));
  writeFiles(files);
  for (const file of files) process.stdout.write(`${file.outFile}\n`);
  return 0;
}

// margent comments {path}: the threads of the docs check walks (spec R8). Malformed markup exits 1, with no thread list.
function commandComments(target: string): number {
  // In memory, as check does: the sibling .html is only named here, and nothing is written.
  const set = renderTarget(target, (file) => file.replace(/\.md$/, '.html'));
  if (!reportErrors(set)) return 1;
  process.stdout.write(commentsReport(set.docs));
  return 0;
}

// Runs the islands of the given docs in one headless Chrome. Each doc is rendered again into a temp dir, because the
// pages are only needed for this run. The dir is removed afterwards.
async function runIslands(docs: RenderedFile[]): Promise<string[]> {
  const dir = mkdtempSync(join(tmpdir(), 'margent-check-'));
  try {
    const pages: IslandPage[] = docs.map((doc, i) => {
      const html = join(dir, `${i}.html`);
      const rendered = renderOne(doc.file, doc.root, html);
      writeFileSync(html, rendered.html);
      return { file: displayPath(doc.file), html, islands: rendered.islands };
    });
    return await runIslandPages(pages);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Problem lines in one order: by file path, then by line (a stable sort, so equal keys keep their order). Render errors
// and island problems come from different passes, and this keeps the order that check printed before M5.
function sortProblems(lines: string[]): string[] {
  const keyOf = (line: string): { file: string; line: number } => {
    const m = /^(.*?):(\d+): /.exec(line);
    if (!m) throw new Error(`check: a problem line has no file:line prefix: ${line}`);
    return { file: m[1], line: Number(m[2]) };
  };
  const keyed = lines.map((text) => ({ text, key: keyOf(text) }));
  keyed.sort((a, b) => {
    if (a.key.file !== b.key.file) return a.key.file < b.key.file ? -1 : 1;
    return a.key.line - b.key.line;
  });
  return keyed.map((k) => k.text);
}

// margent check {path}: renders in memory, then runs every island headless. Exit 1 on any problem.
async function commandCheck(target: string): Promise<number> {
  // In memory: the sibling .html is only named here, for the image paths, and nothing is written there.
  const set = renderTarget(target, (file) => file.replace(/\.md$/, '.html'));

  const problems = set.errors.map((e) => e.message);
  problems.push(...linkProblems(set.docs));
  const withIslands = set.docs.filter((d) => d.rendered.islands.length > 0);
  if (withIslands.length > 0) problems.push(...(await runIslands(withIslands)));

  if (problems.length > 0) {
    for (const line of sortProblems(problems)) process.stdout.write(`${line}\n`);
    return 1;
  }
  const islands = set.docs.reduce((n, d) => n + d.rendered.islands.length, 0);
  process.stdout.write(`ok ${set.docs.length} docs, ${islands} islands\n`);
  return 0;
}

// Arguments of `export`: one {path}, --out {dir} or --out={dir}, and the flags --md and --clean.
function parseExport(rest: string[]): { target: string; out: string; mode: ExportMode } {
  let target: string | undefined;
  let out: string | undefined;
  const mode: ExportMode = { md: false, clean: false };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--out') {
      const value = rest[++i];
      if (value === undefined || value.startsWith('--')) throw new UsageError('--out needs a folder');
      out = value;
    } else if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length);
    } else if (arg === '--md') {
      mode.md = true;
    } else if (arg === '--clean') {
      mode.clean = true;
    } else if (arg.startsWith('-')) {
      throw new UsageError(`unknown option ${arg}`);
    } else if (target === undefined) {
      target = arg;
    } else {
      throw new UsageError(`unexpected argument ${arg}`);
    }
  }
  if (target === undefined) throw new UsageError('export needs a {path}');
  if (out === undefined || out === '') throw new UsageError('export needs --out {dir}');
  return { target, out, mode };
}

// Arguments of `serve`: one {docs root}, --port {n} or --port={n}, --no-open, and --author {name} or --author={name}.
function parseServe(rest: string[]): {
  target: string;
  port: number | undefined;
  open: boolean;
  author: string | undefined;
} {
  let target: string | undefined;
  let port: number | undefined;
  let open = true;
  let author: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--no-open') {
      open = false;
    } else if (arg === '--author' || arg.startsWith('--author=')) {
      const value = arg === '--author' ? rest[++i] : arg.slice('--author='.length);
      if (value === undefined || value.startsWith('--') || value.trim() === '') {
        throw new UsageError('--author needs a name');
      }
      // The name is written into each note's head, where ':' and ']' end the author and '<<}' ends the note.
      if (/[:\]\r\n]/.test(value) || value.includes('<<}')) {
        throw new UsageError(`--author name "${value}" must not hold ':', ']', a line break or '<<}'`);
      }
      author = value;
    } else if (arg === '--port' || arg.startsWith('--port=')) {
      const value = arg === '--port' ? rest[++i] : arg.slice('--port='.length);
      if (value === undefined || value.startsWith('--')) throw new UsageError('--port needs a port number');
      if (!/^\d+$/.test(value) || Number(value) > 65535) {
        throw new UsageError(`--port needs a port number from 0 to 65535, got "${value}"`);
      }
      port = Number(value);
    } else if (arg.startsWith('-')) {
      throw new UsageError(`unknown option ${arg}`);
    } else if (target === undefined) {
      target = arg;
    } else {
      throw new UsageError(`unexpected argument ${arg}`);
    }
  }
  if (target === undefined) throw new UsageError('serve needs a {docs root}');
  return { target, port, open, author };
}

// margent serve {docs root}: a local server over the folder, until SIGINT or SIGTERM (spec R1).
async function commandServe(rest: string[]): Promise<number> {
  const { target, port, open, author } = parseServe(rest);
  const root = resolve(target);
  if (!statOrFail(target).isDirectory()) throw new Error(`not a folder: ${target}`);
  const handle = await startServer({ root, port, author });
  let stop = (): void => {};
  const stopped = new Promise<number>((done) => {
    stop = (): void => {
      handle.close().then(
        () => done(0),
        (err: unknown) => {
          process.stderr.write(`margent: ${err instanceof Error ? err.message : String(err)}\n`);
          done(1);
        }
      );
    };
  });
  // The handlers go in before the serving line: whoever reads that line may stop the server at once.
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.stdout.write(`margent serving ${root} at ${handle.url}\n`);
  if (open) {
    try {
      openInBrowser(handle.url);
    } catch (err) {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      await handle.close();
      throw err;
    }
  }
  return stopped;
}

// Arguments of a command that takes exactly one {path}.
function singlePath(command: string, rest: string[]): string {
  if (rest.length !== 1 || rest[0].startsWith('-')) throw new UsageError(`${command} needs exactly one {path}`);
  return rest[0];
}

async function main(argv: string[]): Promise<number> {
  if (argv.length === 1 && argv[0] === '--version') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
    case '--help':
    case '-h':
      throw new UsageError('');
    case 'open':
      return commandOpen(singlePath(command, rest));
    case 'check':
      return commandCheck(singlePath(command, rest));
    case 'comments':
      return commandComments(singlePath(command, rest));
    case 'doctor':
      if (rest.length > 0) throw new UsageError('doctor takes no arguments');
      return commandDoctor();
    case 'export': {
      const { target, out, mode } = parseExport(rest);
      return commandExport(target, out, mode);
    }
    case 'serve':
      return commandServe(rest);
    default:
      throw new UsageError(`unknown command "${command}"`);
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    if (err instanceof UsageError) {
      if (err.message !== '') process.stderr.write(`margent: ${err.message}\n`);
      process.stderr.write(`${USAGE}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`margent: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
);
