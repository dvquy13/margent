import { statSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// The nearest folder, starting at the file's own folder and walking up, that contains an `islands/` folder.
// If there is none, the file's own folder, or `upper` when the walk is bounded by it (serve never walks above its root).
export function findDocsRoot(file: string, upper?: string): string {
  const own = dirname(file);
  let dir = own;
  for (;;) {
    if (isDirectory(join(dir, 'islands'))) return dir;
    if (dir === upper) return upper;
    const parent = dirname(dir);
    if (parent === dir) return own;
    dir = parent;
  }
}

// Header wordmark: the parent folder's name when the docs root is called `docs`, else the root's own name.
export function projectName(root: string): string {
  const name = basename(root);
  if (name !== 'docs') return name;
  return basename(dirname(root)) || name;
}

// Path for error messages: relative to the working directory (spec R1.7).
export function displayPath(file: string): string {
  return relative(process.cwd(), file) || '.';
}
