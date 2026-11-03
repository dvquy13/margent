---
title: M8 spec · Mermaid diagrams
status: draft
updated: 2026-11-03
---

# M8 spec · Mermaid diagrams

M8 lets a doc draw a diagram as a Mermaid fence. Render turns each `mermaid` fence into inline SVG through pele, styled with the page tokens, with no script in the page ([0045](../decisions/0045-mermaid-fences-render-through-pele.md)). The skill makes Mermaid the default for common structures, keeps hand-drawn SVG for illustrations and islands for data ([0046](../decisions/0046-three-visual-tiers.md)). Requirement IDs are D1 to D9, and test names cite them.

M8 is done when every acceptance check below passes and one real doc in this repo gets a Mermaid diagram that the user reviews in `serve`, comments on, and accepts.

Evidence: spike S7, recorded in [0045](../decisions/0045-mermaid-fences-render-through-pele.md)'s Context.

## Scope

**In**

1. Rendering `mermaid` fences, in two layouts (D1).
2. Errors and `check` (D2, D3).
3. Theme, chart palette and named styles (D4).
4. Comments on diagrams (D5).
5. `serve` and `export` (D6).
6. Bundling pele (D7).
7. The skill, its new reference and evals (D8).
8. Docs (D9).

**Out** (later, or not planned)

- Project themes that override tokens. Deferred in [decisions/README.md](../decisions/README.md#deferred).
- Comments anchored to a node by its Mermaid ID (`@B`). Deferred in the same list.
- pele in the page: live preview while editing, or a layout for every width.
- Diagram links to other docs (relative links).
- Moving existing hand-drawn SVGs to Mermaid.

## Requirements

### D1 Render

1. A fence whose info string's first word is `mermaid` renders as `<figure class="diagram" data-src="{start}-{end}">` holding two SVGs from pele, `.diagram-wide` and `.diagram-narrow`. Every other fence renders as before.
2. Both layouts use `fontSize: 15`, the page's UI font stack as `fontFamily`, and a `directionBreakpoint` above 900. The wide layout uses `maxWidth: 900` and the narrow one `maxWidth: 358`. Each layout has its own `idPrefix`, unique in the page.
3. Render appends a `todayMarker off` line to a gantt diagram's source before it calls pele.
4. The same markdown gives the same bytes, in any time zone and on any machine.
5. The figure is a size container. Below 640 px of figure width it shows the narrow layout, otherwise the wide one, and the hidden layout is `display: none`. Print shows the wide layout.
6. An SVG shrinks to its figure's width, down to 75% of its natural width. Below that it stays at 75% and the figure scrolls sideways.
7. A doc with no `mermaid` fence renders byte for byte as before M8.

### D2 Errors

1. A `PeleError` is a `RenderError`, `{file}:{line}: mermaid {code}: {first line of its message}`. The line is the fence's opening line plus the error's `line`, or the opening line when the error has none.
2. A diagram link that is not an absolute `http`, `https` or `mailto` URL is a `RenderError`: `{file}:{line}: diagram links must be absolute URLs: link {target} from the caption instead`.
3. Each error code pele has (`syntax`, `semantic`, `limit`, `unsupported-diagram`) and the relative link have an error fixture.

### D3 check

1. `check` fails on a diagram whose wide layout is wider than 1200 px, which is where it would scroll in the 900 px column: `{file}:{line}: diagram is {w}px wide, so its text would shrink below 75% in the page column: split it, turn it top-to-bottom, or draw it as an SVG`. It reads the width from render, with no Chrome.
2. A narrow layout that scrolls on a phone doesn't fail, as a wide table doesn't.
3. Quoted comments on diagrams are checked as quotes in any other block (D5).

### D4 Theme, palette and named styles

1. A stylesheet, included only in pages with a diagram, sets every `--pele-*` colour, font and radius variable from the page tokens. Diagrams follow the theme toggle and dark mode with no re-render.
2. `--pele-series-1` to `--pele-series-8` form a palette built from `--accent` and greys, readable in both themes. Status colours never appear in it.
3. A node with the class `accent`, `muted`, `go`, `warn`, `stop` or `done` (`:::accent`, `class X accent`) is styled from tokens: `accent` with the accent tints, `muted` with muted text and border, and the four status tones with the colours the kit's `tone` gives them. This holds for every diagram type whose nodes carry Mermaid classes.

### D5 Comments

1. A block comment line after a diagram's fence anchors to the diagram. Its anchor kind is `diagram`, in the `comments` output and in `check` messages.
2. In a served page, a selection inside a diagram becomes a block comment that quotes the selected text, with `#n` when the phrase repeats in the diagram ([0041](../decisions/0041-quote-names-its-occurrence.md)).
3. `MargentQuote` searches only the shown layout, so each phrase is counted once. `check` counts at 390 px, which shows the narrow layout. Both layouts hold the same text.
4. Hovering or focusing the card marks the quoted phrase in the diagram, and the card lines up with it, as in a table ([M7 spec](m7-polish.md) P2).

### D6 serve and export

1. Under `serve`, a diagram edits in the panel as its fence source. A save that leaves a pele error is handled as any save with a render error is today.
2. `export` renders diagrams like `open`. `export --md` keeps `mermaid` fences as they are, with `--clean` too.

### D7 Bundle

1. pele is a devDependency pinned to an exact version, bundled into its own `dist/pele.cjs`, which the npm package ships next to `dist/cli.js`. `dist/cli.js` requires it on the first diagram.
2. A command that draws no diagram doesn't start pele: `margent --version` and `check` on a doc without diagrams take no longer than before M8. Bundled into `dist/cli.js` behind a lazy init, pele was never evaluated but still cost about 12 ms per run to parse, which is why it is a file of its own.
3. Each `dist/` file ends with the full `LICENSE` file of every package bundled into it. esbuild's `legalComments` can't do this: most packages, pele included, carry no licence comment in their code.

### D8 Agent side

1. `SKILL.md`'s "When a diagram earns its place" gives the three tiers in [0046](../decisions/0046-three-visual-tiers.md)'s order, the test for moving up a tier, and a pointer to the new reference. Its doc format example shows a `mermaid` fence with a caption.
2. A new `skills/margent/references/diagrams.md` holds:
   - the recommended diagram types, which are those spike S7 checked (flowchart, sequence, state, ER, class, gantt, timeline, mindmap, pie, quadrant, xychart), and a note that `check` reports any type pele can't draw;
   - the named styles, and the rule against hex colours, `style` lines and theme settings;
   - the width rule and how to fix a diagram that is too wide;
   - the rule for charts: numbers people check stay in an island over a table;
   - how comments attach to a diagram.
3. Evals, new cases in `evals/`:
   - a design note that describes a pipeline gets a `mermaid` fence and no new SVG;
   - a request for an illustration whose layout carries meaning gets an SVG in `assets/`;
   - a report with benchmark numbers gets a table with an island and no Mermaid chart.

### D9 Docs

`architecture.md` (Diagram HTML, the bundle, the stylesheet), the design doc's Renderer and Doc format if the build differs from them, `README.md` (diagrams in the feature list), and `CLAUDE.md` (status, and this spec in the list of ID prefixes).

## Acceptance

Each item is checked by a test or a recorded run on this machine.

| # | Check | How |
|---|---|---|
| A1 | `npm test` and `npm run typecheck` exit 0. Every golden for a doc without diagrams is unchanged. | `npm test` |
| A2 | A diagrams fixture (flowchart wide enough to turn top-to-bottom, sequence, state with named styles, ER, class, gantt, timeline, mindmap, pie, quadrant, xychart) matches its golden, rendered with `TZ=UTC` and with `TZ=America/Los_Angeles`. All fixtures are synthetic or public. | Render tests |
| A3 | Each D2 error fixture prints its `file:line: message` and exits 1 in `check`, `open` and `export`. | CLI tests |
| A4 | In Chrome at 390 and 1280 px, in both themes, with Google Fonts loaded and with them blocked: no node label is wider than its shape, nothing spills out of a figure, and the shown layout is the expected one. | Browser test |
| A5 | A fixture diagram 1400 px wide fails `check` with the D3.1 message, and its page scrolls the figure. | CLI and browser tests |
| A6 | Comment corpus cases: a selection in a diagram makes a quoted block comment; a repeated phrase gets `#n`; hovering the card marks the phrase; a quote not in the diagram fails `check` naming `diagram`. | Edit corpus |
| A7 | `margent --version` and `check` on a doc without diagrams are as fast as on `main`, and `dist/cli.js`'s size is recorded. | Recorded run |
| A8 | `claude plugin eval` passes every case 3/3, the D8.3 cases included. | Recorded run |
| A9 | The real doc: the user reviews the diagram in `serve` in both themes, leaves at least one comment on it, and accepts it. | Recorded review |

## Risks

- **Marking a phrase in SVG text.** Settled (2026-11-03, Chrome 156): `::highlight()` paints its `background-color` behind a range inside a pele `<text>`, in a node label and in an edge label, and the range has a real client rect. It doesn't paint `color` or `fill`. The page's highlight rules set only `background-color`, so D5.4 uses the existing highlight path, and card alignment uses the range's rect, unchanged.
- **Fonts blocked.** Settled (2026-11-03, the 10 synthetic spike cases, both layouts, 234 texts): pele keeps its built-in width table, with no `measurer`. Every node label fits its shape with Google Sans Flex loaded, and with Inter or `system-ui` as the fallback; the fallbacks run 0.92 to 1.12 times the web font's width (median 0.97 to 1.00). One edge label, two lines long in `syn-01`, runs 1.6 to 5.3 px past its background in every font, the web font included, because pele's table is 6% narrow on that line. A measurer would fix it only by copying pele's internal table into margent, since pele doesn't export it, so margent leaves it to pele. A4 checks node labels against their shapes, and edge labels only against the figure. This Mac has Google Sans Flex installed, so blocking the Google Fonts hosts still renders it; a fallback test must take it out of the stack.
- **Diagram types the spike didn't cover** (sankey, architecture, C4, and others) may look worse than the ones it did. The skill recommends only checked types.
- **pele moves fast.** Each bump is a deliberate change with A2 and A4 rerun.
- **GitHub renders the same fence with Mermaid,** which ignores margent's named styles. The raw view on GitHub stays readable, only plainer.
