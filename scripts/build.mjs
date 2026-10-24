// Builds dist/cli.js (the plugin's CLI) and .build/ (one bundle per src module, for tests).
// Output is deterministic: no timestamps and no absolute paths.
import { build } from 'esbuild';
import { chmod, readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

// `import x from './file.html?raw'` loads the file as a string default export.
const rawPlugin = {
  name: 'raw-text',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -'?raw'.length)),
      namespace: 'raw-text',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw-text' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
  define: { __VERSION__: JSON.stringify(pkg.version) },
  // markdown-it and other CJS deps call require(); give the ESM bundle a real require.
  banner: {
    js: "import { createRequire as __margentCreateRequire } from 'node:module'; const require = __margentCreateRequire(import.meta.url);",
  },
  plugins: [rawPlugin],
};

// (a) the edit runtime: a browser IIFE that `margent serve` inlines into edited pages. It is built before the CLI,
// because src/serve/server.ts imports its output as a string. No node banner: there is no `require` in a browser.
const editOut = join(root, '.build', 'runtime', 'edit.js');
await build({
  entryPoints: [join(root, 'runtime', 'edit', 'main.js')],
  outfile: editOut,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
});
// The bundle is inlined inside a <script> element, so it must not be able to close one.
const editJs = await readFile(editOut, 'utf8');
if (/<\/script/i.test(editJs) || /<\/style/i.test(editJs)) {
  throw new Error(`${relative(root, editOut)} contains "</script" or "</style", which would break the page`);
}

// (b) the CLI: one self-contained file, executable, with a shebang.
const cliOut = join(root, 'dist', 'cli.js');
await build({
  ...shared,
  entryPoints: [join(root, 'src', 'cli.ts')],
  outfile: cliOut,
  banner: { js: `#!/usr/bin/env node\n${shared.banner.js}` },
});
await chmod(cliOut, 0o755);

// (c) every src module as its own bundle under .build/, paths preserved, so tests can import them.
async function listTs(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listTs(full)));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out.sort();
}

const srcDir = join(root, 'src');
const entries = await listTs(srcDir);
await build({
  ...shared,
  entryPoints: entries,
  outdir: join(root, '.build'),
  outbase: srcDir,
  entryNames: '[dir]/[name]',
  outExtension: { '.js': '.js' },
});

console.log(`built dist/cli.js and ${entries.length} modules into .build/ (${relative(root, cliOut)})`);
