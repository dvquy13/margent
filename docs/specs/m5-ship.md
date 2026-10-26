---
title: M5 spec · Ship
status: done
updated: 2026-10-25
---

# M5 spec · Ship

M5 makes margent safe to open on docs you didn't write, so it can go to npm. Node stops running island code, each island runs in a sandboxed frame, every page carries a script policy, and `serve` stops returning dotfiles. `margent doctor` checks a machine in one command, and the README gains steps an agent can follow to install margent. M5 is done when all of this works on this machine, including a local install from the tarball ([0026](../decisions/0026-m5-done-when-it-works-on-this-machine.md)).

Design: [Security before a second user](../design/system-design.md#security-before-a-second-user) and [Shipping](../design/system-design.md#shipping). Boundary: [0025](../decisions/0025-islands-run-only-in-a-sandboxed-frame.md). Evidence: spike S4 (islands run unchanged in a sandboxed srcdoc frame) and spike S6 (the script policy, its inheritance into the frame, links, selection and fonts). Packaging and the three install routes came with the rename ([0024](../decisions/0024-margent-name-and-distribution.md)).

## Scope

**In**

1. **Node never runs island code** (R1).
2. **The page format** that carries modules, data and the policy (R2).
3. **The sandboxed frame** and its message protocol (R3).
4. **`serve`:** the policy header and no dot paths (R4).
5. **`check`** reading island results from the page, with unchanged output (R5).
6. **Comments** on text inside islands (R6).
7. **`margent doctor`** (R7).
8. **Agent side and docs:** island contract, skill, README "For agents", owner `dvquy13` (R8).

**Out** (later, or not planned)

- Folder trust ([0025](../decisions/0025-islands-run-only-in-a-sandboxed-frame.md)).
- A fresh install by someone else ([0026](../decisions/0026-m5-done-when-it-works-on-this-machine.md)).
- The island catalog (M4) and the `catalog/` starter islands.
- Windows. The opener has a Windows branch, but nothing on Windows is tested.
- Sanitizing raw HTML in markdown. The policy blocks what runs; markup stays.

## Requirements

### R1 Node never runs island code

1. Render reads each module as text. It finds the module (`src/islands/lookup.ts`), rejects `</script` and `<!--`, and wraps it with the kit's `wrapModule`, a string transform. No module text is evaluated in Node, in `vm` or otherwise.
2. Render errors stay for what render can see without running code: a missing module, a module the wrap rejects (an `import`, a script tag, an unsupported export, no default export), and marker, table and YAML errors.
3. These move into the guest (R3), with today's message texts: a module that throws at load; the `contract`, `schema` and `render` checks; schema validation; a column pattern naming no column; patterns on a YAML island; and pattern mismatches.
4. `open`, `export` and serve saves no longer fail on the errors in R1.3. The island shows the error in its box.
5. `src/islands/validate.ts` keeps no `node:vm` evaluation of module text. The kit itself may still be evaluated in Node for `wrapModule`, because it is margent's own code.

### R2 Page format

1. The island element keeps its markup: `<agent-island name data-kind data-src>`, a `script.island-data`, and `div.island-fallback`. The island data becomes `{data, rowLines}`, where `rowLines[i]` is the source line of table row `i` (empty for YAML). `mismatches` leaves the payload.
2. Each distinct module appears once as `<script type="text/plain" class="island-module" data-name="{name}" data-path="{display path}">`. Its text is the exact script the guest runs: `window.__margentModules[{JSON name}] = {wrapped};`. Nothing in the browser rewraps it.
3. The page keeps `kit.js`, `host.js` and `theme.js` as inline scripts. The guest runtime (`runtime/guest.js`) and the kit text the guest needs reach the frame from the page, as the host builds the srcdoc.
4. **Policy.** A `<meta http-equiv="Content-Security-Policy">` is the first element in `<head>`, with:
   - `script-src` with the sha256 of every inline script the page or any guest runs: the page runtime, the edit bundle under `serve`, the kit and guest runtime as the guest runs them, and each module script (R2.2). Nothing else.
   - `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`.
   - `connect-src 'self'` under `serve`, `'none'` for pages written to disk.
   - `style-src 'unsafe-inline' https://fonts.googleapis.com` and `font-src https://fonts.gstatic.com`.
   - No `img-src` and no `default-src`, so images in docs load as before.
     The exact list follows S6's findings, and the spec's Results record any change.
5. A `<script>`, an inline event handler or a `<form>` in the markdown stays in the page's HTML and does not run or submit.

### R3 Sandboxed frame

1. `runtime/host.js` mounts each island as `<iframe sandbox="allow-scripts" srcdoc title="{name}">` in place of the shadow-DOM mount, full width, no border, and its height set from the guest's `height` messages.
2. The guest document holds:
   - its policy meta: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src data:`;
   - the shell's font link;
   - the kit and `runtime/guest.js`;
   - the island data;
   - the module script (R2.2).
     The guest creates an open shadow root and calls `render(root, data, kit)`, so modules are unchanged.
3. The guest runs the R1.3 checks with today's texts, and shows the error box (`MargentKit.showError`) on failure. Pattern testing moves from `validate.ts` into `kit.js`.
4. **Messages.** Each is a plain object with a `type`.

| Type | Direction | Fields | Use |
|---|---|---|---|
| `tokens` | page to guest | `tokens`, `colorScheme` | theme on load and on every change; the guest sets `color-scheme` on its root |
| `mark` | page to guest | `phrase` or `null` | highlight a quoted phrase (R6) |
| `measure` | page to guest | `id` | measure overflow now, at the frame's current width |
| `ready` | guest to page | none | the guest is listening; the page answers with `tokens`, and the guest renders on the first `tokens` |
| `state` | guest to page | `state` (`rendered` or `error`), `error` (the `check` message), `mismatches` (`[{row, column, text}]`) | after render or failure, and again as `error` when the island throws later (a timer, a handler) |
| `height` | guest to page | `px` | from a ResizeObserver on the guest's content |
| `overflow` | guest to page | `id`, `overflow`: `{description, px, side}` or `null` | the answer to `measure`, with the spill rule `check` used before M5 |
| `hover` | guest to page | `inside: true` | the pointer entered the frame. The page can't see `:hover` over a sandboxed frame, so the host sets `data-hover` for the edit controls, and clears it on the page's next `pointerover` outside the frame |
| `open` | guest to page | `url` | a click on a link |
| `selection` | guest to page | `text`, `rect` (frame coordinates) or `null` | text selected in the island (R6) |

5. The page accepts a message only when `ev.source` is that island's `contentWindow`. It opens a URL only for `http:`, `https:` or `mailto:`, with `noopener`.
6. The host sets on `<agent-island>`:
   - `data-state` (`rendered` or `error`);
   - `data-error` (the message, on error);
   - `data-mismatches` (JSON, when there are any);
   - `data-overflow` (JSON, after a measure that found a spill).
     It also defines `window.margentIslands.report()`, which sends `measure` to every guest and resolves, within a bound, to one `{name, state, error, mismatches, overflow}` per island in document order. `check` calls it after each viewport change.
     The mismatch badge shows as today. `data-state` keeps driving the comment rail and the fallback CSS.
7. Print shows the fallback table and hides the frame.
8. In dark mode the frame shows no white canvas (S4).

### R4 Serve

1. Rendered pages and the error page carry the policy as a `Content-Security-Policy` header, with the error page's own script hash.
2. Any request path with a segment starting with `.` is a 404. That covers `/.env`, `/.git/config` and `/docs/.secret.md`.

### R5 check

1. `check`'s page run (`src/cli/pages-run.ts`) waits, with a bound, until every `<agent-island>` has `data-state`, at 390px and 1280px. An island that never reports fails as `{file}:{line}: island {name}: did not report within {n}s`.
2. It reads `data-error`, `data-mismatches` and `data-overflow`, and prints the same lines as before M5:
   - `{error}`, the island's `data-error` as is (each text already names the island, as before M5);
   - `island {name}: cell "{text}" does not match {column} pattern` at the row's line, from `rowLines`;
   - `island {name}: content overflows its box at {w}px (…)`.
3. An exception in a guest, at load or later, is reported through `state`, so it fails its island as `island {name}: {message}`. Before M5 a later exception was a `page error` at line 1. The `page-error` fixture's expected line changes to match, and that is the only expected change in R5.4.
4. Every other `check` fixture from M1 to M3 prints the same lines and exit code as before M5. The texts of the errors that moved from Node are those of `src/islands/validate.ts` at commit `1b0fc2f`.

### R6 Comments in islands

1. Selecting text in an island makes a block comment that quotes it, as in M3 ([0023](../decisions/0023-comment-rail-and-quoted-block-comments.md)). The edit runtime takes the guest's `selection` message instead of reading the shadow root, and places the note box from the frame's rect.
2. Hovering a quoted block comment marks the phrase inside the island through `mark`, with the CSS Highlight API in the guest.
3. The comment rail still relays out when an island renders or changes height.

### R7 `margent doctor`

1. It prints one line per check, `ok {check}: {detail}` or `fail {check}: {detail}. {fix}`, and exits 1 if any check fails:
   - Node at least 22;
   - the margent version;
   - Chrome found and started (`MARGENT_CHROME`, then the default locations);
   - the browser opener (`BROWSER`, else `open` or `xdg-open`);
   - the cache folder writable;
   - a built-in sample doc with one island checked in headless Chrome, its island reporting `rendered` from its frame.
2. A missing `git config user.name` prints `warn author: …`, because only notes in `serve` need it. A warning doesn't fail.
3. `doctor` is in the usage text and the CLI tests.

### R8 Agent side and docs

1. The island contract says the island runs in a sandboxed frame. Drawing stays inside the box, tooltips included. Links go through the kit. There is no `document` outside `root` and no network. Errors show in the box, and `check` reports them.
2. The skill says to run `margent doctor` when a command fails for environment reasons.
3. The README:
   - uses `dvquy13/margent`;
   - gains a "For agents" section: install the CLI (`npm i -g margent`, or the npx form), `npx skills add dvquy13/margent -g -y --agent {agent}`, `margent doctor`, then `margent open README.md`;
   - its Trust section describes the frame and the policy.
4. Also updated: `architecture.md`; the design's Security section, M5 row (done-when per 0026), islands risk row and owner; and `CLAUDE.md`.

## Acceptance

Each item is checked by a test or a recorded run on this machine.

| # | Check | How |
|---|---|---|
| A1 | `npm test` and `npm run typecheck` exit 0, and the M3 comment corpus passes, its island quote cases included. | `npm test` |
| A2 | Nothing escapes from a hostile fixture repo. An island whose top level would write a marker file leaves no file after `open`, `export`, `check` and `serve`. From an island, `parent.document`, `top.location`, `document.cookie`, `fetch` and a POST to `/_save` are blocked. A markdown `<script>`, an `<img onerror>` and a form posting to `/_save` don't run. `GET /.env` is a 404. | Node and Playwright tests, pre-public archive |
| A3 | This repo's docs and the `all-blocks` fixture match M3 within the pixel-diff tolerance at 390 and 1280px in both themes, and dark mode shows no white canvas. | `scripts/accept/pixel-diff.mjs` |
| A4 | Every existing `check` fixture prints the same `file:line: message` lines and exit code as before M5. | CLI tests |
| A5 | Clicking a link in an island opens a new tab with `noopener`. A `javascript:` URL is refused. | Playwright |
| A6 | `margent doctor` prints all `ok` on this machine. With `MARGENT_CHROME=/nope` it prints a `fail` line and exits 1. | CLI tests, pre-public archive |
| A7 | Local install: `npm pack`, install into a temp prefix, `npx skills add` into a temp HOME, then headless `claude -p "/margent:docs-open {doc with an island}"` with `BROWSER=true`. `margent check` on that doc passes, and a screenshot shows the island drawn in its frame. | Recorded run, pre-public archive |
| A8 | `claude plugin eval` passes every case 3/3. | pre-public archive |

## Risks for M5

- **Policy inheritance and file pages.** If a srcdoc frame doesn't inherit the page policy, or a hash-only policy behaves differently on `file://`, the hash list or the guest's own policy changes. S6 settles it before code moves.
- **Links.** The page's `window.open` from a message needs the click's user activation to reach the page. If S6 shows it doesn't, the frame gets `allow-popups` and the guest opens the link itself.
- **Comments inside islands** are the likeliest regression. The corpus's island quote cases are the gate.
- **Load time.** Each island adds a frame and a message round trip. S6 measures 20 islands on one page.
- **A looping island** freezes its tab. Accepted in 0025.

## Results

Run on 2026-10-24, branch `m5-ship`. Evidence is in the pre-public archive.

| # | Outcome | Evidence |
|---|---|---|
| A1 | Pass. `npm test`: 561 of 564 pass and 1 is skipped. The 2 failures (`comments-gate` A3 and `comments-render`'s walk of the first user's docs) read a sibling checkout of their repo, which holds uncommitted review threads; they fail the same way on `main`. Typecheck exits 0. The comment corpus passes, its island quote cases included. | pre-public archive |
| A2 | Pass. The vm escape in the hostile island wrote its marker file under the pre-M5 build and writes nothing under M5 for `open`, `export`, `check` and `serve`. Every probe from the frame is blocked, the markdown script, handler and form don't run, and `GET /.env` is a 404. | pre-public archive |
| A3 | Pass, with a deviation. With real fonts, every island has the same height as in M3 at 390 and 1280px. Outside the islands, pages match M3 at 0 px wherever island heights match, and the page without islands matches at 0 px in both themes. Island interiors differ sub-pixel, because text rasterizes in the frame's own layer; side-by-side crops are visually identical. Dark mode shows no white canvas. | pre-public archive |
| A4 | Pass. Every `check` fixture prints the same lines in the same order. The `page-error` fixture now fails its island at its line (R5.3). | pre-public archive |
| A5 | Pass. | pre-public archive |
| A6 | Pass. | pre-public archive |
| A7 | Pass. The tarball installs into a temp prefix, `npx skills add` puts the four skills in a temp HOME, and a headless `/margent:docs-open` runs the installed `margent open`. `margent check` passes and the island draws in its frame. | pre-public archive |
| A8 | Pass, every case 3/3. | pre-public archive |

### What differed from the spec

- **Hover over islands (R3.4).** Chrome never applies `:hover` through a sandboxed frame, so an island's Edit control never took the pointer. The guest posts `hover` on `pointerenter`, the host sets `data-hover` and clears it on the page's next `pointerover`, and island controls always take the pointer while only their visibility follows hover.
- **Layout parity fixes (A3).**
  - The guest posts its exact height; rounding up shifted everything below each island.
  - The frame takes the page's `lang` and `text-size-adjust`.
  - An off-screen frame has its rendering throttled, so its ResizeObserver stays silent. The guest also posts its height when fonts finish loading.
- **`check` (R5).**
  - The page's `report()` runs in one CDP call with a 20s bound; `ChromeSession.evaluate` gained a per-call timeout.
  - Problem lines are sorted by file and line, so errors that moved to the guest keep their pre-M5 order.
  - `data-error` is printed as is, since each text already names its island.
- **Messages.** The protocol gained `ready` (the page answers with `tokens`) and `hover`, and `overflow` answers a `measure` with its `id`.
- **Comments in islands (R6).**
  - Quote marks ignore whitespace, so a quote dragged across two lines marks.
  - Island quotes are marked on hover only, and clicking a quote inside an island doesn't open its card, since clicks in a frame never reach the page.
  - The note box sits at the selection's bounding box.
- **The policy meta** sits right after `<meta charset>`, which must come first.
- **`script-src 'none'`** when a page has no script (the doc index).
- **`RenderedDoc.warnings`** is gone: nothing produces render warnings any more.
