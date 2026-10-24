---
title: M2 spec · Serve and edit
status: done
updated: 2026-10-25
---

# M2 spec · Serve and edit

M2 lets you edit a doc in its rendered page. `agent-docs serve` runs a local server over a docs tree, renders pages in memory, reloads them when their markdown changes, and accepts edits. Prose blocks are edited in place, everything else in a side panel showing the block's raw markdown, and every save splices only that block's source lines. After M2, fixing a sentence no longer means asking the agent. Comments (M3), the catalog (M4) and publishing (M5) build on it.

Design: [Editing in the page](../design/system-design.md#editing-in-the-page), [Renderer](../design/system-design.md#renderer) and [Security before a second user](../design/system-design.md#security-before-a-second-user). Evidence: spike S2 (pre-public archive), with the house turndown rules. M1 provides the `data-src` source maps every save depends on ([M1 R1.3](m1-render-islands.md#r1-renderer)).

## Scope

**In**

1. **Server:** `agent-docs serve {docs root}`: a doc index, in-memory renders, live reload, a save endpoint. Bound to 127.0.0.1 with a per-session token.
2. **Edit runtime:** the round-trip gate, in-place editing of prose blocks with house turndown, the side panel for every other block.
3. **Saving:** splice by line range, the stale-save check, validation before write.
4. **Renderer markers** that house turndown needs, invisible on the page.
5. **Agent side:** a `/docs-serve` command and a short skill addition.
6. **Edit corpus:** a scripted set of real-Chrome edits on copies of the first user's docs, which is M2's definition of done.

**Out** (later milestones)

- Comments, CriticMarkup handling and `export --md --clean` (M3). In M2 a block containing CriticMarkup goes wherever the gate sends it.
- The catalog and island promotion (M4).
- The island iframe sandbox, folder trust, `doctor`, publishing (M5). Before M5 islands still run with the page's full access, including the save endpoint ([0008](../decisions/0008-island-isolation-sandbox-ready-now-iframe-at-m5.md)).
- Creating a new block from the page except through the panel, drag to reorder, a formatting toolbar, and editing island visuals directly.
- Bumping frontmatter `updated:` on save.

## Decisions for M2

- [0016 `serve` binds 127.0.0.1 with a per-session token from M2](../decisions/0016-serve-binds-localhost-with-session-token.md)
- [0017 Round-trip gate and turndown run in the browser](../decisions/0017-gate-and-turndown-run-in-the-browser.md)
- [0018 M2 is done when a scripted edit corpus passes in real Chrome](../decisions/0018-m2-done-when-scripted-edit-corpus.md)

Spec-level choices, no record: a prose edit saves on blur and on Cmd+S, Esc reverts the block, paste lands as plain text, and live reload uses server-sent events.

## Requirements

### R1 Server

1. **Command:** `agent-docs serve {docs root} [--port {n}] [--no-open]`. The default port is one the OS assigns. The command prints `agent-docs serving {root} at {url}`, opens the URL in the default browser unless `--no-open` is given, and runs until interrupted. A port that is in use exits 1 with the port in the message, with no retry on another port.
2. **Docs root:** the given folder. Island lookup and link rewriting use the same rules as `open` ([0013](../decisions/0013-docs-root-is-nearest-islands-ancestor.md)), with the served folder as the upper bound.
3. **Index:** `/` lists every `.md` under the root (the same set `check` walks), grouped by folder, with title, status and updated from frontmatter. Each entry links to its page.
4. **Pages:** `/{path}/{name}.html` renders `{path}/{name}.md` in memory on each request, through the same `renderDoc` as `open`, plus the edit runtime (R3). Nothing is written to disk except saves. Assets the page references (non-SVG images) are served from the root, and only from inside it.
5. **Render errors** show as an error page with every `{file}:{line}: {message}`, and the page keeps listening for changes, so fixing the markdown brings the doc back with no manual reload. The server never serves a page rendered from a partial or stale state.
6. **Logging:** each save prints one line to stdout: `saved {path} lines {start}-{end} ({old} → {new} lines)`. Each refused save prints the reason.

### R2 Security

1. **Bind:** the server listens on 127.0.0.1 only.
2. **Token:** a random 128-bit token is generated per run. The printed URL carries it as `?token={t}`. A request with a valid token gets an `HttpOnly; SameSite=Strict` cookie and a redirect to the same path without the query. Every route, reads included, requires the cookie and returns 403 without it.
3. **Host and Origin:** a request whose `Host` is not `127.0.0.1:{port}` or `localhost:{port}` gets 403, which blocks DNS rebinding. A `POST` whose `Origin` is present and is not the server's own gets 403.

### R3 Edit runtime

1. **Only under `serve`.** The edit runtime is inlined into pages that `serve` produces. `open` and `export` pages carry none of it and stay read-only.
2. **Page state:** a served page embeds the file's exact source and its SHA-256 hash, so the runtime can slice any block's source by its `data-src` range without a request.
3. **Round-trip gate:** on load, the runtime runs house turndown on each paragraph, heading, bullet list and ordered list, and compares the result with that block's source lines. A block whose output equals its source byte for byte is editable in place. Every other block, and every block of another type, edits in the panel. The gate runs in the browser, on the real DOM ([0017](../decisions/0017-gate-and-turndown-run-in-the-browser.md)).
4. **Gate report:** `window.agentDocs.gate` holds `{range, type, pass, reason}` for every block, so tests and the results section can count passes by type. A failing block's `reason` is the first differing line.
5. **House turndown:** port the S2 rules (escape override, list rules with per-item gap marks, soft-break marker, strikethrough, autolinks) into the runtime, bundled with `turndown` by esbuild. The rules are the only HTML-to-markdown path.

### R4 In-place editing

1. **Affordance:** a gated block shows an edit cursor and a faint outline on hover. Clicking it makes that block, and only that block, `contenteditable`.
2. **Save:** blur and Cmd+S (Ctrl+S elsewhere) save the block. A block whose turndown output equals its original source sends nothing.
3. **Esc** restores the block's original DOM and leaves edit mode with no save.
4. **Enter:** in a paragraph it starts a new paragraph, in a list item a new item, and in a heading it saves. Each is still one block range on save, and the splice may produce several blocks.
5. **Paste** inserts plain text only. Rich clipboard HTML never reaches turndown.
6. **Undo:** native Cmd+Z works inside the block while editing. After a save, undo is git.
7. **Formatting:** native Cmd+B and Cmd+I work. Links keep their targets when their text is edited.

### R5 Side panel

1. **Opens** from an edit control on any block that isn't editable in place: tables, fenced code, islands (marker plus table, or the YAML fence), figures, HTML blocks, blockquotes, gate failures. Frontmatter opens from the header meta line.
2. **Shows** the block's exact source lines in a monospace text area, its line range, and Save and Cancel. Cmd+S saves, Esc cancels.
3. **Any markdown is accepted:** several blocks, or empty to delete the block. The save replaces exactly the block's range.
4. **Validation before write** (R6.3) applies, so a panel save that breaks an island is refused with the error shown in the panel, and the file is untouched.

### R6 Saving

1. **Request:** `POST /_save` with `{path, range: [start, end], hash, text}`, where `hash` is the hash the page was rendered from.
2. **Stale check:** if the file's current hash differs from `hash`, the server returns 409 and writes nothing.
3. **Validation:** the server splices `text` into the file's current bytes in memory and renders the result. A render error returns 422 with each `{file}:{line}: {message}`, and nothing is written. A column-pattern mismatch is a warning, as in M1, and does not block the save.
4. **Splice:** lines `start` to `end` (1-based, inclusive) are replaced by `text`. Every byte outside the range is unchanged, including the line ending style (LF or CRLF, taken from the file) and the presence or absence of a final newline.
5. **Write:** to a temporary file in the same folder, then renamed over the original, so a crash never leaves a half-written doc.
6. **Response:** 200 with the new hash. The page then reloads through R7.

### R7 Live reload

1. **Events:** each page opens a server-sent events stream. The server watches the root and sends `changed` for a page when its `.md`, an island module it uses, or an SVG it inlines changes.
2. **Reload** re-fetches the page and keeps the scroll position.
3. **Unsaved text is never discarded.** If a block has unsaved edits or the panel is open when `changed` arrives, the page shows a "changed on disk" banner and holds the reload. Saving then hits the stale check.
4. **After a 409,** the page reloads to the file's current version and opens the panel holding your unsaved markdown with the original line range, so you can re-apply it. The text stays there until you save or dismiss it.
5. **Budget:** from an external write to the reloaded page in under 1 second, and from Cmd+S to the reloaded page in under 500 ms, both on the first user's `system-design.md`.

### R8 Renderer markers

1. **Markers** that house turndown needs (the soft-break marker and the list gap marks) are emitted by the one renderer for every command, so `serve` renders exactly what `open` renders plus the edit runtime.
2. **Invisible:** markers change no pixel of the page. S2's `<br data-soft>` showed a line break, so the soft-break marker becomes an element that renders as the space a soft break already renders as.
3. **Goldens:** `test/golden/` changes only by the markers. The diff is reviewed before it is committed.

### R9 Agent side

1. **`/docs-serve {docs root}`** starts `agent-docs serve` in the background and reports the URL.
2. **Skill:** a short addition saying that `serve` is how the user reviews and edits docs, and that the user may edit a doc while it is served, so the agent reads the `.md` again before editing it. The skill's always-on description does not grow.
3. **Eval:** the M1 trigger cases still pass ([M1 A12](m1-render-islands.md#acceptance)).

### R10 Edit corpus

1. **Fixture:** copies of at least 5 of the first user's docs in a temp folder, including `system-design.md` and `m0-report.md`. The originals are never written.
2. **At least 40 edits,** each driven by Playwright keyboard and mouse input in installed Chrome, never by setting DOM content directly. Each edit has a hand-written expected file.
3. **Coverage:** typing mid-paragraph, deleting across inline formatting, Cmd+B, editing a link's text, adding and removing a list item, editing a nested list, changing a heading, Enter in a paragraph, pasting rich HTML, Cmd+Z before saving, Esc, and a panel edit of each kind in R5.1 including a delete and an island table cell.
4. **Each check:** the file equals its expected file byte for byte, and the bytes outside the edited range equal the original's.

## Acceptance

Each item is checked by a test or a recorded run. All must pass, and all can be run right after implementation, with no waiting period ([0018](../decisions/0018-m2-done-when-scripted-edit-corpus.md)).

| # | Check | How |
|---|---|---|
| A1 | The edit corpus (R10) passes: every edit gives its expected file, and no byte outside an edited range changes. | Playwright on installed Chrome |
| A2 | Focusing and then blurring every gated block of every doc in the first user's tree, with no typing, writes nothing: bytes and mtime unchanged. | Playwright walk |
| A3 | The gate passes every paragraph, heading and list in the S2 corpus docs, and at least 95% of those blocks across the first user's `docs/` and this repo's `docs/`. Every failure is listed with its reason, and opens in the panel. | Playwright, gate report |
| A4 | Panel saves work for a table, a fenced code block, an island table, frontmatter, and a delete. The island shows the changed data after reload. | Playwright |
| A5 | A panel save that breaks an island's schema returns 422 with `file:line` in the panel, and the file is unchanged. | Playwright and HTTP test |
| A6 | With a block mid-edit, an external write to the file shows the banner and holds the reload. Saving then returns 409, the file holds only the external write, and the unsaved text is in the panel. | Playwright with a concurrent write |
| A7 | An external edit to a served `.md`, to an island module it uses, and to an SVG it inlines each reload the page within 1 second, keeping scroll. A broken `.md` shows the error page with `file:line`, and fixing it brings the page back. | Playwright |
| A8 | The server listens on 127.0.0.1 only. A request without the cookie, with a foreign `Host`, or a `POST` with a foreign `Origin` gets 403. The token URL sets the cookie. | HTTP tests |
| A9 | CRLF files and files without a final newline keep both after a save. | Splice unit tests, fixtures |
| A10 | Every M1 test still passes, and `open` pages show no pixel change from the markers. The golden diff is reviewed. | `npm test`, screenshot comparison |
| A11 | Save to reloaded page is under 500 ms on `system-design.md`. | Playwright timing |
| A12 | `/docs-serve` starts the server from a Claude Code session and prints the URL, and the skill eval still passes. | Recorded run, `claude plugin eval` |

## Risks for M2

- **contenteditable in a real browser.** S2 simulated edits in jsdom. Chrome adds wrapper `<div>`s, `<br>`s and `&nbsp;`, which turndown can turn into stray markdown. The edit corpus is the test, and normalizing the DOM before turndown is the first fix. If editing stays unreliable, decision [0004](../decisions/0004-contenteditable-per-block-with-splice.md) keeps a CodeMirror source view as the fallback.
- **The renderer allows inline HTML** (`html: true`), and S2 used `html: false`. Blocks with inline HTML may fail the gate. The cost is a panel edit, never a corrupted file, and A3 measures it.
- **The S2 rules were tuned on one author's corpus.** New docs may bring new style cases. The gate sends them to the panel, and the gate report shows which rule to add.
- **Islands can call the save endpoint.** The token stops other sites, and an island inside the page still has the cookie. That is acceptable for your own repos until M5's sandbox.
- **Watching a large tree.** A recursive `fs.watch` over a root with many files can be slow or noisy. If it is, watch only the files the open pages depend on.

## Results

Run on 2026-10-24, on the first user's branch `m1/agent-docs-dogfood`. `npm test`: 352 of 352 pass. Evidence is in the pre-public archive. Each test file was also run on its own, so a load flake could not hide behind the full run.

| # | Outcome | Evidence |
|---|---|---|
| A1 | Pass, 51 of 51 cases. The lead reviewed every expected file before it counted. | pre-public archive |
| A2 | Pass. 34 of the first user's docs, 690 gated blocks focused and blurred, no save. | pre-public archive |
| A3 | Pass. Every paragraph, heading and list in the S2 corpus passes. Across the first user's docs and this repo, 1130 of 1144 blocks pass (98.8%). The 14 failures are listed with their reasons and get a panel control. | pre-public archive |
| A4 | Pass for a table, a fenced code block, an island table, frontmatter and a delete. | pre-public archive |
| A5 | Pass. The panel shows `panel.md:19: island tally: data does not match schema`, and the file is unchanged. | pre-public archive |
| A6 | Pass. | pre-public archive |
| A7 | Pass. Reloads took 203 ms (`.md`), 188 ms (island module) and 231 ms (SVG). Recovery from a broken `.md` took 208 ms. | pre-public archive |
| A8 | Pass. | pre-public archive |
| A9 | Pass. | pre-public archive |
| A10 | Pass. All M1 tests pass, and the lead reviewed the golden diff. M1 and M2 `open` pages differ by 0 pixels on `all-blocks` and the first user's `system-design.md` at 390px and 1280px. | pre-public archive, `scripts/accept/pixel-diff.mjs` |
| A11 | Pass. Median 140 ms over 5 saves, against a 500 ms budget. | pre-public archive |
| A12 | Pass. A headless session ran `/docs-serve docs` and printed the token URL. The skill eval passes 18 of 18 runs, the same as M1. | pre-public archive |

### What differed from the spec

- **No soft-break marker in the page (R8.1, R8.2).** Any element at a soft break, even an empty span, changed 109 pixels on `system-design.md`. The renderer keeps markdown-it's bare `\n`, and the edit runtime reads it from the DOM on a clone before turndown ([0019](../decisions/0019-soft-breaks-read-from-the-dom.md)). The list gap marks stay in the renderer as attributes.
- **A3's failures are house style, not bugs.** 11 of the 14 blocks contain a raw `$`, and house turndown writes `\$`, the style the skill teaches. The other 3 are lists in the first user's docs written with extra spaces after the `-` or `1.` marker. All 14 edit in the panel.
- **Chrome drops a link when all of its text is replaced.** It deletes the `<a>` and re-applies it only to the first typed character, so the rest of the typing landed outside the link. The edit corpus caught this. `inline.js` now keeps the link by inserting through `execCommand`, which keeps native undo working, with a zero-width marker that is removed only in sessions that added it.
- **Cmd+B after a leading space put the space inside the `**`.** The house turndown placed its mid-line mark before a text node's leading whitespace. It now goes after it, and a unit test covers the case.
- **A save's own reload event reached the tests.** The `changed` event that follows a save reloaded the page and wiped the test's stubs, so one inline test flaked. Those tests now block `/_events`.
- **Found by the first hands-on edit: Cmd+S killed live reload.** Cmd+S outside a block being edited, or while a save was in flight, reached Chrome, whose Save Page cancelled the `/_events` stream for good, so the page showed "Live reload stopped". A served page now swallows Cmd+S everywhere and saves only a block being edited.
- **Every save reloaded the page twice.** The page reloads itself on the 200, and the watcher's event for the same write reloaded the new page again. `/_events` now takes the hash the page was rendered from and skips a page that already shows the `.md` on disk, which also sends `changed` at once for a write that lands between render and stream.
- **A failed page open could hang the whole test run.** A test that started `serve` and then failed to open its page leaked the server, and its watcher kept that test file's process alive with no failure shown. Every test now closes its served copy whatever fails. `serve` also now installs its signal handlers before printing the serving line, so a fast SIGTERM no longer kills it outright.
- **A headless `claude -p "/docs-serve …"` never exits.** It waits on the server it started in the background, so the A12 run was read for its URL and then stopped.
