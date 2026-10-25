// Markdown source to page body: hero, table of contents, sections. Pure, no shell.
import MarkdownIt, { type MarkdownIt as MarkdownItInstance, type Renderer, type StateCore, type Token } from 'markdown-it';
// markdown-it-front-matter ships no type declarations.
// @ts-ignore
import frontMatterPlugin from 'markdown-it-front-matter';
import { readFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { RenderError } from '../errors.js';
import { DocMeta, parseFrontMatter } from './frontmatter.js';
import { Slugger } from './slug.js';
import { displayPath } from './root.js';
import { islandRule, type IslandRecord } from '../islands/parse.js';
import type { Thread } from '../comments/syntax.js';
import { commentsRule, hasCommentTokens, plainText, registerComments } from './comments.js';
import { escapeHtml, isBlank, lineRange } from './lines.js';

export interface BodyOptions {
  file: string; // absolute path of the .md
  root: string; // absolute docs root
  outFile: string; // absolute path of the .html that will be written
}

// A link that `margent check` verifies: a local path, or a #fragment on this page.
export interface LinkRef {
  line: number; // 1-based line of the link in the source
  href: string; // the link's href as written (markdown-it's normalized form)
  target: string | null; // absolute path of the local file, or null for a #fragment on this page
  anchor: string | null; // the decoded text after the #, or null when there is none
}

export interface BodyResult {
  hero: string;
  toc: string;
  main: string;
  meta: DocMeta;
  title: string;
  links: string[]; // sorted absolute paths of existing .md files inside root that this doc links to
  svgs: string[]; // sorted absolute paths of the SVG files inlined as figures
  anchors: string[]; // sorted: heading slugs and HTML ids or <a name>s on this page
  refs: LinkRef[]; // in document order: the local links and #fragment links, for `margent check`
  islands: IslandRecord[]; // in document order
  comments: Thread[]; // in document order
}

// Shared state for one render. Core rules and renderer rules read and write it.
// The env bag markdown-it passes to rules and renderers. The index signature keeps it assignable to markdown-it's Env.
export interface RenderEnv extends BodyOptions {
  [key: string | symbol]: unknown;
  lines: string[];
  links: Set<string>;
  svgs: Set<string>;
  anchors: Set<string>;
  refs: LinkRef[];
  frontMatter: DocMeta;
  h1?: string;
  slugger: Slugger;
  islands: IslandRecord[];
  comments: Thread[];
}

interface CoreRule {
  name: string;
  run: (state: StateCore) => void;
}

// Order matters: each rule sees the output of the ones before it. Link refs run before figures, which turn a
// caption's inline tokens into HTML, so a caption's links are checked too. Islands run after the figure and image
// rules, and before the source maps, so an island's table gets no data-src of its own.
const CORE_RULES: CoreRule[] = [
  { name: 'margent_frontmatter', run: extractFrontMatter },
  { name: 'margent_link_refs', run: collectLinkRefs },
  { name: 'margent_figures', run: inlineFigures },
  { name: 'margent_comments', run: commentsRule },
  { name: 'margent_local_images', run: checkLocalImages },
  { name: 'margent_islands', run: islandRule },
  { name: 'margent_source_map', run: setSourceMaps },
  { name: 'margent_headings', run: assignHeadings },
  { name: 'margent_gap_marks', run: markListGaps },
  { name: 'margent_html_anchors', run: collectHtmlAnchors },
];

// ---- helpers --------------------------------------------------------------

const FIGURE_COMMENT_MESSAGE = 'comment markup cannot go in a figure caption: add a block comment line after the figure instead';

function envOf(state: StateCore): RenderEnv {
  return state.env as RenderEnv;
}

// Attribute value of a token as a string ('' when absent).
function attr(t: Token, name: string): string {
  return String(t.attrGet(name) ?? '');
}

// A reference is local when it is a relative path: no scheme, not root-relative, not protocol-relative, not an anchor.
function isLocal(ref: string): boolean {
  if (ref === '' || ref.startsWith('#') || ref.startsWith('/')) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(ref);
}

function splitRef(ref: string): { path: string; suffix: string } {
  const m = /^([^?#]*)(.*)$/s.exec(ref);
  return m ? { path: m[1], suffix: m[2] } : { path: ref, suffix: '' };
}

function safeDecode(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

// Absolute path of the local file a reference points at (query and anchor dropped).
function localTarget(ref: string, env: RenderEnv): string {
  return resolve(dirname(env.file), safeDecode(splitRef(ref).path));
}

function isInside(target: string, root: string): boolean {
  return target.startsWith(root + sep);
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// Visits every inline token with the most recent source line, so an error inside a table cell still points at a line.
function forEachInline(tokens: Token[], visit: (inline: Token, line: number) => void): void {
  let line = 1;
  for (const t of tokens) {
    if (t.map) line = t.map[0] + 1;
    if (t.type === 'inline') visit(t, line);
  }
}

// ---- core rules -----------------------------------------------------------

// Removes the front matter token. Its YAML becomes env.frontMatter. Line numbers still count the original file.
function extractFrontMatter(state: StateCore): void {
  const env = envOf(state);
  const idx = state.tokens.findIndex((t) => t.type === 'front_matter');
  if (idx === -1) return;
  const tok = state.tokens[idx];
  state.tokens.splice(idx, 1);
  env.frontMatter = parseFrontMatter(String(tok.meta ?? ''), env.file, (tok.map?.[0] ?? 0) + 1);
}

// The <svg> element of a file, verbatim from `<svg` to the last `</svg>`. Any prolog, doctype or comment before it is dropped.
function extractSvg(text: string): string | null {
  const start = text.search(/<svg[\s>]/i);
  if (start < 0) return null;
  let end = -1;
  for (const m of text.matchAll(/<\/svg\s*>/gi)) end = (m.index ?? 0) + m[0].length;
  if (end < start) return null;
  return text.slice(start, end);
}

// Adds role="img", and an aria-label from the alt text, to the opening tag. Each is added only when the svg has none.
function accessibleSvg(svg: string, alt: string): string {
  const open = /^<svg\b[^>]*>/i.exec(svg);
  if (!open) return svg;
  const tag = open[0];
  let extra = '';
  if (!/\srole\s*=/i.test(tag)) extra += ' role="img"';
  if (!/\saria-label\s*=/i.test(tag) && alt !== '') extra += ` aria-label="${escapeHtml(alt)}"`;
  if (extra === '') return svg;
  return `${tag.slice(0, -1)}${extra}>${svg.slice(tag.length)}`;
}

// True when the children are one `em` span that covers the whole paragraph.
function isOnlyEmphasis(children: Token[]): boolean {
  if (children.length < 3) return false;
  if (children[0].type !== 'em_open' || children[children.length - 1].type !== 'em_close') return false;
  let depth = 0;
  for (let i = 0; i < children.length; i++) {
    if (children[i].type === 'em_open') depth++;
    if (children[i].type === 'em_close') depth--;
    if (depth === 0 && i < children.length - 1) return false;
  }
  return depth === 0;
}

// A paragraph whose only content is one local .svg image becomes a <figure>. If the next block is a paragraph that is
// entirely one emphasis span, it becomes the <figcaption>, and the figure's data-src covers both blocks (spec R1.5).
function inlineFigures(state: StateCore): void {
  const env = envOf(state);
  const md = state.md;
  const tokens = state.tokens;
  const out: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const open = tokens[i];
    const inline = tokens[i + 1];
    const close = tokens[i + 2];
    const kids = inline?.type === 'inline' ? (inline.children ?? []) : [];
    const img = kids[0];
    const isFigure =
      open.type === 'paragraph_open' &&
      open.level === 0 &&
      close?.type === 'paragraph_close' &&
      kids.length === 1 &&
      img.type === 'image' &&
      isLocal(attr(img, 'src')) &&
      /\.svg$/i.test(splitRef(attr(img, 'src')).path);
    if (!isFigure) {
      out.push(open);
      i++;
      continue;
    }

    const line = open.map![0] + 1;
    const src = attr(img, 'src');
    const target = localTarget(src, env);
    let text: string;
    try {
      text = readFileSync(target, 'utf8');
    } catch {
      throw new RenderError(displayPath(env.file), line, `cannot read image ${src}`);
    }
    const svgRaw = extractSvg(text);
    if (svgRaw === null) {
      throw new RenderError(displayPath(env.file), line, `image ${src} is not an SVG document`);
    }
    // The edit server maps file changes to pages through deps, so an inlined SVG is a dependency too.
    env.svgs.add(target);
    const alt = md.renderer.renderInlineAsText(img.children ?? [], md.options, env);
    const svg = accessibleSvg(svgRaw, alt);

    let consumed = 3;
    let map: [number, number] = [open.map![0], open.map![1]];
    let caption = '';
    const capOpen = tokens[i + 3];
    const capInline = tokens[i + 4];
    const capClose = tokens[i + 5];
    if (
      capOpen?.type === 'paragraph_open' &&
      capOpen.level === 0 &&
      capInline?.type === 'inline' &&
      capClose?.type === 'paragraph_close' &&
      isOnlyEmphasis(capInline.children ?? [])
    ) {
      if (hasCommentTokens(capInline.children)) {
        throw new RenderError(displayPath(env.file), capOpen.map![0] + 1, FIGURE_COMMENT_MESSAGE);
      }
      caption = md.renderer.renderInline((capInline.children ?? []).slice(1, -1), md.options, env);
      map = [open.map![0], capInline.map![1]];
      consumed = 6;
    }

    const token = new state.Token('html_block', '', 0);
    const range = lineRange(env.lines, map);
    const figcaption = caption === '' ? '' : `<figcaption>${caption}</figcaption>`;
    token.content = `<figure data-src="${range}"><div class="scroll">${svg}</div>${figcaption}</figure>\n`;
    token.block = true;
    token.level = 0;
    token.map = map;
    token.meta = { rawBlock: true };
    out.push(token);
    i += consumed;
  }
  state.tokens = out;
}

// The text after the first #, decoded. Null when there is no fragment or it is empty.
function fragmentOf(href: string): string | null {
  const i = href.indexOf('#');
  if (i < 0 || i === href.length - 1) return null;
  const raw = href.slice(i + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// One LinkRef per local link and per #fragment link, with its source line. Only the tokens are read: the renderer still
// rewrites each link as before. Links inside table cells are inline tokens too, so they are seen here.
function collectLinkRefs(state: StateCore): void {
  const env = envOf(state);
  forEachInline(state.tokens, (inline, line) => {
    for (const child of inline.children ?? []) {
      if (child.type !== 'link_open') continue;
      const href = attr(child, 'href');
      const local = isLocal(href);
      if (!local && !href.startsWith('#')) continue;
      env.refs.push({
        line,
        href,
        target: local ? localTarget(href, env) : null,
        anchor: fragmentOf(href),
      });
    }
  });
}

// Every local image that is not a figure must exist. A missing one is an error at the image's line (spec R1.7).
function checkLocalImages(state: StateCore): void {
  const env = envOf(state);
  forEachInline(state.tokens, (inline, line) => {
    for (const child of inline.children ?? []) {
      if (child.type !== 'image') continue;
      const src = attr(child, 'src');
      if (isLocal(src) && !isFile(localTarget(src, env))) {
        throw new RenderError(displayPath(env.file), line, `image not found: ${src}`);
      }
    }
  });
}

// data-src on every top-level block (spec R1.3). Figures carry their own, so they are skipped.
function setSourceMaps(state: StateCore): void {
  const env = envOf(state);
  for (const t of state.tokens) {
    if (t.level !== 0 || t.nesting === -1 || !t.map || t.meta?.rawBlock) continue;
    t.attrSet('data-src', lineRange(env.lines, t.map as [number, number]));
  }
}

// Slugs for every heading, h1 to h6, in document order. The h1 is the title: it gets a slug id too, so
// [x](#title-slug) lands, and it reserves its slug before the h2s. A top-level h2 gets its slug on its section.
// Every slug is also an anchor of the page (env.anchors).
function assignHeadings(state: StateCore): void {
  const env = envOf(state);
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'heading_open') continue;
    const level = Number(t.tag.slice(1));
    const text = plainText(tokens[i + 1]?.children ?? null);
    // The slug uses the full heading text, so anchors keep working when a number is pulled out for display.
    const slug = env.slugger.unique(text);
    env.anchors.add(slug);
    if (level === 1) {
      env.h1 ??= text;
      t.attrSet('id', slug);
      continue;
    }
    const section = t.level === 0 && level === 2;
    const label = level === 2 ? numberedLabel(state, tokens[i + 1]) : escapeHtml(text);
    t.meta = { slug, label, section };
    if (!section) t.attrSet('id', slug);
  }
}

// An id="…" (either quote) on any element, and <a name="…">, in raw HTML.
const HTML_ID = /\sid\s*=\s*(["'])(.*?)\1/gi;
const HTML_A_NAME = /<a\s(?:[^>]*?\s)?name\s*=\s*(["'])(.*?)\1/gi;

// Adds the anchors written as raw HTML in the page's html_block and html_inline tokens to env.anchors.
function collectHtmlAnchors(state: StateCore): void {
  const env = envOf(state);
  const addFrom = (html: string): void => {
    for (const m of html.matchAll(HTML_ID)) env.anchors.add(m[2]);
    for (const m of html.matchAll(HTML_A_NAME)) env.anchors.add(m[2]);
  };
  for (const t of state.tokens) {
    if (t.type === 'html_block') addFrom(t.content);
    if (t.type !== 'inline') continue;
    for (const child of t.children ?? []) {
      if (child.type === 'html_inline') addFrom(child.content);
    }
  }
}

// data-gap="1" on a list item that follows a blank line, so turndown can write a loose list's gap back (spec R8.1).
// The first item of each list is never marked. Each list keeps its own count, so a nested list is judged alone.
function markListGaps(state: StateCore): void {
  const env = envOf(state);
  const lists: { items: number }[] = [];
  for (const t of state.tokens) {
    if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') {
      lists.push({ items: 0 });
    } else if (t.type === 'bullet_list_close' || t.type === 'ordered_list_close') {
      lists.pop();
    } else if (t.type === 'list_item_open' && lists.length > 0) {
      const list = lists[lists.length - 1];
      if (list.items > 0 && isBlank(env.lines[t.map![0] - 1])) t.attrSet('data-gap', '1');
      list.items++;
    }
  }
}

// Shell design: an h2 that starts with a number and a space shows the number in its own span (spec R2.6).
// The number must be the start of the first text token, so the rest of the heading keeps its inline markup.
// Returns the TOC entry HTML. The heading's own children are changed in place.
const LEADING_NUMBER = /^(\d+(?:\.\d+)*)\s+/;
function numberedLabel(state: StateCore, inline: Token | undefined): string {
  const kids = inline?.children ?? [];
  const plain = plainText(kids);
  const match = LEADING_NUMBER.exec(plain);
  const first = kids[0];
  if (!match || !first || first.type !== 'text' || !first.content.startsWith(match[0])) {
    return escapeHtml(plain);
  }
  first.content = first.content.slice(match[0].length);
  const num = new state.Token('html_inline', '', 0);
  num.content = `<span class="num">${escapeHtml(match[1])}</span>`;
  kids.unshift(num);
  return `${num.content}${escapeHtml(plain.slice(match[0].length))}`;
}

// ---- renderer rules -------------------------------------------------------

// A local link to a .md inside the root becomes .html with the same relative path and any #anchor (spec R1.4).
// Anything else is returned unchanged.
function rewriteLink(href: string, env: RenderEnv): string {
  if (!isLocal(href)) return href;
  const { path, suffix } = splitRef(href);
  if (!path.endsWith('.md')) return href;
  const target = localTarget(href, env);
  if (!isInside(target, env.root)) return href;
  if (isFile(target)) env.links.add(target);
  return `${path.slice(0, -3)}.html${suffix}`;
}

// A local image is made relative to the output file's folder. Remote and root-relative images are untouched.
function rewriteImage(src: string, env: RenderEnv): string {
  if (!isLocal(src)) return src;
  const target = localTarget(src, env);
  const rel = relative(dirname(env.outFile), target).split(sep).join('/');
  return rel + splitRef(src).suffix;
}

function createMarkdownIt(): MarkdownItInstance {
  const md = new MarkdownIt({ html: true, linkify: false, typographer: false });
  md.use(frontMatterPlugin, () => {});
  registerComments(md);

  const escape = md.utils.escapeHtml;
  const attrs = (t: Token): string => md.renderer.renderAttrs(t);

  // <pre data-src><code class="language-x">: the attributes go on <pre>, which is the outermost element.
  md.renderer.rules.fence = (tokens: Token[], idx: number) => {
    const t = tokens[idx];
    const info = md.utils.unescapeAll(t.info).trim();
    const lang = info.split(/\s+/g)[0] ?? '';
    const cls = lang ? ` class="language-${escape(lang)}"` : '';
    return `<pre${attrs(t)}><code${cls}>${escape(t.content)}</code></pre>\n`;
  };

  md.renderer.rules.code_block = (tokens: Token[], idx: number) => {
    const t = tokens[idx];
    return `<pre${attrs(t)}><code>${escape(t.content)}</code></pre>\n`;
  };

  // Raw HTML cannot carry an attribute of its own, so a top-level block is wrapped in a div that holds data-src.
  md.renderer.rules.html_block = (tokens: Token[], idx: number) => {
    const t = tokens[idx];
    if (!t.attrGet('data-src')) return t.content;
    return `<div${attrs(t)}>\n${t.content}</div>\n`;
  };

  // Top-level tables are wrapped in <div class="scroll"> so that wide tables scroll inside their own box (spec R2.3).
  md.renderer.rules.table_open = (tokens: Token[], idx: number) => {
    const t = tokens[idx];
    if (t.level === 0) return `<div class="scroll"${attrs(t)}>\n<table>\n`;
    return '<table>\n';
  };

  md.renderer.rules.table_close = (tokens: Token[], idx: number) => {
    return tokens[idx].level === 0 ? '</table>\n</div>\n' : '</table>\n';
  };

  md.renderer.rules.link_open = (tokens: Token[], idx: number, options, env: unknown, self: Renderer) => {
    const t = tokens[idx];
    const href = attr(t, 'href');
    const next = rewriteLink(href, env as RenderEnv);
    // The original target goes too, so the edit runtime's turndown can write the author's link back (M2 R3.5).
    if (next !== href) {
      t.attrSet('href', next);
      t.attrSet('data-md-href', href);
    }
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.image = (tokens: Token[], idx: number, options, env: unknown, self: Renderer) => {
    const t = tokens[idx];
    const src = attr(t, 'src');
    const next = rewriteImage(src, env as RenderEnv);
    // Same as links: the author's src goes too, for the edit runtime's turndown (M2 R3.5).
    if (next !== src) {
      t.attrSet('src', next);
      t.attrSet('data-md-src', src);
    }
    const alt = t.attrIndex('alt');
    if (t.attrs && alt >= 0) t.attrs[alt][1] = self.renderInlineAsText(t.children ?? [], options, env as RenderEnv);
    return self.renderToken(tokens, idx, options);
  };

  for (const rule of CORE_RULES) md.core.ruler.push(rule.name, rule.run);
  return md;
}

const md = createMarkdownIt();

interface Section {
  slug: string;
  label: string; // TOC entry HTML
  html: string[];
}

interface HeadingMeta extends Record<string, unknown> {
  slug: string;
  label: string;
  section: boolean;
}

// Top-level blocks are runs of tokens, from a level-0 token through its matching close.
function topLevelBlocks(tokens: Token[]): Token[][] {
  const blocks: Token[][] = [];
  let i = 0;
  while (i < tokens.length) {
    let depth = 0;
    let j = i;
    do {
      depth += tokens[j].nesting;
      j++;
    } while (depth > 0 && j < tokens.length);
    blocks.push(tokens.slice(i, j));
    i = j;
  }
  return blocks;
}


export function renderBody(source: string, opts: BodyOptions): BodyResult {
  for (const p of [opts.file, opts.root, opts.outFile]) {
    if (!isAbsolute(p)) throw new Error(`renderBody needs absolute paths, got ${p}`);
  }
  const env: RenderEnv = {
    file: opts.file,
    root: opts.root,
    outFile: opts.outFile,
    lines: source.split('\n'),
    links: new Set(),
    svgs: new Set(),
    anchors: new Set(),
    refs: [],
    frontMatter: {},
    slugger: new Slugger(),
    islands: [],
    comments: [],
  };

  // markdown-it-front-matter reads an unclosed block as frontmatter to the end of the file, hiding the whole doc.
  if (/^---\s*$/.test(env.lines[0]) && !env.lines.slice(1).some((l) => /^---\s*$/.test(l))) {
    throw new RenderError(displayPath(opts.file), 1, 'frontmatter opened with --- is never closed');
  }

  const tokens = md.parse(source, env);
  const hero: string[] = [];
  const sections: Section[] = [];
  let current: Section | undefined;

  for (const block of topLevelBlocks(tokens)) {
    const first = block[0];
    const meta = first.meta as HeadingMeta | null;
    if (first.type === 'heading_open' && meta?.section) {
      current = { slug: meta.slug, label: meta.label, html: [] };
      sections.push(current);
    }
    const html = md.renderer.render(block, md.options, env);
    if (current) current.html.push(html);
    else hero.push(html);
  }

  const main = sections.map((s) => `<section id="${s.slug}">\n${s.html.join('')}</section>\n`).join('');
  const toc =
    sections.length === 0
      ? ''
      : `<nav class="toc" aria-label="Sections"><ol>${sections
          .map((s) => `<li><a href="#${s.slug}">${s.label}</a></li>`)
          .join('')}</ol></nav>`;

  const fm = env.frontMatter;
  const meta: DocMeta = {};
  if (fm.status !== undefined) meta.status = fm.status;
  if (fm.version !== undefined) meta.version = fm.version;
  if (fm.updated !== undefined) meta.updated = fm.updated;
  return {
    islands: env.islands,
    hero: hero.join(''),
    toc,
    main,
    meta,
    title: fm.title ?? env.h1 ?? basename(opts.file, '.md'),
    links: [...env.links].sort(),
    svgs: [...env.svgs].sort(),
    anchors: [...env.anchors].sort(),
    refs: env.refs,
    comments: env.comments,
  };
}
