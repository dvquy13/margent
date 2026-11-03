---
title: Plan · M8 Mermaid diagrams
status: draft
updated: 2026-11-03
---

# Plan · M8 Mermaid diagrams

Task order for [the M8 spec](../specs/m8-mermaid-diagrams.md) (D1 to D9, A1 to A9). Five phases on branch `m8-mermaid-diagrams`, merged and released as one `feat:` version when the user says so. Phase 0 settles the spec's two open risks before any code depends on them. Delete this plan when M8 closes, once its contracts are in `architecture.md`.

## Tracker

- [x] Phase 0 · Settle the risks
  - [x] T1 Custom Highlight on SVG `<text>` in Chrome (D5.4): it paints, the existing path stays
  - [x] T2 Label fit with Google Fonts blocked (D1, A4): node labels fit, no `measurer`
  - [x] T3 Baselines on `main`: CLI time and size (A7)
- [x] Phase 1 · Render, fast tier green
  - [x] T4 Bundle pele (D7): its own `dist/pele.cjs`, see T4
  - [x] T5 Fence to figure, two layouts, gantt (D1)
  - [x] T6 Errors and their fixtures (D2)
  - [x] T7 Diagram stylesheet: tokens, palette, named styles, layouts, width floor (D1.5, D1.6, D4)
  - [x] T8 `check` width rule (D3)
- [ ] Phase 2 · Comments, serve and export, full tier green
  - [ ] T9 Anchor kind `diagram` (D5.1)
  - [ ] T10 Quotes in the shown layout, selection, marks and card alignment (D5.2 to D5.4)
  - [ ] T11 `serve` panel and `export` (D6)
- [ ] Phase 3 · Agent side
  - [ ] T12 Skill tiers and `references/diagrams.md` (D8.1, D8.2)
  - [ ] T13 Evals (D8.3, A8)
- [ ] Phase 4 · Acceptance and close
  - [ ] T14 Acceptance tests and runs (A1 to A7), `npm run test:full`
  - [ ] T15 Docs (D9)
  - [ ] T16 Real doc reviewed by the user (A9)

## How the work runs

- Tasks that touch separate files go to Haiku subagents, one task each; the lead writes the brief and reviews the diff. Subagents run tests in the foreground.
- Test names cite D and A IDs. A new browser test passes `full` from `test/helpers/tier.mjs` unless it is a feature's main path ([0027](../decisions/0027-two-test-tiers-and-frozen-corpora.md)).
- Fixtures are synthetic or public. The spike's real diagrams include private repos and stay out of the repo.
- Commits use `feat:`, `fix:`, `test:` and `docs:` as they land.

## Phase 0 · Settle the risks

### T1 Highlights on SVG text

A throwaway page in Chrome: an inline pele SVG, `CSS.highlights.set('margent-quote', new Highlight(range))` over part of a `<text>` node, and the page's `::highlight(margent-quote)` rule. Screenshot it.

- It paints: D5.4 uses the existing highlight path, unchanged.
- It doesn't: D5.4 marks the node instead. The mark adds a class to the `<g class="pele-node">` (or edge label) that holds the match, and the stylesheet tints its shape. Record the choice in the spec's Risks before T10.

Done when: the screenshot shows the result and the spec says which path D5.4 takes.

### T2 Fit with fonts blocked

Rerun the spike's fit measurement (every node label against its shape) on the 10 synthetic spike cases with the Google Fonts hosts blocked, at 15px, in Chrome on this machine.

- No label overflows: pele's built-in width table stays.
- Some overflow: measure how much wider the fallback runs, and pass pele a `measurer` that scales its widths by that factor. Record it in the spec.

Done when: the result and any `measurer` choice are in the spec.

### T3 Baselines

On `main`, record `dist/cli.js`'s size and the median of 10 runs of `margent --version` and of `check` on a doc without diagrams (`test/fixtures/` has one). A7 compares against these.

Recorded 2026-11-03 at `4f708f9` (same code as `main`), load average about 3: `dist/cli.js` is 827,506 bytes; `node dist/cli.js --version` 60.2 ms median (51.7 to 181.7); `node dist/cli.js check test/fixtures/render/docs/basic.md` 60.8 ms median (59.3 to 67.2).

## Phase 1 · Render

### T4 Bundle pele

1. `npm install --save-dev --save-exact pele@1.13.0`.
2. `renderDoc` (`src/render/page.ts`) is synchronous and has many callers, so pele must load synchronously on first use. Recommended: a new `src/render/diagrams.ts` loads pele with `require('pele')` inside the function that first needs it. esbuild resolves a `require` of a bundled ESM module at build time and wraps the module in a lazy init, so pele is evaluated only when a doc has a `mermaid` fence. Check the bundle for that wrapper. If it doesn't hold, fall back to a static import and measure whether T3's timings still hold, and record the choice in the spec.
3. `scripts/build.mjs` sets `legalComments: 'none'`, which strips the licence notice of every bundled dependency (markdown-it, turndown and yaml today). Switch the CLI bundle to `legalComments: 'eof'` or `'linked'` so every notice ships, pele's included.

Done when: `dist/cli.js` holds pele and the bundled licences, and a test shows `margent --version` doesn't evaluate pele (or the T3 timings hold).

Outcome: the lazy `__esm` wrapper held, but the 730 KB still cost about 12 ms of parsing per run (`--version` 52 to 65 ms, `check` 60 to 74 ms against a `main` build, same load). pele is now built as `dist/pele.cjs`, which `loadPele` requires, and the timings match `main` within 1 ms (`dist/cli.js` 845,498 bytes, `dist/pele.cjs` 737,323). The licences come from each package's `LICENSE` file, since pele and most others carry no licence comment.

### T5 Fence to figure

1. In `src/render/markdown.ts`'s fence rule, a fence whose info string's first word is `mermaid` calls `renderDiagram(source, {line, index})` from `diagrams.ts`. Other fences are unchanged.
2. `renderDiagram` appends `todayMarker off` to a gantt source, calls `render` twice (wide: `maxWidth: 900`; narrow: `maxWidth: 358`; both `directionBreakpoint: 1200`, `fontSize: 15`, the UI font stack, `idPrefix` `d{index}w-` and `d{index}n-`), and returns `<figure class="diagram" data-src>` with `div.diagram-wide` and `div.diagram-narrow`, each holding its SVG and a `--w` custom property with the SVG's natural width.
3. `renderDoc` returns `diagrams: [{line, width}]` (wide width) for `check`.
4. A doc without a fence renders byte for byte as before: every existing golden is unchanged.

Done when: render tests cover each spec D1 point, and the golden suite passes untouched.

### T6 Errors

1. A `PeleError` becomes `RenderError` at `{fence line} + error.line` (the fence line when `line` is 0): `mermaid {code}: {first line of message}`.
2. A link in `result.links` whose `href` is not an absolute `http`, `https` or `mailto` URL is a `RenderError` with the D2.2 message.
3. Fixtures under `test/fixtures/` for `syntax`, `semantic`, `limit`, `unsupported-diagram` and the relative link, each with its expected `check` output. Find a source for `semantic` by reading pele's error sites; if pele has no reachable `semantic` error, say so in the spec and drop that fixture.

Done when: CLI tests show each line and exit 1 in `check`, `open` and `export`.

### T7 Diagram stylesheet

Load the `design-principles` skill first.

1. `shell/diagrams.css`, added to `{{head}}` only when the doc has a diagram, as `comments.css` is.
2. Every `--pele-*` variable from tokens, in both themes. The series palette (`--pele-series-1` to `-8`): accent first, then steps of accent and grey mixed with `color-mix`, never `--green`, `--amber` or `--red`.
3. Named styles: `.pele-node.accent`, `.muted`, `.go`, `.warn`, `.stop`, `.done`, styling the node's shape and label from tokens. The status tones use the same colours as the kit's `tone`.
4. The figure is `container-type: inline-size`. Below 640px it shows `.diagram-narrow`, otherwise `.diagram-wide`, the other `display: none`. Print shows the wide one.
5. Each SVG is `width: 100%; max-width: var(--w); min-width: calc(var(--w) * 0.75)`, and the figure scrolls sideways (`overflow-x: auto`).

Done when: screenshots of the T5 fixture at 390 and 1280px in both themes look right to the lead, and a browser test asserts the shown layout at each width.

### T8 `check` width rule

`check` prints the D3.1 line for each diagram whose `width` is over 1200, after links and before page problems, sorted with the rest by file and line. No Chrome is needed for it.

Done when: a CLI test with a 1400px fixture prints the line and exits 1, and a 1100px one passes.

## Phase 2 · Comments, serve and export

### T9 Anchor kind

`anchorKindOf` in `src/render/comments.ts` returns `diagram` for a `mermaid` fence. `comments` and the quote messages in `check` then say `diagram`.

Done when: render and `comments` tests show it.

### T10 Quotes and marks

1. `runtime/quote.js` (`MargentQuote.find`, `occurrence`): skip text under an element that is not rendered (`display: none`), so a diagram's hidden layout is never searched. Check this doesn't change any table or prose case.
2. `runtime/edit/anchor.js`: a selection inside `figure.diagram` is a block comment with the selected text as its quote, and `#n` from `MargentQuote.occurrence` when it repeats.
3. Marks and card alignment take the path T1 chose.
4. Corpus cases for A6 in `test/edit-corpus/`: select a phrase in a diagram, a repeated phrase, hover the card, and a missing quote failing `check` with `diagram`.

Done when: the corpus cases pass and every existing corpus case still passes.

### T11 serve and export

1. Under `serve`, a diagram's edit control opens the panel with the fence source, as for code. A save that leaves a pele error follows today's path for a save with a render error. Read that path first and test the case.
2. `export --md`, with and without `--clean`, keeps the fence as written.

Done when: a served-page test edits a diagram's source in the panel and sees the new SVG, and export tests show the fence kept.

## Phase 3 · Agent side

### T12 Skill

1. `skills/margent/SKILL.md`: "When a diagram earns its place" gives the three tiers in [0046](../decisions/0046-three-visual-tiers.md)'s order, the test for moving up a tier, and points to the reference. The doc format example gets a `mermaid` fence with its caption. "When an island earns its place" keeps "a static structure is a diagram", now naming Mermaid first.
2. `skills/margent/references/diagrams.md` with the five parts in D8.2.
3. Keep the skill's frontmatter description triggers as they are, and check strict YAML (`test/scaffold.test.mjs`).

### T13 Evals

Three new cases in `evals/` (D8.3), shaped like `positive-design-note` and `positive-add-visual`. Then `claude plugin eval` must pass every case 3/3. A miss sends the fix back to T12's wording, not to the eval.

## Phase 4 · Acceptance and close

### T14 Acceptance

A1 `npm test` and typecheck; A2 the diagrams fixture golden under two `TZ` values; A3 from T6; A4 a full-tier browser test at 390 and 1280px, both themes, fonts loaded and blocked; A5 from T7 and T8; A6 from T10; A7 against T3's baselines. Then `npm run test:full`.

### T15 Docs

`architecture.md`: Diagram HTML (the figure, both layouts, `--w`), the stylesheet in `{{head}}`, `renderDoc`'s `diagrams`, the check line, the quote rule for hidden layouts, and pele in the bundle. `README.md`: diagrams in the feature list. The design doc only where the build differs from it. The spec's Results.

### T16 Real doc

Add a Mermaid diagram to one doc in this repo, where a reader now rebuilds a flow from prose (for example the save path in `docs/architecture.md`'s edit runtime section). Serve it, and the user reviews it in both themes, comments on it, and accepts it. The agent answers each comment through the normal review flow.

Done when: the user accepts it. Then close M8 with the `project-docs` close-out.
