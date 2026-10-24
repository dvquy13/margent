---
title: margent architecture (as built)
status: accepted
updated: 2026-10-25
---

# margent architecture

> Markdown in, a self-contained designed page out, with no LLM in the loop. Islands are agent-written visuals whose data stays in the markdown.

This file describes only what exists in code. For the intended system, see [design](design/system-design.md). For why, see [decisions](decisions/README.md).

## Structure

| Path | What it is |
|---|---|
| `src/render/` | frontmatter, slugs, markdown-it setup ([0011](decisions/0011-markdown-it-for-parsing.md)), docs root, `comments.ts` (comment markup rules and thread records), `page.ts` (`renderDoc`, which fills the shell and lists every script hash), `policy.ts` (`pagePolicy`, `scriptHash`: the page's Content-Security-Policy) |
| `src/comments/` | `syntax.ts`: the note grammar and pure edits on one block's source (`noteSource`, `nextId`, `appendNote`, `stripThread`, `stripAll`), shared by node and the edit runtime; `clean.ts`: `cleanSource` for `export --clean` |
| `src/islands/` | `parse.ts` (markers and fences to `<agent-island>`), `lookup.ts` (module lookup), `validate.ts` (`loadIsland`: reads a module as text and wraps it with the kit's `moduleScript`; no module code runs in Node) |
| `src/cli.ts`, `src/cli/` | `open`, `check`, `comments`, `export`, `serve`, `doctor`, `--version`; `islands-run.ts` is the headless island run behind `check`, `comments.ts` the thread list, `doctor.ts` the environment check behind `doctor` |
| `src/serve/` | `server.ts` (the `serve` HTTP server), `watch.ts` (`watchTree`: Node's recursive watcher on macOS and Windows, one watcher per folder on Linux, where Node 22's recursive watcher loses a file replaced by a rename), `splice.ts` (hash, splice, validate, atomic write), `index-page.ts` (the `/` doc index) |
| `src/errors.ts` | `RenderError(file, line, message)`, whose message is `{file}:{line}: {message}` |
| `runtime/` | plain browser JS and CSS inlined into pages: `kit.js`, `host.js` (the page side of each island), `theme.js`, `island.css`, and `comments.js` (the comment rail, only on pages with threads) |
| `runtime/guest.js` | the island guest: inlined as text into every island's sandboxed frame, where it checks and renders the module. Its other end is `host.js` |
| `runtime/edit/` | the edit runtime, inlined only into `serve` pages: `main.js` (entry), `turndown.js` (house rules), `gate.js`, `inline.js`, `panel.js`, `reload.js`, `anchor.js` (selection to source), `comments.js` (comment UI), `edit.css` |
| `shell/` | `shell.html`, `shell.css` and `comments.css` (only on pages with threads), the only place page-level design lives |
| `skills/margent/` | the agent-side skill, island contract and design guide (`references/`) |
| `skills/docs-open/`, `skills/docs-serve/`, `skills/docs-review/` | the user-invoked skills (`disable-model-invocation: true`): `/docs-open`, `/docs-serve`, `/docs-review` |
| `.claude-plugin/` | the thin Claude Code plugin and its marketplace over `skills/`. No `bin/`, no hooks |
| `scripts/build.mjs` | esbuild build (below) |
| `scripts/accept/` | acceptance scripts: text coverage, link walk, screenshots, fonts-blocked pixel diff, `comment-copies.mjs` (commented copies of a docs tree for the gate report) |
| `evals/` | `claude plugin eval` cases for skill triggering |
| `test/` | `{area}.test.mjs`, `fixtures/`, `golden/`, `helpers/` ([0010](decisions/0010-node-test-golden-files-playwright-core.md)). Two tiers: a test passing `full` from `helpers/tier.mjs` runs only in `npm run test:full`; `fixtures/corpus/` holds frozen copies of a second project's docs and of margent's own docs, which the corpus walks read ([0027](decisions/0027-two-test-tiers-and-frozen-corpora.md)). `edit-corpus/` holds the scripted Chrome edits that define M2 done ([0018](decisions/0018-m2-done-when-scripted-edit-corpus.md)) and M3's comment cases ([0022](decisions/0022-m3-done-when-corpus-and-real-review.md)) |
| `docs/` | project docs: design, this file, decisions, specs, plans and results. Map and rules in [README.md](README.md) |

## Build

`scripts/build.mjs` makes three outputs, in this order:

- `.build/runtime/edit.js`: `runtime/edit/main.js` bundled for the browser as an IIFE, with `turndown` and `src/comments/syntax.ts` inside ([0017](decisions/0017-gate-and-turndown-run-in-the-browser.md)). The build fails if it contains `</script` or `</style`. It comes first because `src/serve/server.ts` imports it with `?raw`.
- `dist/cli.js`: `src/cli.ts` bundled into one ESM file for node22, with a shebang and no runtime dependencies ([0009](decisions/0009-typescript-cli-bundled-into-one-file.md)). Text assets (`shell/`, `runtime/`) are imported with a `?raw` suffix and inlined as strings, so the file is self-contained. It is the npm package's `bin` (`margent`), and `files` limits the published tarball to it. `prepack` builds it, and git doesn't track it (`.gitignore`), so it is built, not committed ([0024](decisions/0024-margent-name-and-distribution.md)).
- `.build/`: every `src/**/*.ts` as its own bundle, paths preserved. Tests import these. There is no shared index module.

## Page contract

### Shell slots

`page.ts` fills each slot in `shell/shell.html` once. Text slots are escaped, HTML slots go in verbatim.

| Slot | Kind | Content |
|---|---|---|
| `{{title}}` | text | page `<title>` |
| `{{policy}}` | text | the page's policy, in a `<meta http-equiv="Content-Security-Policy">` after the charset meta (see [Script policy](#script-policy)) |
| `{{head}}` | html | generator meta, then one `<style>` with `shell.css` and `runtime/island.css`, plus `shell/comments.css` when the doc has threads and `runtime/edit/edit.css` under `serve` |
| `{{project}}` | text | header wordmark: the parent folder's name if the docs root is called `docs`, else the docs root's name |
| `{{meta}}` | text | status, version and updated, then `{n} open` when the doc has threads, joined with ` · `, skipping missing ones |
| `{{hero}}` | html | the `<h1>` plus every block before the first `##` |
| `{{toc}}` | html | `<nav class="toc">` with one link per `##`, or empty when there is none |
| `{{main}}` | html | one `<section id="{slug}">` per `##` |
| `{{source}}` | text | the md path relative to the docs root, for the footer |
| `{{scripts}}` | html | with islands: each island module (`script.island-module`, as text), then `#margent-guest-kit` and `#margent-guest-runtime` (the kit and guest runtime as text, which each frame copies), then `kit.js` and `host.js` inline. Then `theme.js` (always present) and `runtime/comments.js` when the doc has threads. Under `serve`, then `<script type="application/json" id="margent-state">` (`{path, hash, source, author}`, every `<` escaped) and the edit bundle |

Tokens live on `:root`, with dark values under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and under `:root[data-theme="dark"]`. `#theme-toggle` in the header is wired by `theme.js`.

### Block HTML

- Every top-level block's outermost element has `data-src="{start}-{end}"`: 1-based inclusive lines of the original file, frontmatter included. M2's in-page editing splices by these.
- Headings get GitHub-style slugs, deduplicated across the page. The h2 slug goes on its `<section>`. The title gets one too, so a `##` with the same text as the title becomes `{slug}-2`.
- Tables: `<div class="scroll"><table>`. SVG figures: `<figure><div class="scroll"><svg>…</svg></div><figcaption>`. Code: `<pre><code class="language-x">`.
- Markers for house turndown, attributes only so no pixel changes: `data-gap="1"` on a list item that follows a blank source line, and `data-md-href` / `data-md-src` holding the author's target when the renderer rewrote a link or image. A soft break is the bare `\n` markdown-it writes, with no marker ([0019](decisions/0019-soft-breaks-read-from-the-dom.md)).
- `renderDoc` returns `deps`: the `.md`, each island module it uses and each SVG it inlines. `serve` maps file changes to pages with it.

### Comment HTML

Comments are inline CriticMarkup ([0005](decisions/0005-comments-as-inline-criticmarkup.md)): `{==text==}` then notes `{>>[c{n}] {author}: {text}<<}`. The `margent_comments` core rule runs after inline parsing, before islands, and throws every malformed comment as a `RenderError`. A doc without comment markup renders byte for byte as in M2.

```html
<mark class="c-hl" data-c="c3">96% of <strong>GitHub</strong> issues</mark><span class="c-thread" data-c="c3"
  data-md="{>>[c3] Quy: is that stable?<<}" contenteditable="false"><span class="c-note"><b class="c-author">Quy</b> is that stable?</span></span>
<p class="c-line" data-src="21-21" data-anchor="17-19">…one thread…</p>   <!-- block comment line, anchored to the block above -->
```

- `data-md` is the exact source of the thread's notes; house turndown writes it back.
- A block comment line whose first note starts `"{phrase}" →` renders the phrase as `<q class="c-quote">`, and its record carries `quote` ([0023](decisions/0023-comment-rail-and-quoted-block-comments.md)).
- `renderDoc` returns `comments`: one `Thread` per thread in document order (`id`, `line`, `kind` inline, point or block, `block` and, for a block comment line, `anchor`, `anchorKind` and `quote`, `highlight`, `notes`). `check`, `comments`, `export --clean` and the `serve` index read it.
- Slugs and TOC labels skip notes and keep highlighted text, so a commented heading keeps its anchor.
- Comment markup in a table cell, island YAML or a figure caption is an error: a block comment line goes after the block instead.
- The rail ([0023](decisions/0023-comment-rail-and-quoted-block-comments.md)): `runtime/comments.js` sets `html.c-rail-on` and builds `<aside class="c-rail">` with one `<article class="c-card" data-c data-kind>` per thread (its highlight text or quote, its notes, and an empty `.c-actions`), cloned from the threads, which stay in their blocks at zero size so a drag-delete can't reach their notes. From 1100px wide the rail sits right of the content, each card at its anchor's top and stacked when they collide, relaid out on resize, island renders and font load. Below 1100px it is a drawer. `window.margentComments` (`cards`, `relayout`, `reveal`, `close`, `showDraft`, `hideDraft`) is the edit runtime's hook: the note box goes into the rail as a draft card, level with its selection or under its thread's card, and docks at the bottom below 1100px. Served pages always carry the rail, inactive until it has a card or a draft, so the first note on a doc gets one too. Print and no JS keep the inline layout.

### Island DOM

```html
<agent-island name="{name}" data-kind="table|yaml" data-src="{start}-{end}" data-state="rendered|error">
  <script type="application/json" class="island-data">{"data": …, "rowLines": [42, 43]}</script>
  <div class="island-fallback"><div class="scroll"><table>…</table></div></div>   <!-- yaml: <pre> of the source -->
  <div class="island-mount"><iframe sandbox="allow-scripts" srcdoc title="{name}"></iframe></div>   <!-- added by host.js -->
</agent-island>
…
<script type="text/plain" class="island-module" data-name="{name}" data-path="{display path}">window.__margentModules["{name}"] = {wrapped module};</script>   <!-- once per name -->
```

- `data` is the parsed table or YAML. `rowLines[i]` is the source line of table row `i` (empty for YAML). `mismatches` is no longer in the payload; the guest computes it.
- The module's script text is exact: `loadIsland` (`src/islands/validate.ts`) builds it with the kit's `moduleScript`, and the browser never rewraps it. The kit (`kit.js`) and the guest runtime (`guest.js`) are the texts `#margent-guest-kit` and `#margent-guest-runtime`.
- `host.js` (`AgentIsland`) builds each frame's `srcdoc` on connect (`srcdocFor`). The document holds the guest's own policy (`GUEST_POLICY`), the page's Google Fonts link, the island as JSON in `#margent-island` (`{name, path, kind, data, rowLines, module}`, every `<` escaped), then the kit and guest runtime. A failure before the frame exists (no data, no module text, no guest runtime) is shown in the page's box, and the state is `error`.
- The guest (`guest.js`) sits in the frame. Its `render` runs the module (through a `script` element, so a throw at load is caught), checks `contract`, `schema` (`MargentKit.validate`) and column patterns (`MargentKit.checkPatterns`), then calls `render(root, data, kit)` on an open shadow root. A failed check shows `MargentKit.showError` in the frame and posts `state: error`.
- `island.css` shows the fallback unless `data-state="rendered"` or `data-reserved`, so JS off and errors both show the original table. Print hides the frame and badge and shows the fallback.
- Each reported height is kept in `sessionStorage` under `margent-island-height:{path}:{index}:{name}:{width}`. On the next load in the tab, `host.js` starts the frame at that height and sets `data-reserved`, so a reload (every save under `serve`) doesn't shift the page ([0028](decisions/0028-islands-start-at-their-remembered-height.md)). The first state clears `data-reserved`; with no state after `STATE_WAIT_MS` (10s) the frame goes back to height 0 and the fallback shows. Blocked storage warns once in the console, and frames start at 0.
- `host.js` adds a light-DOM `.island-badge` when there are mismatches, placed before `.island-mount`.
- The kit global is `MargentKit` (`runtime/kit.js`): `CONTRACT`, `currentTokens`, `baseCss`, `md`, `esc`, `fmt`, `tone`, `validate`, `checkPatterns`, `wrapModule`, `moduleScript`, `showError`, `watchTheme`. Node evaluates the same file in `node:vm`, but only for `wrapModule` and `moduleScript`.

### Island messages

Each frame talks to the page only through `postMessage` ([0025](decisions/0025-islands-run-only-in-a-sandboxed-frame.md)). The guest's `post` uses target origin `*`; the page's listener answers only to `ev.source === iframe.contentWindow` for an island that is not failed.

| Type | Direction | Fields | Use |
|---|---|---|---|
| `ready` | guest to page | none | the guest is listening; the page answers with `tokens` |
| `tokens` | page to guest | `tokens`, `colorScheme` | theme on the first message (the guest renders then) and on every change; the guest sets `color-scheme` |
| `state` | guest to page | `state` (`rendered` or `error`), `error`, `mismatches` | after render or failure, and again as `error` when the island throws later (a timer, a handler, an `onTheme` callback) |
| `height` | guest to page | `px` | from a ResizeObserver on the guest's host box; the page sets the frame's height |
| `measure` | page to guest | `id` | measure overflow now, at the frame's current width |
| `overflow` | guest to page | `id`, `overflow` (`{description, side, px}` or `null`) | the answer to `measure`, with the spill rule `check` used before M5 |
| `open` | guest to page | `url` | a click on a link. The guest prevents the default; the page opens only `http:`, `https:` or `mailto:` links, with `window.open(url, '_blank', 'noopener')` |
| `selection` | guest to page | `text`, `rect` (frame coordinates) or `null` | on `pointerup`, the text selected inside the island |
| `mark` | page to guest | `phrase` or `null` | highlight a phrase with the CSS Custom Highlight `margent-quote` (comments, below) |
| `hover` | guest to page | `inside: true` | on `pointerenter` of the document. See [edit controls](#edit-runtime) |

- The page's `window.margentIslands` has two members. `report()` sends `measure` to every guest and resolves, within 10s for states and 5s per overflow, to `{name, state, error, mismatches, overflow}` for each `<agent-island>` in document order, and sets `data-overflow`. `mark(el, phrase)` posts `mark` to one island's frame.
- On the page, `host.js` sets `data-state` (`rendered` or `error`), `data-error` (on error), `data-mismatches` (JSON, when there are any) and `data-overflow` (JSON, after a measure that found a spill). `data-state` drives the comment rail and the fallback CSS.
- A late error (after the first render) reaches the page as `state: error`. An error a guest cannot report (a blocked script, see [Script policy](#script-policy)) shows only as an island that never reports.
- Frames are created eagerly on load (about 100 ms for 20 islands, S6).
- In dark mode the frame paints no white canvas: the guest's `color-scheme` follows the page's.

### Script policy

Every page carries a `Content-Security-Policy` ([0025](decisions/0025-islands-run-only-in-a-sandboxed-frame.md), spike S6). `pagePolicy` in `src/render/policy.ts` builds it from the list of script texts `renderDoc` collected:

- `script-src` lists the sha256 of each text, base64 of its UTF-8 bytes (`scriptHash`), and nothing else, or `'none'` when the page has no script. The texts are the module scripts, the kit and guest runtime as the guest runs them, `kit.js`, `host.js`, `theme.js`, `comments.js` when present, and under `serve` the edit bundle.
- Every executable inline script goes through `inlineScript` in `src/render/page.ts`, which records its text. The guest inserts the module text byte for byte, so its hash matches.
- `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`.
- `connect-src 'self'` under `serve`, `'none'` for a page written to disk.
- `style-src 'unsafe-inline' https://fonts.googleapis.com` and `font-src https://fonts.gstatic.com`. There is no `img-src` and no `default-src`, so images in docs load.
- A script, inline handler or form written into the markdown does not run or submit. The policy blocks what runs; the markup stays.
- A srcdoc frame inherits the page's policy, so a guest's script runs only if its hash is in the page's list, though the guest's own policy allows `'unsafe-inline'`. `GUEST_POLICY` in `host.js` (`default-src 'none'`, `script-src 'unsafe-inline'`, `img-src data:`) is the guest's second layer: it blocks the guest's network and images.
- `serve` sends the policy as the `Content-Security-Policy` header, on pages, the error page and the index. The index has no script, so its list is `'none'`.

## Behavior

- Docs root is the nearest ancestor containing `islands/`, else the file's folder. Island lookup and relative links stop there. [0013](decisions/0013-docs-root-is-nearest-islands-ancestor.md)
- A folder given to `check`, `export`, `comments` or `serve`'s index is walked for `.md` files, skipping `node_modules`, dot-folders and whatever git ignores; a named folder that is itself ignored is walked in full (`markdownUnder` in `src/cli/collect.ts`). [0029](decisions/0029-folder-walks-skip-gitignored-files.md)
- `open` renders into `${XDG_CACHE_HOME:-~/.cache}/margent/{sha1 of root}/`, so renders never land in the repo. [0012](decisions/0012-open-renders-into-user-cache.md)
- Render fails (`RenderError`) only on what it can see without running code: a missing module, a module the wrap rejects (an `import`, a script tag, `</script` or `<!--` in the source, an unsupported export, no default export), and marker, table and YAML errors. Spec [m1-render-islands](specs/m1-render-islands.md) R1 and R3.
- The guest checks the rest: a module that throws at load, the `contract`, `schema` and `render` checks, schema validation, a column pattern that names no column, and pattern mismatches. The island shows the error in its box, `check` reports it, and a save that breaks an island's data is accepted. Mismatches warn and never fail anything, so a reworded cell still renders as written with a badge. Spec [m5-ship](specs/m5-ship.md) R1 and R3 ([0025](decisions/0025-islands-run-only-in-a-sandboxed-frame.md)).
- Islands run in `<iframe sandbox="allow-scripts" srcdoc>`, never in the page's own DOM or in Node. See [Island messages](#island-messages) and [Script policy](#script-policy).
- `check` runs islands headless at 390px and 1280px and fails on overflow. [0014](decisions/0014-check-tests-overflow-at-two-widths.md) `src/cli/islands-run.ts` loads the page once at 390px, reads each island's row lines, and calls `window.margentIslands.report()` at each width through `ChromeSession.evaluate` with a 20s bound (`REPORT_CALL_MS`; the default bound is `PAGE_TIMEOUT_MS`, 10s). An island with no `data-state` after report's 10s wait prints `{file}:{line}: island {name}: did not report within 10s`. A `state: error` prints its `data-error` as is, a mismatch prints at its table row's line, and an overflow prints at the island's line. Output is sorted by file, then line. An uncaught exception in the page itself prints `page error` at line 1.
- `margent doctor` prints one line per check and exits 1 if any fails. Checks, in order: `node` (22 or later), `margent` (the version), `chrome` (`findChrome`: `MARGENT_CHROME`, then the default locations), `opener` (`BROWSER`, else `open` or `xdg-open`, on PATH), `cache` (the cache folder is writable), `author` (a warning only, from `git config user.name`: notes in `serve` need it) and `islands` (renders a built-in sample doc in a temp folder and runs its island in headless Chrome through `runIslandPages`; skipped when Chrome fails). A fail line ends with the fix.
- `comments {path}` prints one head line per thread (`{file}:{line}: [{id}] needs agent|needs you · {what}`) and its notes, then a summary. `needs you` when the last note is by `Claude`. It renders without running islands, and exits 1 with each `file:line` on malformed markup.
- `export --md` writes `.md` files instead of pages. `--clean` strips comments through `cleanSource` (each commented block through `stripAll`, block comment lines through the splice delete rule); with `--md` it also deletes island markers and turns island fences into `yaml`. The page form renders the cleaned source.

## Serve

`margent serve {root}` runs one `node:http` server on 127.0.0.1 ([0016](decisions/0016-serve-binds-localhost-with-session-token.md)). Pages render in memory on each request with the edit slot. The note author is resolved once at start: `--author {name}`, else `git config user.name` in the root, else `null`, which is logged and makes the page refuse notes ([0021](decisions/0021-comment-operations-are-block-saves.md)). A name the note grammar can't hold is a startup error. A page's docs root is the nearest `islands/` ancestor, bounded by the served root, else the served root.

| Route | Response |
|---|---|
| any path with `?token=` | sets cookie `margent-{port}` (`HttpOnly; SameSite=Strict`) and 302s to the path without the query. The name holds the port, because browsers don't scope cookies by port |
| `GET /` | the doc index: each doc rendered, with its open thread count, or its error. Sent with the policy header (no script, so `script-src 'none'`) |
| `GET /{path}.html` | the page, sent with its policy as a `Content-Security-Policy` header, or a 500 error page listing every `file:line: message` that reloads when the `.md` changes. The error page's policy lists its own script's hash |
| `GET /{path}` other | a file under the root (realpath-checked), else 404. Any path segment that starts with `.` is a 404, a page included (`/.env`, `/.git/config`, `/docs/.secret.md`) |
| `GET /_events?path={md path}&hash={rendered hash}` | SSE: `event: changed` when a dep of that page changes, debounced 50 ms, and at once when the `.md` already differs from `hash`. Skipped for a page whose `hash` matches the `.md` when only the `.md` changed, so a save reloads its page once (the page reloads itself on the 200). One recursive `fs.watch` on the root |
| `POST /_save` | `{path, range: [start, end], hash, text}`: 409 when the hash is stale, 422 with errors when the spliced file fails to render, else an atomic write and 200 `{hash}` |
| without the cookie, a foreign `Host`, or a `POST` with a foreign `Origin` | 403, logged |

Splice: 1-based inclusive lines, each line keeps its own terminator, new lines take the file's ending (CRLF if its first break is), the final-newline state is kept, and a delete never leaves a doubled or dangling blank line.

## Edit runtime

`window.margent`, set by `runtime/edit/main.js`:

| Member | From | What |
|---|---|---|
| `state`, `blocks` | main | the page state; each top-level `[data-src]` element by range string |
| `sourceOf(range)`, `toMarkdown(el)` | main | source lines of a range; house turndown of a clone of an element |
| `gate` | gate | `{range, type, pass, reason}` per block. Candidates (`p`, `h1`–`h6`, `ul`, `ol`) pass when `toMarkdown` equals their source; they get `data-gate="pass"` or `"fail"`. A block comment line reports `comment` and is never edited in place |
| `anchor(range, blockEl)` | anchor | a selection to `{kind: 'inline', before, inner, after, snapped}`, `{kind: 'overlap', id}` or `{kind: 'block', reason}` |
| `save(range, text)`, `registerDirty(fn)`, `dirty()` | main | the one save path, and the unsaved-text check |
| `openPanel(range, {text, errors, notice})` | panel | the side panel, for every block without `data-gate="pass"` and for frontmatter |
| `reload()`, `idle()`, `stale(range, text)` | reload | reload keeping scroll, held while `dirty()`, and the one entry point the `changed` event uses too; run a held reload; after a 409, reload and reopen the panel with the text |

In-place editing (`inline.js`) makes one gated block `contenteditable`, saves on blur and Cmd+S, and hands 409s to `stale` and 422s to `openPanel`. Normalization of Chrome's editing DOM runs only on the clone that turndown reads, so native undo keeps working.

Islands take part too. A selection inside an island is in its frame, which the page can't read, so the guest's `selection` message arrives as a `margent:island-selection` event on the `<agent-island>` (`host.js` converts its rect to page coordinates). `comments.js` makes a block comment on the island that quotes the text, places the note box from the frame's rect, and marks the phrase inside the frame with `margentIslands.mark`. Marking happens in the guest's `findRanges`, which ignores whitespace: a quote from a selection across elements has spaces the text nodes lack. The rail uses the same mark when a card is hovered or focused.

Edit controls over islands: Chrome never applies `:hover` through a sandboxed frame. The guest posts `hover` when the pointer enters, `host.js` sets `data-hover` on the `<agent-island>`, and the page's next `pointerover` outside the frame clears it, since the frame gets no event when the pointer leaves. `edit.css` shows an island's controls on `[data-hover]`, and island controls always take the pointer, so a control can't be hidden under a frame.

House turndown writes `mark.c-hl` as `{==…==}` (nothing around it when its text is gone, leaving a point comment) and `span.c-thread` as its `data-md`; `prepareClone` replaces a thread's children with a placeholder so its notes are never read as content.

Selection anchoring ([0020](decisions/0020-selection-maps-through-turndown-sentinels.md)): `code` and `a` are taken whole, both boundaries move out to one inline parent, and a heading's `span.num` is skipped. A clone of the block gets U+E001 and U+E002 at the boundaries and goes through house turndown. Only when the output minus the sentinels equals the block's source are the slices used; otherwise the selection becomes a block comment. A selection across blocks or block children, or in code, is a block comment too.

The comment UI (`comments.js`) offers Comment at a selection and on every block next to its edit control, and Reply and Resolve in every rail card. A selection that becomes a block comment records its text as the note's quote. The pending highlight is a CSS Custom Highlight, so the DOM is untouched. Each operation is one `save` of the block's new source, built with `syntax.ts` ([0021](decisions/0021-comment-operations-are-block-saves.md)); 409 and 422 go to `stale` and `openPanel` as for edits. A note box with text counts as dirty.

## Distribution

- Three channels ([0024](decisions/0024-margent-name-and-distribution.md)): the npm package `margent` (the CLI, `bin` pointing at `dist/cli.js`); `npx skills add dvquy13/margent`, which installs `skills/` into any agent; and a thin Claude Code plugin with its own marketplace (`.claude-plugin/`) over the same `skills/`.
- The skills run the CLI as `margent` when `margent --version` prints the version they pin. Otherwise they run `npx -y margent@{version} {command}`. Each skill's `allowed-tools` lists both forms.
- `test/scaffold.test.mjs` fails `npm test` when `package.json`, `.claude-plugin/plugin.json`, a version in `skills/` or `dist/cli.js --version` differ. A release bumps them together.
- The plugin holds only skills, with no `bin/` and no hooks, so claude.ai and Cowork can install it. Hooks don't travel to other agents, so the rule against reading a rendered `.html` lives in the skill.
