---
title: Mermaid fences render through pele at render time
status: accepted
updated: 2026-11-03
---

# 0045 Mermaid fences render through pele at render time

## Context

- Every diagram in a doc today is an SVG the agent draws by hand: hundreds of coordinates for a flowchart, and a redraw around any node it adds. Agents already know Mermaid, which states the same structure in about ten lines.
- [pele](https://pele.run) (MIT, no dependencies, by Obsidian) turns Mermaid text into SVG. It runs in Node, synchronously, with no DOM. It covers every diagram type built into Mermaid 12.1.0.
- Spike S7 (2026-11-03) ran pele 1.13.0 and Mermaid 12.1.0 on 39 diagrams: 29 from real docs (flowchart, sequence, state, ER, class) and 10 synthetic (margent's two hand-drawn diagrams rewritten in Mermaid, a 24-node graph with subgraphs, pie, xychart, quadrant, gantt, timeline, mindmap). It found:
  - **Renders:** 39 of 39 in both. Structure, labels, `classDef` colours and edge labels match Mermaid in every case, and pele's layout often reads better.
  - **Fit:** with Google Sans Flex loaded, no label is wider than its shape and nothing falls outside the viewBox.
  - **Speed:** 0.1 to 7 ms per diagram. Loading pele takes about 15 ms; `margent --version` takes 50 ms.
  - **Same bytes:** the SVG is identical twice in a process, across processes and in three time zones, except gantt. A gantt chart's today marker follows the clock and the time zone, and pele's `config` option doesn't turn it off. A `todayMarker off` line after the source does, without shifting any error line.
  - **Errors:** pele throws `PeleError` with `code` (`syntax`, `semantic`, `limit`, `unsupported-diagram`), `line` and `column`.
  - **Safety:** label text is escaped (a `<script>` in a label came out as text), JS click callbacks are dropped, and `javascript:` and `data:` links are always blocked.
  - **Theme:** every colour is a CSS variable (`--pele-bg`, `--pele-fg`, `--pele-line`, `--pele-accent`, `--pele-series-1` to `-8`, and more). A class written as `B[Review]:::accent` lands on the node's `<g>` with no `classDef`. A `classDef` that uses `var(--x)` is a Mermaid syntax error.
  - **Width:** left-to-right flowcharts in real docs reach 1100 to 1770 px and shrink to 51–80% in the 900 px column. pele turns a diagram top-to-bottom only when it doesn't fit and `maxWidth` is below `directionBreakpoint`. With `maxWidth: 900` and a breakpoint above it, 5 of 6 wide flowcharts fit at full size and one that already fit stays left-to-right. Top-to-bottom fan-outs of 7 branches stay 1335 to 1491 px at any setting. At `maxWidth: 358`, 33 of 39 fit or nearly fit.
  - **Selection:** labels are real `<text>`, so the page can select and search them.
  - **Size:** pele is 730 KB raw and 274 KB gzipped. `dist/cli.js` is 828 KB today.
- [0001](0001-deterministic-script-renders-pages.md) requires the same markdown to give the same bytes. pele in Node keeps that, since it measures text with a built-in width table, not the machine's fonts.

## Decision

- A fence whose info string is `mermaid` renders at render time, in Node, through pele: `<figure class="diagram">` holding inline SVG. The page runs no script for it, and the page policy needs no change, since it already allows inline styles.
- **Two layouts.** Render draws each diagram twice: wide (`maxWidth: 900`) and narrow (`maxWidth: 358`), both with a direction breakpoint above 900 so pele turns a left-to-right diagram top-to-bottom only when it doesn't fit. CSS shows one by the page's width. Each layout gets its own `idPrefix`.
- **Too wide.** An SVG shrinks to fit its column down to 75% of its natural size. Below that it keeps 75% and the figure scrolls sideways, as a wide table does. `check` fails on a diagram whose wide layout needs that scroll, naming its width. The narrow layout may scroll without failing, as tables do on a phone.
- **Errors.** A `PeleError` is a `RenderError` at the line it names inside the fence, or at the fence line when it names none, with its code and the first line of its message. `open`, `export` and `serve` fail on it the way they fail on any render error.
- **Gantt.** Render appends `todayMarker off` to a gantt diagram's source, so the chart doesn't depend on when or where it was rendered.
- **Theme.** `shell.css` sets every `--pele-*` variable from the page tokens, so diagrams follow the theme and its dark mode with no re-render. Chart series take a palette built from `--accent` and greys, never the status colours.
- **Named styles.** A diagram colours a node with a class, `:::accent` or `class X accent`, and `shell.css` styles a short list of names from tokens: `accent`, `muted`, and the kit's status tones `go`, `warn`, `stop` and `done`. Hex colours in `classDef` or `style` render as written, so the skill tells agents not to use them.
- **Links.** A diagram link to an absolute `http`, `https` or `mailto` URL works, with pele's `rel="noopener"`. A relative link is a `RenderError` telling the author to link the doc from the caption instead, since margent's link rewriting and `check` don't reach inside a diagram.
- **Bundle.** pele is a pinned devDependency, bundled into `dist/cli.js` and started lazily on the first diagram, so a command that draws no diagram doesn't pay its load time. The bundle keeps the licence notices of its dependencies.

## Consequences

- An agent writes a diagram as ten lines of text and changes it with a one-line edit. GitHub also renders the fence, so the raw `.md` shows the diagram there too.
- A diagram is a block like a table or a figure. A comment on it is a block comment line after the fence, and a selection in it becomes a quoted block comment. Because the SVG sits in the page, quotes are found without a frame round trip. Both layouts are in the DOM, so a quote must be searched in the shown layout only, or every phrase would match twice.
- Under `serve`, a diagram edits in the panel as source, like code.
- Diagrams match the page and follow its theme, and a project that later overrides tokens restyles them too.
- `dist/cli.js` nearly doubles. That is the price of drawing diagrams with no script in the page.
- margent follows pele's releases by hand. pele is young (1.13.0 came out on 2026-10-31), so the exact version is pinned and bumped on purpose.
- Mermaid features pele drops or filters (JS callbacks, HTML labels, unsafe styles) stay out of margent too.

## Alternatives considered

- **Mermaid.js in the page.** Rejected: 1.6 MB of script on every page with a diagram, a hash in the page policy, layout at load time that differs between machines, and no render in Node, so `check` couldn't see syntax errors without Chrome.
- **pele in the page (`mount`).** Rejected for M8: it adds 730 KB of script per page to gain a layout for any width, and two layouts rendered in Node cover the column and the phone.
- **Diagrams as islands.** Rejected: islands run agent-written code in a sandboxed frame, for visuals drawn from table data. A diagram is a built-in renderer with escaped output, and a frame would hide its text from page search and comments.
- **Hand-drawn SVG only.** Rejected as the default: the cost per diagram is high, and an edit means a redraw. It stays the tier for illustrations ([0046](0046-three-visual-tiers.md)).
- **Mermaid CLI or a headless browser at render time.** Rejected: render would need Chrome, which only `check` needs today, and Mermaid's output depends on the fonts on the machine.
