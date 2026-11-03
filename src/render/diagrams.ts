// Mermaid fences to inline SVG, through pele (decision 0045). pele is loaded on the first diagram, not at startup:
// esbuild wraps a `require` of this ESM package in a lazy init, so a command that draws no diagram never runs it (spec D7.2).
import type { RenderResult } from 'pele';
import { RenderError } from '../errors.js';

type Pele = typeof import('pele');

let pele: Pele | undefined;
function loadPele(): Pele {
  pele ??= require('pele') as Pele;
  return pele;
}

// The page's --font-ui (shell/shell.css), so a diagram's text is set in the page's font.
const FONT_UI = "'Google Sans Flex', 'Inter', system-ui, -apple-system, sans-serif";
const WIDE_MAX = 900; // the page column (spec D1.2)
const NARROW_MAX = 358; // a phone-width figure (spec D1.2)
const BREAKPOINT = 1200; // above this, pele turns a left-to-right flow top-to-bottom in the narrow layout too

export interface DiagramRecord {
  line: number; // 1-based line of the fence's opening line
  width: number; // the wide layout's natural width in px, which `margent check` reads (spec D3.1)
}

export interface DiagramOptions {
  file: string; // display path of the doc, for errors
  line: number; // 1-based line of the fence's opening line
  index: number; // the diagram's position in its doc, for unique SVG ids
  attrs: string; // the fence's rendered attributes (data-src), which go on the figure
}

export interface RenderedDiagram {
  html: string;
  width: number;
}

// A link pele keeps must be an absolute web or mail URL, so a reader off the site can follow it (spec D2.2).
const ABSOLUTE_LINK = /^(https?:|mailto:)/i;

function firstLineOf(text: string): string {
  return text.split('\n')[0] ?? '';
}

// Pele's error line counts the fence's content from 1, so the doc line is the fence's opening line plus it (spec D2.1).
function layout(p: Pele, source: string, maxWidth: number, idPrefix: string, opts: DiagramOptions): RenderResult {
  try {
    return p.render(source, {
      fontSize: 15,
      fontFamily: FONT_UI,
      directionBreakpoint: BREAKPOINT,
      maxWidth,
      idPrefix,
    });
  } catch (e) {
    if (e instanceof p.PeleError) {
      const line = e.line > 0 ? opts.line + e.line : opts.line;
      throw new RenderError(opts.file, line, `mermaid ${e.code}: ${firstLineOf(e.message)}`);
    }
    throw e;
  }
}

// The doc line of the first content line that names the href, or the fence line when none does (spec D2.2).
function linkLine(opts: DiagramOptions, source: string, href: string): number {
  const at = source.split('\n').findIndex((l) => l.includes(href));
  return at < 0 ? opts.line : opts.line + at + 1;
}

// Renders one fence's source as a figure with both layouts; CSS shows one of them (spec D1.1, D1.5).
export function renderDiagram(source: string, opts: DiagramOptions): RenderedDiagram {
  const p = loadPele();
  // A gantt draws a "today" line from the clock, which would change the bytes of the same markdown (spec D1.3).
  const text = p.detectType(source) === 'gantt' ? `${source.endsWith('\n') ? source : `${source}\n`}todayMarker off\n` : source;
  const wide = layout(p, text, WIDE_MAX, `d${opts.index}w-`, opts);
  for (const link of wide.links) {
    if (!ABSOLUTE_LINK.test(link.href)) {
      throw new RenderError(
        opts.file,
        linkLine(opts, source, link.href),
        `diagram links must be absolute URLs: link ${link.href} from the caption instead`,
      );
    }
  }
  const narrow = layout(p, text, NARROW_MAX, `d${opts.index}n-`, opts);
  const html =
    `<figure class="diagram"${opts.attrs}>` +
    `<div class="diagram-wide" style="--w:${wide.width}px">${wide.svg}</div>` +
    `<div class="diagram-narrow" style="--w:${narrow.width}px">${narrow.svg}</div>` +
    `</figure>\n`;
  return { html, width: wide.width };
}
