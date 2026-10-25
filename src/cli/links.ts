// `margent check` on links (decision 0036): a local link must reach an existing file, and an #anchor must name a heading or
// an id on the page it lands on. Pure reads: nothing is written.
import { statSync } from 'node:fs';
import { RenderError } from '../errors.js';
import { displayPath, findDocsRoot } from '../render/root.js';
import { renderOne, type RenderedFile } from './collect.js';

// The href as the author wrote it: markdown-it percent-encodes it, so `é` would show as `%C3%A9`.
function shown(href: string): string {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

// Problem lines for every link in docs that does not resolve. A .md target that is not in docs is rendered once, here,
// for its anchors. A target that fails to render is reported at each link into it, not thrown.
export function linkProblems(docs: RenderedFile[]): string[] {
  const own = new Map<string, Set<string>>();
  for (const doc of docs) own.set(doc.file, new Set(doc.rendered.anchors));

  // Anchors of a .md outside docs, keyed by its path. Null when it fails to render.
  const rendered = new Map<string, Set<string> | null>();
  const anchorsOf = (target: string): Set<string> | null => {
    const known = own.get(target);
    if (known) return known;
    if (!rendered.has(target)) {
      try {
        const doc = renderOne(target, findDocsRoot(target), target.replace(/\.md$/, '.html'));
        rendered.set(target, new Set(doc.anchors));
      } catch (err) {
        if (!(err instanceof RenderError)) throw err;
        rendered.set(target, null);
      }
    }
    return rendered.get(target) ?? null;
  };

  const problems: string[] = [];
  for (const doc of docs) {
    const file = displayPath(doc.file);
    const pageAnchors = own.get(doc.file) ?? new Set<string>();
    for (const ref of doc.rendered.refs) {
      const where = `${file}:${ref.line}:`;
      if (ref.target === null) {
        if (ref.anchor !== null && !pageAnchors.has(ref.anchor)) {
          problems.push(`${where} link to #${ref.anchor}: no such heading on this page`);
        }
        continue;
      }
      if (!exists(ref.target)) {
        problems.push(`${where} link to ${shown(ref.href)}: no such file`);
        continue;
      }
      if (!ref.target.endsWith('.md') || ref.anchor === null) continue;
      const anchors = anchorsOf(ref.target);
      if (anchors === null) {
        problems.push(
          `${where} link to ${shown(ref.href)}: cannot check #${ref.anchor}, ${displayPath(ref.target)} fails to render`,
        );
      } else if (!anchors.has(ref.anchor)) {
        problems.push(`${where} link to ${shown(ref.href)}: no heading #${ref.anchor} in ${displayPath(ref.target)}`);
      }
    }
  }
  return problems;
}
