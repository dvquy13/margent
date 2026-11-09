// `margent theme init` (spec U5): the starter theme.css, with every house token commented out. The tokens are copied
// from shell/shell.css at run time, so the starter cannot drift from the house values (decision 0047).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import shellCss from '../../shell/shell.css?raw';
import { margentHome } from '../user/home.js';

const HEADER = `/* Your margent theme. It restyles every page margent makes for you, and the islands in them. It is added after
   the house styles, so the values here win.
   To change a token, remove the comment markers around its line. The three blocks are light, dark (system setting)
   and dark (header toggle). Keep their selectors, so your values apply in each.
   To use a Google font, import it on the first line and name it first in a font token:
   @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap');
   --font-prose: 'Inter', sans-serif;
   Fonts load only from Google Fonts: the page policy blocks other hosts. */`;

// The house selectors, exactly as shell/shell.css writes them. Each one must appear there (see houseDeclarations).
const BLOCKS: { wrapper?: string; prelude: string }[] = [
  { prelude: ':root {' },
  { wrapper: '@media screen and (prefers-color-scheme: dark)', prelude: ':root:not([data-theme="light"]) {' },
  { wrapper: '@media screen', prelude: ':root[data-theme="dark"] {' },
];

// The custom-property declarations of the house block that starts with prelude, in order, with their values trimmed.
// Comments and non-token declarations (color-scheme) are left out.
function houseDeclarations(css: string, prelude: string): [string, string][] {
  const at = css.indexOf(prelude);
  if (at === -1) throw new Error(`shell/shell.css has no "${prelude}" block: margent theme init cannot copy its tokens`);
  const start = at + prelude.length;
  const end = css.indexOf('}', start);
  const body = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, '');
  return body.split(';').flatMap((piece) => {
    const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]*?)\s*$/.exec(piece);
    return m ? [[m[1], m[2]] as [string, string]] : [];
  });
}

// The starter theme: a header, then the three house blocks with each declaration in a comment.
export function starterTheme(css: string): string {
  const blocks = BLOCKS.map(({ wrapper, prelude }) => {
    const indent = wrapper === undefined ? '' : '  ';
    const lines: string[] = [];
    if (wrapper !== undefined) lines.push(`${wrapper} {`);
    lines.push(`${indent}${prelude}`);
    for (const [name, value] of houseDeclarations(css, prelude)) lines.push(`${indent}  /* ${name}: ${value}; */`);
    lines.push(`${indent}}`);
    if (wrapper !== undefined) lines.push('}');
    return lines.join('\n');
  });
  return `${HEADER}\n\n${blocks.join('\n\n')}\n`;
}

// margent theme init: writes {home}/theme.css and prints its path. It never overwrites a file (flag wx).
export function commandThemeInit(): number {
  const file = resolve(margentHome(), 'theme.css');
  mkdirSync(dirname(file), { recursive: true });
  try {
    writeFileSync(file, starterTheme(shellCss), { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`${file} already exists; edit it, or delete it to start again`);
    }
    throw err;
  }
  process.stdout.write(`${file}\n`);
  return 0;
}
