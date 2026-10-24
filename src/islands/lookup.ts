// Island module lookup (spec R3.5): walk up from the doc's folder to the docs root, inclusive. The first
// islands/{name}.island.js found wins. Lowercase names and no catalog mean two candidates at one level cannot occur.
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RenderError } from '../errors.js';
import { displayPath } from '../render/root.js';

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// Absolute path of the module for island `name`, or a RenderError at the island's line when none exists.
export function findModule(name: string, docFile: string, root: string, line: number): string {
  const moduleName = `${name}.island.js`;
  let dir = dirname(docFile);
  for (;;) {
    const candidate = join(dir, 'islands', moduleName);
    if (isFile(candidate)) return candidate;
    if (dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const docFolder = displayPath(dirname(docFile));
  throw new RenderError(
    displayPath(docFile),
    line,
    `island "${name}" has no module islands/${moduleName} between ${docFolder} and the docs root`
  );
}
