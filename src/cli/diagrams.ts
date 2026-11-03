// `margent check` on diagrams (spec D3.1): a diagram's wide layout must fit the page column. Pure reads: nothing is written.
import { displayPath } from '../render/root.js';
import type { RenderedFile } from './collect.js';

// The page column is 900 px and the text may shrink to 75% in it, so a wide layout over 1200 px would shrink below that.
export const DIAGRAM_MAX_WIDTH = 1200;

// Problem lines for every diagram in docs whose wide layout is wider than DIAGRAM_MAX_WIDTH.
export function diagramProblems(docs: RenderedFile[]): string[] {
  const problems: string[] = [];
  for (const doc of docs) {
    const file = displayPath(doc.file);
    for (const d of doc.rendered.diagrams) {
      if (d.width <= DIAGRAM_MAX_WIDTH) continue;
      problems.push(
        `${file}:${d.line}: diagram is ${Math.round(d.width)}px wide, so its text would shrink below 75% in the page column: split it, turn it top-to-bottom, or draw it as an SVG`,
      );
    }
  }
  return problems;
}
