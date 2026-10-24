// The file watcher behind `margent serve`'s live reload (spec R7.1).
import { existsSync, readdirSync, statSync, watch, type FSWatcher } from 'node:fs';
import { join, relative } from 'node:path';

export interface TreeWatcher {
  close(): void;
}

// Calls onChange with the changed path relative to root, or null when the platform names no file. macOS and Windows
// get Node's native recursive watcher. On Linux, Node 22's recursive watcher stops reporting a file once a rename
// replaces it, which every save does (writeAtomic), so live reload died after the first save; there each folder gets
// its own watcher, which follows the folder rather than the file. Dot-folders and node_modules are not watched there:
// serve never serves them, and each folder costs one inotify watch.
export function watchTree(root: string, onChange: (rel: string | null) => void, onError: (err: Error) => void): TreeWatcher {
  if (process.platform !== 'linux') {
    const watcher = watch(root, { recursive: true }, (_event, filename) => onChange(filename));
    watcher.on('error', onError);
    return { close: () => watcher.close() };
  }

  const watchers = new Map<string, FSWatcher>();
  const add = (dir: string): void => {
    if (watchers.has(dir)) return;
    const watcher = watch(dir, (_event, name) => {
      if (name === null) return onChange(relative(root, dir) || null);
      const full = join(dir, name);
      onChange(relative(root, full));
      // A folder created or moved in gets its own watcher, with everything under it.
      if (!skipped(name) && isDir(full)) walk(full);
    });
    watcher.on('error', (err) => {
      watcher.close();
      watchers.delete(dir);
      // A watched folder that was removed ends its watcher; that is not an error.
      if (existsSync(dir)) onError(err);
    });
    watchers.set(dir, watcher);
  };
  const walk = (dir: string): void => {
    add(dir);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !skipped(entry.name)) walk(join(dir, entry.name));
    }
  };
  walk(root);
  return {
    close: () => {
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
  };
}

function skipped(name: string): boolean {
  return name === 'node_modules' || name.startsWith('.');
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false; // removed again before the stat: nothing to watch
  }
}
