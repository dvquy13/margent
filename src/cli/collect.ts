// Renders the docs that `open`, `export` and `check` work on (spec R4), in memory. Nothing is written here.
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { RenderError } from '../errors.js';
import { renderDoc, type RenderedDoc } from '../render/page.js';

export interface DocSeed {
  file: string; // absolute path of the .md
  root: string; // absolute docs root (findDocsRoot)
}

export interface RenderedFile extends DocSeed {
  outFile: string; // the .html this render is for; its image paths are relative to it
  rendered: RenderedDoc;
}

export interface RenderSet {
  docs: RenderedFile[]; // in discovery order
  errors: RenderError[]; // one per doc that failed; the other docs still render
}

export interface RenderOptions {
  follow: boolean; // true: also render every .md a rendered doc links to, breadth-first, each once
  outFileFor: (file: string, root: string) => string;
}

// Renders the seeds (and, when following, their linked docs). A RenderError is recorded and the walk goes on;
// any other exception is a bug or an I/O failure and propagates.
export function renderSet(seeds: DocSeed[], opts: RenderOptions): RenderSet {
  const queue: DocSeed[] = [...seeds];
  const seen = new Set(seeds.map((s) => s.file));
  const set: RenderSet = { docs: [], errors: [] };
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const { file, root } = next;
    const outFile = opts.outFileFor(file, root);
    try {
      const rendered = renderOne(file, root, outFile);
      set.docs.push({ file, root, outFile, rendered });
      if (opts.follow) {
        for (const link of rendered.links) {
          if (seen.has(link)) continue;
          seen.add(link);
          queue.push({ file: link, root });
        }
      }
    } catch (err) {
      if (!(err instanceof RenderError)) throw err;
      set.errors.push(err);
    }
  }
  return set;
}

// The absolute paths git ignores under a folder: each ignored file, and each ignored folder as a whole (`--directory`).
// Null when there is nothing to honor: the folder is not in a git repository, git is not installed, or the folder
// itself is ignored (the caller named it, so the walk goes through it). Any other git failure throws.
function gitIgnored(folder: string): Set<string> | null {
  const git: ExecFileSyncOptions = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 };
  let listing: string;
  try {
    listing = String(execFileSync(
      'git',
      ['-C', folder, 'ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory'],
      git
    ));
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { status?: number | null; stderr?: string };
    if (e.code === 'ENOENT') return null;
    if (e.status === 128 && String(e.stderr).includes('not a git repository')) return null;
    throw new Error(`git ls-files failed in ${folder}: ${String(e.stderr || e.message).trim()}`);
  }
  // check-ignore exits 0 when the path is ignored and 1 when it is not. --no-index matches patterns even for a folder
  // that holds tracked files.
  try {
    execFileSync('git', ['-C', folder, 'check-ignore', '--no-index', '-q', '--', `${realpathSync(folder)}/`], git);
    return null;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { status?: number | null; stderr?: string };
    if (e.status !== 1) throw new Error(`git check-ignore failed in ${folder}: ${String(e.stderr || e.message).trim()}`);
  }
  const ignored = new Set<string>();
  for (const entry of listing.split('\0')) {
    if (entry !== '') ignored.add(resolve(folder, entry.replace(/\/$/, '')));
  }
  return ignored;
}

// Every .md under a folder, recursively, skipping node_modules, dot-folders and the files and folders git ignores
// (see gitIgnored). Sorted by path.
export function markdownUnder(folder: string): string[] {
  const ignored = gitIgnored(folder);
  const out: string[] = [];
  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    );
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (ignored?.has(resolve(full))) continue;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(full);
      }
    }
  };
  walk(folder);
  return out;
}

// The margent cache folder: ${XDG_CACHE_HOME or ~/.cache}/margent. `margent doctor` checks it is writable.
export function cacheRoot(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'margent');
}

// `open` writes here (spec R4 "Cache for open"): {cacheRoot}/{sha1 of the root path}.
export function cacheDir(root: string): string {
  return join(cacheRoot(), createHash('sha1').update(root).digest('hex'));
}

// The .html path for a .md, under `dir`, at the same path relative to `base`.
export function htmlUnder(dir: string, base: string, file: string): string {
  return join(dir, relative(base, file).replace(/\.md$/, '.html'));
}

// Renders one doc for the page at outFile. Errors propagate as RenderError.
export function renderOne(file: string, root: string, outFile: string): RenderedDoc {
  return renderDoc({ file, source: readFileSync(file, 'utf8'), root, outFile });
}
