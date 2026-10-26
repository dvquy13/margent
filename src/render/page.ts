// Full page for one doc: the house shell with every slot filled (spec R1, R2; plan "Shell slots").
import shellHtml from '../../shell/shell.html?raw';
import shellCss from '../../shell/shell.css?raw';
import islandCss from '../../runtime/island.css?raw';
import commentsCss from '../../shell/comments.css?raw';
import commentsJs from '../../runtime/comments.js?raw';
import quoteJs from '../../runtime/quote.js?raw';
import themeJs from '../../runtime/theme.js?raw';
import kitJs from '../../runtime/kit.js?raw';
import hostJs from '../../runtime/host.js?raw';
import guestJs from '../../runtime/guest.js?raw';
import { VERSION } from '../version.js';
import { renderBody, type LinkRef } from './markdown.js';
import { displayPath, projectName } from './root.js';
import { RenderError } from '../errors.js';
import type { IslandRecord } from '../islands/parse.js';
import type { Thread } from '../comments/syntax.js';
import { pagePolicy } from './policy.js';
import { relative, sep } from 'node:path';

// What the edit runtime needs to know about the page it runs in. `path` is relative to the docs root.
export interface EditState {
  path: string;
  hash: string;
  source: string;
  author: string | null; // the name new notes are signed with; null refuses notes (spec R5.6). Set by the server (T5).
}

export interface RenderDocInput {
  file: string; // absolute path of the .md
  source: string; // its text
  root: string; // absolute docs root
  outFile: string; // absolute path of the .html that will be written
  // Set only by `margent serve`. The edit CSS joins the page style, and the state and the bundle go last in the body.
  edit?: { state: EditState; js: string; css: string };
}

export interface RenderedDoc {
  html: string;
  links: string[]; // sorted absolute paths of existing .md files inside root that this doc links to
  anchors: string[]; // sorted: the heading slugs and HTML ids of this page (`margent check` reads them)
  refs: LinkRef[]; // in document order: the local and #fragment links (`margent check` reads them)
  title: string;
  islands: { name: string; kind: string; line: number }[]; // in document order
  deps: string[]; // sorted absolute paths: the .md, each island module used, each inlined SVG
  comments: Thread[]; // in document order
  policy: string; // the Content-Security-Policy of this page: `serve` sends it as a header (M5 R2.4)
}

const SLOTS = ['title', 'policy', 'head', 'wordmark', 'meta', 'hero', 'toc', 'main', 'source', 'scripts'] as const;
type Slot = (typeof SLOTS)[number];

// Records the text of an executable inline script in `texts`, the list the policy hashes, and returns its element.
// Every executable script on a page goes through here, so none can miss the policy (M5 R2.4).
function inlineScript(texts: string[], body: string): string {
  texts.push(body);
  return `<script>${body}</script>`;
}

// Island scripts, in {{scripts}}: each distinct module once in first-use order, then the guest kit and runtime as
// text the page's guests copy, then the kit and host as inline scripts. Pages without islands get only theme.js.
// A module source is inlined as text, so it must not close or open a script element.
function scriptsHtml(islands: IslandRecord[], texts: string[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const island of islands) {
    if (seen.has(island.name)) continue;
    seen.add(island.name);
    const { name, script } = island.module;
    parts.push(
      `<script type="text/plain" class="island-module" data-name="${name}" data-path="${escapeText(displayPath(island.module.path))}">${script}</script>`,
    );
    texts.push(script);
  }
  if (islands.length > 0) {
    for (const [label, src] of [['kit.js', kitJs], ['quote.js', quoteJs], ['host.js', hostJs], ['guest.js', guestJs]] as const) {
      if (/<\/script/i.test(src) || src.includes('<!--')) throw new Error(`runtime/${label} would break an inline script`);
    }
    parts.push(
      `<script type="text/plain" id="margent-guest-kit">${kitJs}</script>`,
      `<script type="text/plain" id="margent-guest-quote">${quoteJs}</script>`,
      `<script type="text/plain" id="margent-guest-runtime">${guestJs}</script>`,
    );
    texts.push(kitJs, quoteJs, guestJs);
    parts.push(inlineScript(texts, `\n${kitJs}`), inlineScript(texts, `\n${hostJs}`));
  }
  parts.push(inlineScript(texts, `\n${themeJs}`));
  return parts.join('\n');
}

// The edit state as JSON in a non-executing script. Every "<" is escaped, so a "</script>" in the doc's source
// cannot close the element. The escape is still valid JSON, so JSON.parse reads the original back.
function editStateScript(state: EditState): string {
  const json = JSON.stringify(state).replace(/</g, '\\u003c');
  return `<script type="application/json" id="margent-state">${json}</script>`;
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Each slot must appear exactly once in the shell. Replacement is a single pass, so a value can never be
// substituted again. Text slots are escaped by the caller; HTML slots are inserted verbatim.
function fillShell(template: string, values: Record<Slot, string>): string {
  for (const slot of SLOTS) {
    const count = template.split(`{{${slot}}}`).length - 1;
    if (count !== 1) throw new Error(`shell/shell.html must hold {{${slot}}} exactly once, found ${count}`);
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    if (!(SLOTS as readonly string[]).includes(name)) throw new Error(`shell/shell.html has unknown slot {{${name}}}`);
    return values[name as Slot];
  });
}

export function renderDoc(input: RenderDocInput): RenderedDoc {
  const { file, source, root, outFile, edit } = input;
  const body = renderBody(source, { file, root, outFile });

  // runtime/ and shell/ CSS and JS are inlined, so they must not be able to close their own element.
  if (edit) {
    if (/<\/style/i.test(edit.css)) throw new Error('edit runtime CSS contains "</style"');
    if (/<\/script/i.test(edit.js) || edit.js.includes('<!--')) {
      throw new Error('edit runtime contains "</script" or "<!--", which would break the page');
    }
  }
  // The comment display (spec R4) joins only pages that have comments, so other pages stay byte-identical to M2. A served
  // page always carries it, so the draft of a doc's first note can sit in the rail (decision 0023).
  const hasComments = body.comments.length > 0;
  const withRail = hasComments || edit !== undefined;
  if (/<\/style/i.test(commentsCss)) throw new Error('shell/comments.css contains "</style"');
  if (/<\/script/i.test(quoteJs) || quoteJs.includes('<!--')) {
    throw new Error('runtime/quote.js contains "</script" or "<!--", which would break the page');
  }
  if (/<\/script/i.test(commentsJs) || commentsJs.includes('<!--')) {
    throw new Error('runtime/comments.js contains "</script" or "<!--", which would break the page');
  }
  const styles = `${shellCss}\n${withRail ? `${commentsCss}\n` : ''}${islandCss}${edit ? `\n${edit.css}` : ''}`;
  if (styles.includes('</style')) throw new Error('shell or runtime CSS contains "</style"');
  if (themeJs.includes('</script')) throw new Error('runtime/theme.js contains "</script"');

  const meta = [body.meta.status, body.meta.version, body.meta.updated].filter((v): v is string => v !== undefined);
  if (hasComments) meta.push(`${body.comments.length} open`);
  // Under `serve` the docs root is `/`, so the wordmark links to the doc index. A static file has no index to go to.
  const project = escapeText(projectName(root));
  const wordmark = edit ? `<a class="wordmark" href="/">${project}</a>` : `<span class="wordmark">${project}</span>`;
  const source_ = relative(root, file).split(sep).join('/');

  // Every executable inline script, and every script text a guest runs, in document order: the policy lists their hashes.
  const texts: string[] = [];
  let scripts = scriptsHtml(body.islands, texts);
  if (withRail) scripts += `\n${inlineScript(texts, `\n${quoteJs}`)}\n${inlineScript(texts, `\n${commentsJs}`)}`;
  if (edit) scripts += `\n${editStateScript(edit.state)}\n${inlineScript(texts, `\n${edit.js}`)}`;
  const policy = pagePolicy(texts, edit ? 'serve' : 'file');

  const values: Record<Slot, string> = {
    title: escapeText(body.title),
    policy: escapeText(policy),
    head: `<meta name="generator" content="margent ${VERSION}">\n<style>\n${styles}\n</style>`,
    wordmark,
    meta: escapeText(meta.join(' · ')),
    hero: body.hero,
    toc: body.toc,
    main: body.main,
    source: escapeText(source_),
    scripts,
  };

  const deps = [file, ...body.islands.map((island) => island.module.path), ...body.svgs];

  const islands = body.islands.map(({ name, kind, line }) => ({ name, kind, line }));
  return {
    html: fillShell(shellHtml, values),
    links: body.links,
    anchors: body.anchors,
    refs: body.refs,
    title: body.title,
    islands,
    deps: [...new Set(deps)].sort(),
    comments: body.comments,
    policy,
  };
}
