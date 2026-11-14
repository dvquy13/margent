// Builds dist/cli.js (the plugin's CLI) and .build/ (one bundle per src module, for tests).
// Output is deterministic: no timestamps and no absolute paths.
import { build } from 'esbuild';
import { appendFile, chmod, readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

// `import x from './file.html?raw'` loads the file as a string default export, with LF line endings, so the build is
// the same from a checkout that has CRLF files (Windows with core.autocrlf=true).
const rawPlugin = {
  name: 'raw-text',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -'?raw'.length)),
      namespace: 'raw-text',
    }));
    b.onLoad({ filter: /.*/, namespace: 'raw-text' }, async (args) => ({
      contents: (await readFile(args.path, 'utf8')).replace(/\r\n?/g, '\n'),
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
  // Licence comments are dropped here: dist/cli.js gets each bundled package's full LICENSE file instead (spec D7.3).
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
const edit = await build({
  entryPoints: [join(root, 'runtime', 'edit', 'main.js')],
  outfile: editOut,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
});
// The bundle is inlined inside a <script> element, so it must not be able to close one.
const editJs = await readFile(editOut, 'utf8');
if (/<\/script/i.test(editJs) || /<\/style/i.test(editJs)) {
  throw new Error(`${relative(root, editOut)} contains "</script" or "</style", which would break the page`);
}

// (b) the CLI: one file, executable, with a shebang. pele is the one package left out of it: it is built as its own
// dist/pele.cjs, which src/render/diagrams.ts requires on the first diagram. Bundled in, its 730 KB would be parsed on
// every run, `margent --version` included, even though it is never evaluated (spec D7.2).
const peleOut = join(root, 'dist', 'pele.cjs');
const peleApart = {
  name: 'pele-apart',
  setup(b) {
    b.onResolve({ filter: /^pele$/ }, () => ({ path: './pele.cjs', external: true }));
  },
};
const cliOut = join(root, 'dist', 'cli.js');
const cli = await build({
  ...shared,
  entryPoints: [join(root, 'src', 'cli.ts')],
  outfile: cliOut,
  banner: { js: `#!/usr/bin/env node\n${shared.banner.js}` },
  plugins: [...shared.plugins, peleApart],
  metafile: true,
});
// The edit runtime is inlined into the CLI as text, so its packages (turndown) ship in dist/cli.js too.
await appendFile(cliOut, await licenceNotices([...Object.keys(cli.metafile.inputs), ...Object.keys(edit.metafile.inputs)]));
await chmod(cliOut, 0o755);

const pele = await build({
  stdin: { contents: "module.exports = require('pele');", resolveDir: root, loader: 'js' },
  outfile: peleOut,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  minifyWhitespace: true, // pele ships minified; esbuild would otherwise print it out at a third more size
  target: 'node22',
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
  metafile: true,
});
await appendFile(peleOut, await licenceNotices(Object.keys(pele.metafile.inputs)));

// The LICENSE file of every package bundled into a dist/ file, sorted by name, as one comment at the end of that file.
// Most packages carry no licence comment in their code, so esbuild's legalComments would keep almost none of them.
async function licenceNotices(inputs) {
  // Inputs are relative to the working directory, and a symlinked node_modules resolves outside it (../x/node_modules/…).
  const dirs = new Map();
  for (const input of inputs) {
    const m = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(input);
    if (m) dirs.set(m[1], resolve(input.slice(0, m.index + m[0].length)));
  }
  const parts = [];
  for (const [name, dir] of [...dirs].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const file = (await readdir(dir)).find((f) => /^(licen[cs]e|copying)([.-]|$)/i.test(f));
    if (!file) throw new Error(`node_modules/${name} is bundled into dist/ but has no LICENSE file`);
    const { version } = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    const text = (await readFile(join(dir, file), 'utf8')).trim().replace(/\*\//g, '* /');
    parts.push(`${name} ${version}\n\n${text}`);
  }
  return `\n/*! Bundled third-party licences\n\n${parts.join('\n\n---\n\n')}\n*/\n`;
}

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
