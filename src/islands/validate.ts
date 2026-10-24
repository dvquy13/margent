// Island modules, read in Node as text only (spec M5 R1). Node never evaluates module code: it finds the module,
// rejects what would break the page, and wraps it with the kit's string transform. The sandboxed guest runs the
// module and runs the contract, schema and column-pattern checks (M5 R3.3).
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { RenderError } from '../errors.js';
import { displayPath } from '../render/root.js';
import kitSource from '../../runtime/kit.js?raw';
import { findModule } from './lookup.js';

export type IslandKind = 'table' | 'yaml';

export interface TableData {
  columns: { key: string; label: string }[];
  rows: Record<string, string>[];
  attrs: Record<string, string>;
}

export interface ModuleSource {
  name: string;
  path: string;
  source: string; // the module file's text
  script: string; // the exact script the guest runs: window.__margentModules[name] = wrapped;
}

export interface IslandToLoad {
  name: string;
  line: number; // 1-based line of the marker or the fence opening
}

interface KitApi {
  wrapModule(name: string, source: string): string;
  moduleScript(name: string, source: string): string;
}

// The kit, evaluated once. It only defines MargentKit; nothing runs at load time. This is margent's own code.
let kitApi: KitApi | null = null;
function kit(): KitApi {
  if (!kitApi) {
    const ctx: Record<string, unknown> = {};
    vm.createContext(ctx);
    vm.runInContext(kitSource, ctx, { filename: 'runtime/kit.js' });
    kitApi = ctx.MargentKit as KitApi;
  }
  return kitApi;
}

// Finds the module for an island, reads it as text and returns the script the page carries for it. A module the
// wrap rejects (an import, a script tag, an unsupported export, no default export) is a RenderError at the island line.
export function loadIsland(island: IslandToLoad, docFile: string, root: string): { module: ModuleSource } {
  const { name, line } = island;
  const file = displayPath(docFile);
  const path = findModule(name, docFile, root, line);
  const source = readFileSync(path, 'utf8');
  if (/<\/script/i.test(source) || source.includes('<!--')) {
    throw new RenderError(
      file,
      line,
      `island "${name}": module ${displayPath(path)} contains "</script" or "<!--", which would break the page`
    );
  }
  let script: string;
  try {
    script = kit().moduleScript(name, source);
  } catch (e) {
    throw new RenderError(file, line, (e as Error).message);
  }
  return { module: { name, path, source, script } };
}
