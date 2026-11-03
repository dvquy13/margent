// The doc index served at `/` (spec R1.3). Every .md under the root as a folder tree, with the title, status and
// updated from frontmatter. Folders are native <details>, closed until clicked, so the page still runs no script.
// A doc whose frontmatter fails to parse is listed with its error, never dropped.
import { readFileSync } from 'node:fs';
import MarkdownIt from 'markdown-it';
import { basename, join, relative, sep } from 'node:path';
// markdown-it-front-matter ships no type declarations.
// @ts-ignore
import frontMatterPlugin from 'markdown-it-front-matter';
import shellCss from '../../shell/shell.css?raw';
import { markdownUnder } from '../cli/collect.js';
import { RenderError } from '../errors.js';
import { renderBody } from '../render/markdown.js';
import { parseFrontMatter, type DocMeta } from '../render/frontmatter.js';
import { displayPath, findDocsRoot, projectName } from '../render/root.js';

interface IndexEntry {
  rel: string; // posix path under the root, without .md
  title: string;
  meta: DocMeta;
  open: number; // open comment threads in the doc (spec R2.3)
  error?: string; // the frontmatter or render error, shown in the entry
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The text of the first `# ` heading, from the markdown tokens. Headings inside code fences are not tokens, so they
// never count.
function firstH1(tokens: { type: string; tag: string; content: string }[]): string | undefined {
  const i = tokens.findIndex((t) => t.type === 'heading_open' && t.tag === 'h1');
  return i === -1 ? undefined : tokens[i + 1]?.content;
}

// Reads one doc with the renderer: its frontmatter (parseFrontMatter), its first heading for the title, and its open
// comment threads. A doc that fails to render keeps its title and shows the error, so it is never dropped or counted 0.
function entryFor(file: string, root: string): IndexEntry {
  const rel = relative(root, file).split(sep).join('/').replace(/\.md$/, '');
  const fallback = basename(file, '.md');
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
  md.use(frontMatterPlugin, () => {});
  try {
    // The same guard as the renderer: an unclosed `---` would read the whole file as frontmatter.
    if (/^---\s*$/.test(lines[0]) && !lines.slice(1).some((l) => /^---\s*$/.test(l))) {
      throw new RenderError(displayPath(file), 1, 'frontmatter opened with --- is never closed');
    }
    const tokens = md.parse(source, {});
    const fm = tokens.find((t) => t.type === 'front_matter');
    const meta = fm ? parseFrontMatter(String(fm.meta ?? ''), file, (fm.map?.[0] ?? 0) + 1) : {};
    const body = renderBody(source, {
      file,
      root: findDocsRoot(file, root),
      outFile: join(root, `${rel}.html`),
    });
    return { rel, title: meta.title ?? firstH1(tokens) ?? fallback, meta, open: body.comments.length };
  } catch (err) {
    if (!(err instanceof RenderError)) throw err;
    return { rel, title: fallback, meta: {}, open: 0, error: err.message };
  }
}

// The entry shows the doc's path under the root too: agents print paths, and the browser's find then finds the doc.
function entryHtml(entry: IndexEntry): string {
  const href = entry.rel.split('/').map(encodeURIComponent).join('/') + '.html';
  const path = `<span class="entry-path">${escapeHtml(`${entry.rel}.md`)}</span>`;
  const facts = [
    entry.meta.status,
    entry.meta.updated ? `updated ${entry.meta.updated}` : undefined,
    entry.open > 0 ? `${entry.open} open` : undefined,
  ]
    .filter((v): v is string => v !== undefined)
    .map((v) => `<span class="fact">${escapeHtml(v)}</span>`)
    .join('');
  const error = entry.error ? `<p class="entry-error"><code>${escapeHtml(entry.error)}</code></p>` : '';
  return `<li><a href="${escapeHtml(href)}">${escapeHtml(entry.title)}</a>${facts}${path}${error}</li>`;
}

interface Folder {
  name: string;
  folders: Map<string, Folder>;
  docs: IndexEntry[];
}

function newFolder(name: string): Folder {
  return { name, folders: new Map(), docs: [] };
}

function allDocs(folder: Folder): IndexEntry[] {
  return [...folder.docs, ...[...folder.folders.values()].flatMap(allDocs)];
}

// Subfolders by name, then the folder's own docs, as a file browser lists them.
function folderBody(folder: Folder): string {
  const subfolders = [...folder.folders.values()]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(folderHtml)
    .join('');
  const docs = folder.docs.length > 0 ? `<ul class="index-list">${folder.docs.map(entryHtml).join('')}</ul>` : '';
  return subfolders + docs;
}

// A closed folder still says what it holds: its doc count, open threads and errors, counted through every subfolder,
// so an error is never hidden behind a closed folder.
function folderHtml(folder: Folder): string {
  const docs = allDocs(folder);
  const open = docs.reduce((n, d) => n + d.open, 0);
  const errors = docs.filter((d) => d.error !== undefined).length;
  const facts = [
    `<span class="fact">${docs.length === 1 ? '1 doc' : `${docs.length} docs`}</span>`,
    open > 0 ? `<span class="fact">${open} open</span>` : '',
    errors > 0 ? `<span class="fact fact-error">${errors === 1 ? '1 error' : `${errors} errors`}</span>` : '',
  ].join('');
  return `<details class="index-folder"><summary><span class="folder-name">${escapeHtml(folder.name)}/</span>${facts}</summary><div class="folder-body">${folderBody(folder)}</div></details>`;
}

const INDEX_CSS = `
/* The scrollbar's gutter is kept while the index is short, so opening a folder never shifts the column */
html { scrollbar-gutter: stable; }
/* The tree's rows: top-level folders, then the root's own docs, like a file browser */
.index-tree { --chev: 1.5rem; }
.index-folder > summary { display: flex; align-items: baseline; cursor: pointer; list-style: none; padding: var(--gap-sm) 0; }
.index-folder > summary::-webkit-details-marker { display: none; }
.index-folder > summary::before { content: '›'; flex: none; align-self: center; width: var(--chev); text-align: center; font-size: 1.4rem; line-height: 1; color: var(--text-muted); transition: transform 0.1s; }
.index-folder[open] > summary::before { transform: rotate(90deg); color: var(--accent); }
.index-folder > summary:hover .folder-name { color: var(--accent); }
.folder-name { font-family: var(--mono); font-weight: 600; color: var(--text); }
/* Each level steps in one chevron column, so a child's chevron sits under its parent's name */
.folder-body { padding-left: var(--chev); }
.index-list { list-style: none; margin: 0; padding: 0; }
/* A doc keeps the chevron's column empty, so doc titles and folder names share one left edge per level */
.index-list li { padding: var(--gap-sm) 0 var(--gap-sm) var(--chev); max-width: none; }
.index-list a { color: var(--text); font-weight: 600; text-decoration: none; }
.index-list a:hover { color: var(--accent); }
.fact { margin-left: var(--gap-sm); font-size: var(--font-sm); color: var(--text-muted); white-space: nowrap; }
.fact-error { color: var(--red); }
.index-list .entry-path { display: block; margin-top: var(--gap-xs); font-family: var(--mono); font-size: var(--font-sm); color: var(--text-muted); overflow-wrap: anywhere; }
.entry-error { margin: var(--gap-xs) 0 0; color: var(--red); font-size: var(--font-sm); }
.entry-error code { font-family: var(--mono); white-space: pre-wrap; }
`;

// The index page for a served root. Throws when the root cannot be read (the server answers 500 with the message).
export function indexPage(root: string): string {
  const tree = newFolder('');
  const files = markdownUnder(root);
  for (const file of files) {
    const entry = entryFor(file, root);
    const parts = entry.rel.split('/').slice(0, -1);
    let folder = tree;
    for (const part of parts) {
      let next = folder.folders.get(part);
      if (!next) {
        next = newFolder(part);
        folder.folders.set(part, next);
      }
      folder = next;
    }
    folder.docs.push(entry);
  }
  const sections = files.length > 0 ? `<div class="index-tree">${folderBody(tree)}</div>` : '';
  const name = escapeHtml(projectName(root));
  const count = files.length === 1 ? '1 doc' : `${files.length} docs`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${name} docs</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" crossorigin="anonymous" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wght@6..144,100..1000&family=DM+Sans:opsz,wght@9..40,400..700&family=Google+Sans+Code:wght@400;500&display=swap">
<style>
${shellCss}
${INDEX_CSS}
</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <span class="wordmark">${name}</span>
    <span class="top-meta">${count}</span>
  </div>
</header>
<main class="wrap">
${sections || '<p>No .md files under this folder.</p>'}
</main>
</body>
</html>
`;
}
