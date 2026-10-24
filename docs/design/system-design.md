---
title: margent design
status: draft
version: v0.1
updated: 2026-10-25
---

# margent design

**Markdown that agents read, pages that humans enjoy.** margent keeps one markdown file as the single source of truth for a doc, renders it into a richly designed page with a script, and lets you edit and comment on that page directly. Agents spend their tokens on writing and on designing visuals once, never on keeping a second copy in sync.

System design. Status: draft. First user: an existing docs repo that kept markdown as its source. Evidence: spikes S0–S4 (pre-public archive). Home: this repo.

## Why

Rich HTML reports are the best way to review agent work, but today every doc exists twice, and agents keep the two copies in sync by hand.

In the first user's docs, markdown is already the source of truth and HTML is a render for review. The render is written by the LLM, though. So every content change becomes two edits: one to the `.md`, and a hand-made patch to the `.html` that first requires reading the HTML to find the right spot. Sometimes only the HTML gets patched, and the two drift.

What makes the HTML worth having is the agent inventing a fresh visual or a better way to structure information. That is the part to keep. Copying prose into markup, re-reading pages to patch them, and checking that renders aren't stale are the parts to remove.

## Goals and non-goals

### Goals

- **One source of truth** per doc: a markdown file both humans and agents treat as canonical.
- **Fresh, bespoke visuals** designed by the agent with `/design-principles`, as freely as today.
- **Zero-LLM re-renders.** A content change costs a markdown diff and nothing else.
- **Edit in the page:** type into prose, open anything else in a side panel, and have it land in the markdown.
- **Comment in the page** where the agent sees the comments on its next normal read.
- **Markdown that stays shareable:** readable raw, on GitHub, or pasted to someone else.

### Non-goals for now

- Phone review or hosted sharing. Pages are opened locally.
- Multi-user editing or real-time collaboration.
- WYSIWYG editing of visuals. Islands are edited through their data.
- A fixed component library as the only design vocabulary.
- Third-party review tools (Plannotator and similar).

## Evidence

Five spikes tested the preconditions before this design was committed. All five say proceed, two with adjustments that are folded in below.

| Spike | Result | Detail |
|---|---|---|
| S0 Problem sizing | 17/25 | HTML writes in the first user's docs were hand patches copying an md edit. 5 more patched the HTML with no md edit at all. Tokens were only about 3% of output. |
| S1 Island quality | 2/3 | Blind pairs where you preferred the island over free-form HTML. Never clearly worse. Data edits re-render with no LLM. |
| S2 Splice fidelity | 100% | Of 249 prose blocks round-trip byte-identical with house turndown rules, up from 78% stock. 20/20 simulated edits clean. |

| Spike | Verdict | Finding |
|---|---|---|
| S0 Problem sizing | Proceed | The case is correctness and loop speed, more than tokens. Agents already patch the HTML instead of regenerating it, so the cost is the second edit and the drift it allows. |
| S1 Island quality | Proceed | Separating data from design did not hurt the visuals. It did make the markdown cryptic (JSON about 2x the input, display config mixed with facts), which [contract v1](#islands) fixes. |
| S2 Splice fidelity | Adjust | Splicing by block range is exact. Stock turndown is not, so edits go through house rules and a per-block round-trip gate. |
| S3 Table-backed islands | Adjust | All three islands read from the original tables. Each markdown file is the original plus one marker line. The modules then parse cell wording, which can break silently, so columns they parse declare patterns that fail loudly. |
| S4 Sandbox-ready | Proceed | The same island code runs byte-identical in Shadow DOM and in a sandboxed iframe. Heights match within 1 px after every click, and the isolation probe is blocked everywhere. Deferring the sandbox to M5 is safe. |

### What the research added

- **Never re-serialize the whole file.** A round-trip benchmark found no rendered-markdown editor (Milkdown, Tiptap, remark, turndown) that saves an untouched file byte-identical. Only patch-on-save did, which is the splice approach here.
- **Generated UI stays reusable when it is data against a known component.** Google's A2UI and json-render constrain models to a catalog. Here the catalog grows by promotion instead of being fixed up front.
- **Fenced blocks are the most robust embed syntax** across Observable, Quarto and MyST, and they degrade to readable text anywhere.
- **Rich HTML can over-invest in scaffolding.** Every island states its claim in the markdown, so the prose has to say what the visual shows.

Spike details (pre-public archive): spikes S0 to S4.

## How it works

The markdown is the only thing anyone edits. Everything to its right is generated, and every edit made in the page flows back into it.

![The agent and you both change only doc.md. A script renders doc.md, the island modules and the shell into doc.html, which the browser shows. Edits and comments made in the browser are spliced back into doc.md. Agents never read the HTML.](../assets/how-it-works.svg)

*The agent and you both change only `doc.md`. Everything to the right of it is regenerated on every save.*

| Action | Today, in the first user's docs | With margent |
|---|---|---|
| New report | Agent writes md, then the full HTML page | Agent writes md, plus one module per new island |
| Fix a number or typo | md edit, read HTML, patch HTML, check the hash | md edit. The render is automatic |
| You fix a sentence | Ask the agent | Type into the page |
| Redesign one visual | Patch or regenerate the page section | Edit one island module |
| Agent looks up a fact | Reads md (sometimes HTML) | Reads md only, as the skill says |

## Doc format

A doc is plain markdown with frontmatter, plus two small additions: island markers and CriticMarkup comments. Raw, it should read like something you would write by hand.

### Island, table-backed

When the content is a table, it stays a normal markdown table. A one-line HTML comment above it turns it into an island on the rendered page. Anyone reading the raw markdown or viewing it on GitHub sees only the table.

````md
<!-- island spike-verdicts -->
| Spike   | Question                               | Verdict | What changed                        |
|---------|----------------------------------------|---------|-------------------------------------|
| S3 Cost | What does a month cost at real volume? | Proceed | $3.87 average, $5.88 peak. Flex only |

*No spike said stop. Eight adjustments reshaped the plan.*
````

### Island, YAML-backed

When the data is nested and has no table shape, it goes in a fenced `island` block with a YAML body. JSON is valid YAML, so it is accepted too, but YAML is the default because it reads like a list.

````md
```island milestone-depth
- id: M1
  scope: [HN and GitHub sources, raw and observation tables, filter, extraction]
  done_when: 3 topics fill bronze and silver for 14 days in a row under the cap
- id: M2
  scope: [entity resolution, problem graph]
  done_when: clustering eval meets its target on labeled pairs
```
*Each milestone ships end to end. Later ones add depth.*
````

### Caption

The italic line right after an island states its claim, the same rule the first user's docs already use for SVG diagrams. An agent reading the markdown gets the point of the visual without running it.

### Comments

Comments are inline CriticMarkup with an ID, such as `{==highlighted text==}{>>[c3] Quy: is this per month?<<}`. See [Comments](#comments).

## Islands

An island is a visual the agent designs from scratch, once. The markdown holds the facts, the module holds the design, and a data edit never needs the LLM.

![A table or YAML block in the markdown is parsed and validated against the island's schema, then passed to the island's render function inside a shadow root, along with the shared kit.](../assets/islands-flow.svg)

*The renderer does the parsing and validation, so every island gets clean, checked data and the same helpers.*

### Contract v1

- **Module:** `islands/{name}.island.js` exports `default render(root, data, kit)` and a `schema` (JSON Schema). `root` is an open shadow root.
- **Data shape:** a table-backed island receives `data.rows`, one object per row keyed by the slugified header, cell values as markdown strings. A YAML-backed island receives the parsed YAML.
- **Kit:** a shared stylesheet adopted into every shadow root (tokens, type scale, resets), `kit.md()` for safe inline markdown, `kit.fmt` for currency, percent and numbers, and `kit.tone()` for semantic status colors. This removes about 30 lines of boilerplate per module that S1 found duplicated.
- **Errors are loud.** Bad data fails the render with `file:line`. A module that throws shows a red error box in place of the visual.
- **Fallback:** a table-backed island keeps its table as light-DOM content, so it reads correctly without JS, in print, and to a screen reader.
- **Sandbox-ready from day one.** An island draws only inside its own box (tooltips included), its height comes from its content, and it takes theme values from `kit` rather than inheriting page CSS. Islands written to these rules move into a sandboxed iframe at M5 with no change to their code. See [Shipping](#shipping). `margent check` enforces the box: it fails when an island's content overflows at 390px or 1280px (M1).
- **Parse structure, and say so.** When a module reads structure out of cell wording (a cost like `\$1.58 (41%)`, a verdict like "Proceed, Adjust judge"), its schema declares a pattern for that column. A cell that doesn't match still renders as plain text, but the island shows a warning badge and `margent check` fails with `file:line`. Rewording a cell never silently drops it from the visual (S3).
- **Self-contained.** A module is one file with no imports. The runtime wraps it, so the same bytes run under the sandbox's content policy.
- **Versioned:** every module declares `export const contract = 1`.

### Data rules

These come straight from what made S1's markdown cryptic.

S1 island data (v0):

```json
"kinds": {
  "proceed": { "label": "Proceed",
               "tone": "go" },
  "adjust":  { "label": "Adjust",
               "tone": "warn" }
},
"total": { "usd": 3.87 },
"cost":  { "usd": 1.58,
           "share": 0.41 }
```

**Contract v1** puts the facts in a different place:

- **Primary facts only.** Totals, shares and counts are computed by the module, so they can't contradict each other.
- **No display config in data.** Tones, glyphs and labels for categories live in the module.
- **Interpretation lives in prose.** Group headings and emphasis go in the text or caption around the island, where they read as the author's framing.
- **Tables first**, YAML when the shape demands it, JSON never by default.

### Where islands live

1. **Project-local first.** A new island lives in the nearest `islands/` folder above the doc that uses it, usually one at the docs root.
2. **Promoted on second use.** When a second doc wants the same island, it moves to `margent/catalog/` with its schema and a fixture. Reusing a catalog island costs no design tokens.
3. **Lookup order:** project, then catalog. A name clash is an error.

**Freedom stays.** The catalog is never a gate. The agent can always design a new island for a new idea. The catalog only means a good one doesn't have to be designed twice.

## Renderer

A deterministic script: the same markdown gives the same bytes, every time, in well under a second.

- **Entry points, one renderer.** `margent serve {docs root}` renders in memory for browsing and editing ([Editing in the page](#editing-in-the-page)). `margent open {file}` renders one doc into a cache folder outside the repo and opens it in the browser. `margent check {path}` renders without writing anything and reports errors. `margent export {path} --out {dir}` writes standalone HTML wherever you ask, for sending to someone.
- **Parser:** markdown-it. Every top-level block gets `data-src="{start}-{end}"` from its token map, which is what editing and comments anchor to.
- **Shell:** one house shell in margent, built with `/design-principles`, holds the header, table of contents, typography, tokens (including amber and red for status) and the theme toggle. A project can override it with `{docs}/_shell.html`. Changing the look of every doc is a shell edit.
- **Islands are inlined** into the page as module text, and each runs in its own sandboxed frame. A rendered file still opens straight from disk with no server.
- **Links:** a link to another `.md` that has a render is rewritten to its `.html`, keeping the anchor.
- **Renders never land in the repo.** They exist in memory or in the cache, and are regenerated on every change. That retires the first user's provenance hashes, the stale-render check, and the rule against editing HTML, because there is nothing to keep in sync by hand.

## Editing in the page

Prose is edited in place. Everything else opens its markdown in a side panel. Either way, only the edited block's source lines change.

`margent serve {docs root}` runs a local server over a whole docs tree, such as a project's `docs/`. A root holds any number of docs in any folder layout, one `.md` per doc, plus one shared `islands/` folder. The server lists every doc at `/` and renders `/{path}/{name}.html` in memory from `{path}/{name}.md` when it is opened, so no HTML file needs to exist on disk. It live-reloads a page when its markdown changes (including when the agent edits it) and accepts edits.

### Which blocks edit where

- **Edit in place:** only if the block passes the round-trip gate, `turndown(render(src)) === src` under the house rules, checked in the browser when the page loads ([0017](../decisions/0017-gate-and-turndown-run-in-the-browser.md)). Applies to paragraphs, headings, bullet lists and ordered lists.
- **Side panel with raw markdown:** always, or whenever the gate fails. The panel shows the block's exact source, and for an island, its table or YAML. Applies to tables, code blocks, islands, HTML blocks, frontmatter and any block that fails the gate.

### Saving an edit

1. **The page sends** the file, the block's line range, a hash of the file it was rendered from, and the new markdown for the block (turndown output, or the panel's text).
2. **The server checks the hash.** If the file changed since the page was rendered, for example because the agent edited it, the save is refused with a visible message. The page reloads and keeps your text in the panel so nothing is lost.
3. **The server splices** the new text into those lines, leaving every other byte untouched, writes the file, and re-renders. Undo is git.

**House turndown rules** from S2: an escape override (no `agent\_harness`, no lost `$`), list rules with per-item gap marks, soft breaks read from the newline the DOM keeps ([0019](../decisions/0019-soft-breaks-read-from-the-dom.md)), strikethrough and autolinks.

## Comments

Comments live inside the markdown, so the agent sees them on its next ordinary read and git keeps their history.

```text
The filter keeps {==96% of GitHub issues==}{>>[c3] Quy: is that stable across repos?<<}{>>[c3] Claude: Measured on 4 repos in S3. Added the range below.<<}
```

- **Creating one:** select text in a served page and type a note. The page maps the selection to the block's source through house turndown, snapping it outward to whole formatting, links and code ([0020](../decisions/0020-selection-maps-through-turndown-sentinels.md)). Tables, islands, code, figures and HTML blocks take a block comment line instead, a paragraph of notes right after the block, so island data never holds comment markup.
- **Saving:** every comment operation is an ordinary block save through the M2 save path, with the author taken from git ([0021](../decisions/0021-comment-operations-are-block-saves.md)).
- **Display:** highlights in the text, notes in the margin or under their block where there is no room, and an open-comment count in the header.
- **Threads:** replies are further comments with the same ID.
- **Agent contract:** `margent comments {path}` lists the threads. For each one that needs the agent, make the change and delete the thread when the comment asks for exactly that change, or reply and leave it open for a question, a judgment call, a disagreement or anything that needs you. Finish by reporting how many threads still need the agent and how many need you.
- **Sharing:** `margent export {path} --md --clean` writes a markdown copy with comments and island markers stripped, for sending markdown to someone else.

For detail, see the [M3 spec](../specs/m3-comments.md).

## How agents use it

| Piece | What it does |
|---|---|
| Skill `margent` | The format rules (sections [Doc format](#doc-format) and [Islands](#islands)), when an island earns its place, and the comment contract. It loads `/design-principles` before designing a new island. |
| Skills `docs-open`, `docs-serve`, `docs-review` | The user-invoked commands (`disable-model-invocation: true`): render and open a doc, serve a folder for review, and work through open comments. |
| CLI | `open`, `serve`, `check`, `comments`, `export`. Agents call `check` to confirm a doc builds. Failures exit non-zero with `file:line`. |
| No project setup | Nothing in the project changes: no CLAUDE.md line, no config file, no gitignore entry. Agents learn the tool from the skill, which loads when they write or edit a doc. `serve` takes the docs folder as an argument. Islands resolve by walking up from the doc to the nearest `islands/` folder. Renders never land in the repo. |

### First user migration

The first user's `render-doc` skill shrinks to "run `margent open`". The stale and hash checks in `check_docs.py` go away, and the rule against editing HTML stops being necessary. The existing SVG diagrams keep working as images. The first doc to migrate is `m0-report.md`, because it is small and table-heavy.

## Decisions

Each decision has a record in [decisions/README.md](../decisions/README.md).

| Question | Decision | Record |
|---|---|---|
| Who writes the HTML (render path) | A deterministic script. The LLM designs islands, never pages. Rejected: LLM renders on each change, because of double edits and drift (S0). | [0001](../decisions/0001-deterministic-script-renders-pages.md) |
| Design vocabulary (freedom vs reuse) | Bespoke islands, promoted to a catalog on second use. Rejected: fixed component kit only, which loses the fresh visuals you value. Rejected: typed catalog from day one, which has the same problem, earlier. | [0002](../decisions/0002-bespoke-islands-promoted-on-second-use.md) |
| Island data format (readability) | Markdown tables first, YAML when nested. Primary facts only. In S3 all three islands needed just one marker line on the original table. Rejected: JSON blocks, which S1 showed to be cryptic and about 2x the input's size. | [0003](../decisions/0003-island-data-in-markdown-tables.md) |
| Editing engine (write-back) | Contenteditable per block, house turndown, splice into source lines, round-trip gate. Rejected: Milkdown and Tiptap, which rewrite the file on save. Rejected: CodeMirror live preview, which edits a source view, not the rendered page. Kept as the fallback if contenteditable fails in real browsers. | [0004](../decisions/0004-contenteditable-per-block-with-splice.md) |
| Comment storage (agent visibility) | Inline CriticMarkup with IDs. Rejected: sidecar file with text anchors, which gives cleaner markdown but needs a special read from the agent, and anchors drift. | [0005](../decisions/0005-comments-as-inline-criticmarkup.md) |
| Where docs live (hosting) | In the project's git repo, opened locally. Rejected: Claude Docs or artifacts, which are off-repo and so not a single source of truth. Rejected: Plannotator, skipped by choice. | [0006](../decisions/0006-docs-live-in-the-repo.md) |
| Distribution (install) | One repo is the npm package (the CLI), the source of the skills for `npx skills add`, and a thin Claude Code plugin with its own marketplace. Rejected: `curl \| sh` installer, which hides what runs. Rejected: MCP server, since the CLI and a skill cover it. Rejected: installers for every agent, with Claude Code first and other agents getting the SKILL.md later. | [0007](../decisions/0007-one-repo-for-npm-plugin-and-marketplace.md), [0024](../decisions/0024-margent-name-and-distribution.md) |
| Island isolation (security) | Sandbox-ready rules in contract v1 from M1. M5 ships a sandboxed iframe per island, a script policy on every page, and Node never running island code. No folder trust. Rejected: Shadow DOM only, which isolates styles, not code, and is unsafe for repos you didn't write. Rejected: sandbox in M1, which adds cost before there is a second user. Rejected: folder trust, which the frame and policy make unnecessary. | [0025](../decisions/0025-islands-run-only-in-a-sandboxed-frame.md), superseding [0008](../decisions/0008-island-isolation-sandbox-ready-now-iframe-at-m5.md) |
| M5 done (acceptance) | Everything works on this machine, including a local install from the `npm pack` tarball. A fresh install by someone else is not a gate. Rejected: a clean-room run after publishing, and a real second person, both deferred. | [0026](../decisions/0026-m5-done-when-it-works-on-this-machine.md) |
| Gate location (editing) | The round-trip gate and turndown run in the browser, on the DOM the user edits. Rejected: a DOM library in the CLI to gate in Node. | [0017](../decisions/0017-gate-and-turndown-run-in-the-browser.md) |
| Write endpoint (security) | `serve` binds 127.0.0.1 with a per-session token from M2, when the first write endpoint ships. Rejected: waiting for M5 as first designed. | [0016](../decisions/0016-serve-binds-localhost-with-session-token.md) |
| Renders in git (build outputs) | Never in the repo: in memory under `serve`, in a cache for `open`, wherever you choose for `export`. Islands are inlined, so exported files open from disk. Rejected: committed renders with provenance hashes, which bring back the sync problem this design removes. | [0015](../decisions/0015-renders-are-never-committed.md) |
| Soft-break marker (editing) | None in the page. The edit runtime reads a soft break from the newline the DOM keeps, on a clone, before turndown. Rejected: a marker element, which shifted glyphs (109 pixels on one doc). | [0019](../decisions/0019-soft-breaks-read-from-the-dom.md) |
| Comment anchoring (selection) | A selection maps to the block's source by running house turndown on a copy with two sentinel characters at its snapped boundaries. Only gated blocks; every other block takes a block comment line. Rejected: searching the source for the selected text, which fails across formatting and is ambiguous when the text repeats. | [0020](../decisions/0020-selection-maps-through-turndown-sentinels.md) |
| Comment writes (save path) | Create, reply and resolve are ordinary block saves through `POST /_save`, with the author from `serve --author` or git. Rejected: a comment endpoint that anchors on the server. | [0021](../decisions/0021-comment-operations-are-block-saves.md) |
| M3 done (acceptance) | A scripted comment corpus in Chrome plus one real review that the agent fully handles. Rejected: scripted only, which can't judge the agent's choices. | [0022](../decisions/0022-m3-done-when-corpus-and-real-review.md) |

## Risks and open questions

| Risk | Why it matters | How it gets checked |
|---|---|---|
| Parsing tied to wording | Table-backed islands read structure from cell text (S3). An author rewording a cell can change what the visual shows. | Declared column patterns, a warning badge on the island and a failing `check`. Watch the mismatch rate in real use. |
| YAML islands untested | S3's milestones turned out table-shaped, so the YAML form has no spike behind it. | M1 covers parsing with a fixture. A real nested visual waits for the first doc that needs one. |
| Real-browser contenteditable | S2 simulated edits in jsdom. Real browsers add wrapper divs, stray `<br>` and paste markup. | The M2 edit corpus: 40+ scripted edits by keyboard and mouse in Chrome, each checked against an expected file. |
| CriticMarkup in editable blocks | Comment markup inside a paragraph must survive turndown, or the gate sends the block to the panel. | A house turndown rule for highlights and notes, and M3's gate rate on comment-seeded docs. Fallback: blocks with comments edit in the panel. |
| Agent and browser edit at once | A save could overwrite the agent's newer text. | The hash check refuses stale saves. Tested with a concurrent write. |
| Island quality drifts | Modules are code the agent writes once and rarely revisits. | Schema plus fixture per island. Catalog islands get a screenshot test. |
| Islands run as code | Before M5, opening a doc runs its islands with the page's full access, including the write endpoint. That is fine for your own docs and unsafe for a cloned repo. | M5 ships the sandboxed frame, the page script policy and no island code in Node ([0025](../decisions/0025-islands-run-only-in-a-sandboxed-frame.md)). Residual risk: an island that loops freezes its tab, accepted in 0025. The hostile-fixture acceptance check (M5 A2) tests the rest. |
| Small samples | S0 covers 3 days of one project, and S1 has 3 pairs with one designer each. | Re-measure after a month of real use: render events, islands made and reused, gate failure rate. |

## Shipping

Each route installs the same skills and CLI. Pick the one your agent supports.

| Path | What happens |
|---|---|
| CLI | `npm i -g margent` installs `margent` on the PATH. With no install, `npx -y margent {command}` runs the same package. |
| Any agent | `npx skills add dvquy13/margent` installs the skills into Claude Code, Codex, Cursor and the other agents that `skills` supports. |
| Claude Code plugin | `/plugin marketplace add dvquy13/margent`, then `/plugin install margent`, then `/reload-plugins`. |

### One repo, three roles

```text
margent/
  .claude-plugin/plugin.json        # the thin plugin
  .claude-plugin/marketplace.json   # source "." makes the repo its own marketplace
  skills/margent/SKILL.md           # format, island contract, design guide
  skills/docs-open/SKILL.md         # /docs-open {file}
  skills/docs-serve/SKILL.md        # /docs-serve {docs root}
  skills/docs-review/SKILL.md       # /docs-review {file or folder}: work through open comments
  dist/cli.js                       # the npm bin, built by prepack, not committed
  catalog/                          # starter islands
  package.json                      # the CLI on npm
```

- **The skills pin one CLI version.** They run `margent` when it prints that version, else `npx -y margent@{version}`. A test keeps the package, the plugin and the skills at one version, so skills and CLI can't drift. The CLI is one bundled file with no runtime dependencies.
- **One version, one tag.** A git tag drives the plugin and the npm release. `claude plugin install margent --marketplace dvquy13/margent#v1.2.0` pins a version. Auto-update is off by default for third-party plugins. A local-path install runs from a copy in the plugin cache, so during development a repo edit reaches new sessions only after a reinstall (M1).
- **Useful in the first minute.** `/docs-open README.md` works on any repo's existing markdown, before a single island exists.
- **Your taste is not the default.** The plugin ships a neutral token theme and a generic design guide distilled from `/design-principles`. A user's own design skill takes precedence when one is installed, and `margent theme init` scaffolds a custom shell.
- **Context cost stays small.** Every installed skill's description is paid on every turn. `claude plugin details` shows the cost, and `claude plugin eval` checks that the skill triggers when it should and stays quiet otherwise.

### Security before a second user

From M2, the server binds to 127.0.0.1 with a random per-session token, so other sites can't read or post edits ([0016](../decisions/0016-serve-binds-localhost-with-session-token.md)). Before anyone else installs it, M5 puts three layers between a doc and your machine ([0025](../decisions/0025-islands-run-only-in-a-sandboxed-frame.md)):

- **Node never runs island code.** Render reads each module as text and wraps it. The checks and the render run in the island's frame, so opening a doc from a repo you didn't write runs nothing on your machine.
- **Each island runs in `<iframe sandbox="allow-scripts" srcdoc>`.** The frame has an opaque origin and its own policy: no network, and no images except data URIs. It talks to the page only through `postMessage`. The page accepts a message only from that island's frame, and opens only `http`, `https` and `mailto` links, in a new tab with `noopener`.
- **Every page carries a script policy** that lists the hash of each script the page and its guests run. A `<script>`, an inline handler or a form written into the markdown doesn't run or submit. `serve` also refuses any path with a segment that starts with `.`.

What is left is an island that loops and freezes its tab, because a frame runs in the page's process. That is accepted. Folder trust was rejected, because these three layers leave nothing it would protect.

## Build order

Each milestone is usable alone, and the first one already removes the double edit.

For milestone detail, see the [M1 spec](../specs/m1-render-islands.md), the [M2 spec](../specs/m2-serve-edit.md), the [M3 spec](../specs/m3-comments.md) and the [M5 spec](../specs/m5-ship.md).

<!-- island milestones -->
| Milestone | Status | What it adds | Done when |
|---|---|---|---|
| M1 Render + islands | Done | Renderer, house shell, island contract v1 and kit, the agent-docs skill and the HTML-read hook. | the first user's m0-report renders from md alone, with two islands built from its tables. |
| M2 Serve + edit | Done | Local server with a session token, live reload, in-place prose editing behind the gate, side panel, stale-save check. | 40+ scripted edits on the first user's docs in Chrome each give their expected file, with no byte changed outside the edited block. |
| M3 Comments | Done | Select-to-comment, margin notes, open count, the `comments` command, the agent contract and `export --clean`. | 25+ scripted comment cases in Chrome give their expected files, and the agent resolves or answers every comment on a real review. |
| M4 Catalog | Planned | Promotion of islands to the catalog with schema and fixture. | a second project reuses a catalog island at no design cost. |
| M5 Ship | Done | Island sandbox (a frame per island, checks run in the guest), a script policy on every page, no island code run in Node, comments inside islands, `doctor`, and a README section for agents. | everything works on this machine, including a local install from the `npm pack` tarball ([0026](../decisions/0026-m5-done-when-it-works-on-this-machine.md)). |

*M1, M2, M3 and M5 are done. M4 adds depth to what already ships.*

Spike evidence is in the pre-public archive.
