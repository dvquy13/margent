// Hand-assembles island pages for runtime tests. The page follows the renderer's island DOM (M5 R2): tokens on :root,
// a theme toggle, each module as a text/plain script with its data-path, the guest kit and runtime as text/plain
// copies for the frames, kit.js, host.js and theme.js inlined, and island.css. No script policy: the runtime tests
// check the frame, and islands.test.mjs checks rendered pages, which carry the policy.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = join(HERE, '..', '..', '..', 'runtime');
const ISLANDS = join(HERE, 'islands');

const LIGHT = `
  --bg: #ffffff; --bg2: #f6f6f6; --bg3: #eeeeee; --border: #e4e4e4;
  --text: #0a0a0a; --text-muted: #666666;
  --accent: #0062a8; --accent-light: #e0f0ff; --accent-border: #b3d9f5;
  --green: #059669; --amber: #b45309; --red: #b91c1c;`;
const DARK = `
  --bg: #0a0a0a; --bg2: #151515; --bg3: #1e1e1e; --border: #2a2a2a;
  --text: #f2f2f2; --text-muted: #a0a0a0;
  --accent: #5aaee8; --accent-light: #0d2b45; --accent-border: #1d4f78;
  --green: #34d399; --amber: #fbbf24; --red: #f87171;`;
const SHARED = `
  --font-ui: 'Google Sans Flex', 'Inter', system-ui, -apple-system, sans-serif;
  --font-prose: 'DM Sans', system-ui, sans-serif;
  --mono: 'Google Sans Code', 'Menlo', 'Consolas', monospace;
  --font-xs: 0.6875rem; --font-sm: 0.75rem; --font-md: 0.8125rem; --font-body: 0.875rem;
  --font-base: 0.9375rem; --font-lg: 1rem; --font-2xl: 1.125rem; --font-4xl: 1.375rem;
  --font-5xl: 2rem; --font-6xl: 2.5rem;
  --radius-sm: 4px; --radius-pill: 99px;
  --gap-xs: 0.375rem; --gap-sm: 0.75rem; --gap-md: 1.25rem; --gap-lg: 2rem; --gap-xl: 4rem;`;

// The page shell's design tokens, written out for the runtime fixtures (amber and red added as in the shell).
const TOKENS_CSS = `
:root {${LIGHT}${SHARED}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {${DARK}
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {${DARK}
  color-scheme: dark;
}`;

// The shell's width rules, so island widths (and so heights) match the spike pages.
const PAGE_CSS = `
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--text); font-family: var(--font-ui); font-size: var(--font-base); }
.wrap { max-width: calc(900px + 2 * 24px); margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
header.top { border-bottom: 1px solid var(--border); }
header.top .wrap { height: 56px; display: flex; align-items: center; justify-content: space-between; gap: var(--gap-sm); }
main .wrap { padding-block: var(--gap-lg) var(--gap-xl); display: flex; flex-direction: column; gap: var(--gap-xl); }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: var(--font-md); }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); }
#theme-toggle { font: inherit; font-size: var(--font-sm); padding: 6px 12px; border: 1px solid var(--border); border-radius: var(--radius-pill); background: var(--bg2); color: var(--text); cursor: pointer; }
`;

const GOOGLE_FONTS = 'https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,100..1000&family=DM+Sans:opsz,wght@9..40,400..700&family=Google+Sans+Code:wght@400;500&display=swap';

// Escapes "<" so JSON can sit inside a <script> element.
function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function readRuntime(name) {
  return readFileSync(join(RUNTIME, name), 'utf8');
}

function readModule(name) {
  return readFileSync(join(ISLANDS, `${name}.island.js`), 'utf8');
}

// Dummy data for the bars island. Cells are the markdown source, as the renderer passes them.
export const BARS_DATA = {
  columns: [
    { key: 'item', label: 'Item' },
    { key: 'count', label: 'Count' },
    { key: 'note', label: 'Note' }
  ],
  rows: [
    { item: 'Alpha', count: '12', note: 'Short note' },
    { item: 'Beta | with pipe', count: '30', note: '**Bold** note with `code`' },
    { item: 'Gamma', count: '7', note: 'Tooltip sits past the right edge' }
  ],
  attrs: { unit: 'items' }
};
export const BARS_FALLBACK = `<div class="scroll"><table>
<thead><tr><th>Item</th><th>Count</th><th>Note</th></tr></thead>
<tbody>
<tr><td>Alpha</td><td>12</td><td>Short note</td></tr>
<tr><td>Beta | with pipe</td><td>30</td><td><strong>Bold</strong> note with <code>code</code></td></tr>
<tr><td>Gamma</td><td>7</td><td>Tooltip sits past the right edge</td></tr>
</tbody></table></div>`;

export const STEPS_DATA = {
  title: 'Dummy steps',
  steps: [
    { label: 'Collect the **raw** rows', detail: 'Gather what the sources return. [A link](https://example.com) is allowed.' },
    { label: 'Render them', detail: 'Draw the rows. Buttons here change the island height.' },
    { label: 'Ship', detail: 'Nothing to see: a detail panel that is long enough to wrap onto a second line in a narrow column.' }
  ]
};
export const STEPS_FALLBACK = `<pre>title: Dummy steps
steps:
  - label: Collect the **raw** rows
    detail: Gather what the sources return.</pre>`;

// One island per entry: { name, kind, data, fallback }. Modules come from islands/{name}.island.js.
// rowLines is 1-based and one per table row, as the renderer writes it.
export function buildPage({ title = 'Runtime fixture', islands = [] } = {}) {
  const names = [...new Set(islands.map((i) => i.name))];
  const islandHtml = islands.map((i) => {
    const kind = i.kind ?? 'table';
    const rowLines = Array.isArray(i.data?.rows) ? i.data.rows.map((_, k) => 10 + k) : [];
    const payload = { data: i.data, rowLines };
    return `<agent-island name="${i.name}" data-kind="${kind}">
<script type="application/json" class="island-data">${jsonForScript(payload)}</script>
<div class="island-fallback">${i.fallback}</div>
</agent-island>`;
  }).join('\n');
  const moduleHtml = names.map((n) => {
    const src = readModule(n);
    if (/<\/script/i.test(src) || src.includes('<!--')) throw new Error(`module ${n} would break an inline script`);
    const script = `window.__margentModules[${JSON.stringify(n)}] = ${wrapForPage(n, src)};`;
    return `<script type="text/plain" class="island-module" data-name="${n}" data-path="islands/${n}.island.js">${script}</script>`;
  }).join('\n');
  const guest = `<script type="text/plain" id="margent-guest-kit">${readRuntime('kit.js')}</script>
<script type="text/plain" id="margent-guest-runtime">${readRuntime('guest.js')}</script>`;
  const runtime = ['kit.js', 'host.js', 'theme.js'].map((f) => {
    const src = readRuntime(f);
    if (/<\/script/i.test(src) || src.includes('<!--')) throw new Error(`${f} would break an inline script`);
    return `<script>\n${src}\n</script>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${GOOGLE_FONTS}">
<style>${TOKENS_CSS}
${PAGE_CSS}</style>
<style>
${readRuntime('island.css')}
</style>
</head>
<body>
<header class="top"><div class="wrap"><span>Runtime fixture</span><button id="theme-toggle" type="button">Dark</button></div></header>
<main>
<div class="wrap">
${islandHtml}
</div>
</main>
${moduleHtml}
${guest}
${runtime}
</body>
</html>
`;
}

// The module wrapper of the kit, as Node writes it: the same text the renderer puts in the page.
const kitApi = (() => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(readRuntime('kit.js'), ctx, { filename: 'runtime/kit.js' });
  return ctx.MargentKit;
})();
function wrapForPage(name, src) {
  return kitApi.wrapModule(name, src);
}

// Standard fixture pages used by the tests.
export const DUMMY_ISLANDS = [
  { name: 'bars', data: BARS_DATA, fallback: BARS_FALLBACK },
  { name: 'steps', kind: 'yaml', data: STEPS_DATA, fallback: STEPS_FALLBACK }
];
