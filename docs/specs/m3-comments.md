---
title: M3 spec · Comments
status: done
updated: 2026-10-25
---

# M3 spec · Comments

M3 lets you review a doc by commenting on its rendered page, and lets the agent work through those comments on its next ordinary read. A comment is inline CriticMarkup in the markdown, so it lives in git next to the text it is about. You select text in a served page and type a note. The agent lists open threads with `agent-docs comments`, makes the change and deletes the thread or replies and leaves it open, and the page reloads with the result. `export --clean` strips comments when a doc goes to someone else.

Design: [Comments](../design/system-design.md#comments) and [Doc format](../design/system-design.md#doc-format). Comment storage: [0005](../decisions/0005-comments-as-inline-criticmarkup.md). Evidence for anchoring: spike S5 (pre-public archive) and [0020](../decisions/0020-selection-maps-through-turndown-sentinels.md), where 99.7% of 4,840 random selections in gated blocks of the first user's docs and this repo mapped exactly. M3 builds on M2's served pages, round-trip gate and save path ([M2 spec](m2-serve-edit.md)).

## Scope

**In**

1. **Syntax** for threads, point comments and block comment lines, parsed by the one renderer for every command.
2. **Display:** highlights in the text, notes beside them, and an open count in the header and the doc index.
3. **In the served page:** creating a comment from a selection or on a block, replying, resolving, and editing blocks that hold comments.
4. **CLI:** `agent-docs comments {path}`, `export --clean` for HTML and `export --md --clean` for markdown, and `check` errors for malformed comments.
5. **Agent side:** the comment contract in the skill, and a `/docs-review` command.
6. **Done when:** a scripted comment corpus passes, and one real review is fully handled ([0022](../decisions/0022-m3-done-when-corpus-and-real-review.md)).

**Out** (later, or not planned)

- The other CriticMarkup forms (`{++ ++}`, `{-- --}`, `{~~ ~> ~~}`). They stay plain text.
- Editing or deleting a single note in the page. The panel edits the raw markup.
- Notes with markdown, several lines or mentions, and any notification.
- Comments on frontmatter.
- The island catalog (M4), and the island sandbox, folder trust and publishing (M5). Before M5 an island can still write through the save endpoint, comments included ([0008](../decisions/0008-island-isolation-sandbox-ready-now-iframe-at-m5.md)).

## Decisions for M3

- [0020 A selection maps to source through house turndown with sentinels](../decisions/0020-selection-maps-through-turndown-sentinels.md)
- [0021 Comment operations are block saves](../decisions/0021-comment-operations-are-block-saves.md)
- [0022 M3 is done when a comment corpus passes and a real review is handled](../decisions/0022-m3-done-when-corpus-and-real-review.md)
- [0023 Threads show in a comment rail, and block comments can quote a phrase](../decisions/0023-comment-rail-and-quoted-block-comments.md) (amendment after the first real-review comment)

Spec-level choices, no record: a note is one line of plain text, Enter saves it and Esc cancels it, agents sign as `Claude`, and a thread's state comes from who wrote its last note.

## Requirements

### R1 Syntax

1. **Thread:** a highlight directly followed by one or more notes with the same ID.

   ```text
   The filter keeps {==96% of GitHub issues==}{>>[c3] Quy: is that stable across repos?<<}{>>[c3] Claude: Measured on 4 repos in S3.<<}
   ```

2. **Note:** `{>>[c{n}] {author}: {text}<<}`. The author has no `:` or `]`. The text is one line of plain text, not empty, and never contains `<<}`.
3. **Point comment:** notes with no highlight, anywhere inline. It is what remains when a highlight's text is deleted (R7.2).
4. **Block comment line:** a paragraph made only of one thread's notes. It is anchored to the block directly above it, and is how tables, islands, code, figures and HTML blocks take comments.

   ```text
   | Spike | Verdict |
   |---|---|
   | S3 | Proceed |

   {>>[c4] Quy: S1 is missing from this table.<<}
   ```

5. **IDs** are unique in a file. A thread's notes sit together, and one ID never names two threads.
6. **Highlighted text** is inline markdown inside one block, and may hold formatting (`{==the **filter** keeps==}`). Highlights never nest or overlap.
7. **Never parsed** inside code spans, fenced or indented code, HTML blocks or frontmatter. The CriticMarkup example in [Comments](../design/system-design.md#comments) sits in a code fence and stays text.
8. **Quote** ([0023](../decisions/0023-comment-rail-and-quoted-block-comments.md)): a block comment line's first note may start with the phrase it is about, as `"{phrase}" → {text}` (U+2192 with one space each side, a phrase without `"` or a line break and with a non-space character). Anywhere else, or in any other shape, it is plain note text, never an error.

   ```text
   {>>[c1] Quy: "Reddit, Discourse and Stack Exchange are out" → why are these left out?<<}
   ```

### R2 Render

1. **One renderer** parses comments for `open`, `export`, `check` and `serve`. A highlight renders as a `<mark>` carrying its ID, and a thread as an element carrying the exact source of its notes, which house turndown reads back (R7.1).
2. **Headings:** a heading's slug and its table-of-contents label ignore comment markup, so commenting on a heading never changes its anchor. `## Costs {==per month==}{>>[c5] Quy: or per run?<<}` keeps the slug `costs-per-month`.
3. **Open count:** the header meta line ends with `{n} open` when the doc has threads, and the `/` index shows each doc's count.
4. **Read-only pages:** `open` and `export` pages show highlights and notes with no controls.
5. **No change without comments:** a doc with no comment markup renders exactly as in M2. `test/golden/` changes only by new comment fixtures, and the diff is reviewed before it is committed.

### R3 Check errors

Each is a `RenderError` that `check`, `open`, `export` and `serve` saves report as `{file}:{line}: {message}`, and each has a fixture proving it is loud.

1. An unclosed `{==` or `{>>`.
2. A note without the `[c{n}] {author}:` head, or with empty text.
3. A highlight with no note after it.
4. An ID that names two threads, or a thread whose notes are split apart.
5. Comment markup inside a table cell, an island table or island YAML. The message says to use a block comment line after the table instead, because island data is read from cell source ([M1 R3](m1-render-islands.md#r3-islands)).
6. A block comment line with no block above it.

### R4 Display

1. **Highlight:** a tint from the page's accent token, readable in both themes.
2. **Rail** ([0023](../decisions/0023-comment-rail-and-quoted-block-comments.md)): each thread shows as a card in a rail right of the content, with its highlighted text or quote, then its notes in source order, author then text. A card lines up with the top of what it is about (its highlight, a point comment's marker, or the block a block comment line is anchored to), and cards stack in document order when they would collide. From 1100px wide the rail sits beside the content. Below that it is a drawer behind a "Comments" button. The threads stay in their blocks, hidden while the rail shows, and print and pages without JS show them in their blocks.
3. **Linking:** hovering or focusing a highlight or marker marks its card, and the reverse. A quoted phrase is tinted like a highlight wherever its text is found in its table or island, more strongly while its card is linked, and a click on it opens its card.
4. **Layout:** at 390px, 1280px and 1512px, no comment adds horizontal overflow, no card overlaps another card or the content, and the drawer opens and closes.

### R5 Creating a comment

Only in pages that `serve` produces, like the rest of the edit runtime.

1. **From a selection** inside one gated block (`data-gate="pass"`), a Comment control appears by the selection. It opens a one-line note box. Enter saves, Esc cancels, and an empty note sends nothing. Where the rail sits beside the content, the box is a draft card in it, level with what it is about, or right under its thread's card for a reply; below 1100px it docks at the bottom of the window ([0023](../decisions/0023-comment-rail-and-quoted-block-comments.md)).
2. **Snapping:** a selection boundary inside an inline element moves outward until both boundaries sit in the same inline parent. A link and a code span are always taken whole, and a heading's number is never highlighted: a boundary in it moves to just after it ([0020](../decisions/0020-selection-maps-through-turndown-sentinels.md)). The snapped range is highlighted while the note is typed, so you see exactly what will be marked.
3. **Mapping:** the runtime inserts two sentinel characters at the snapped boundaries in a copy of the block and runs house turndown on it. The sentinels are private-use characters that no house rule uses (the mid-line mark is U+E000), and a test asserts it. Only if the output without the sentinels equals the block's source does the runtime write `{==`, `==}` and the note at their positions. Otherwise it offers a block comment. It never guesses an anchor.
4. **Block comments:** these each create a block comment line after the block: a selection in a block that isn't gated, a selection whose boundaries sit in different blocks or in different block children of one block (two list items, or a nested list inside one item), a boundary inside a code block, and the comment control every block gets beside its edit control. A second block comment on the same block goes on its own line after the first. A block comment made from a selection quotes the selected text (R1.8), shown in the note box before it is saved.
5. **Overlap:** a selection that touches an existing highlight is refused, and the message points to that thread's Reply.
6. **Author and ID** follow [0021](../decisions/0021-comment-operations-are-block-saves.md): the author comes from `serve --author {name}`, else `git config user.name`, and with neither the note box says how to set one. A new ID is one above the highest in the file.
7. **Unsaved notes count as unsaved text:** while a note box holds text, `agentDocs.dirty()` is true, so live reload holds as in [M2 R7.3](m2-serve-edit.md#r7-live-reload).

### R6 Replying and resolving

1. **Reply** on a thread opens the same note box and appends a note with the thread's ID after its last note.
2. **Resolve** removes the thread: its notes and the `{==` and `==}` around the highlight, keeping the highlighted text byte for byte. Resolving a block comment line removes the line and one blank line next to it, so no doubled blank line remains.
3. **One save path:** create, reply and resolve each send the block's new source through `POST /_save` ([0021](../decisions/0021-comment-operations-are-block-saves.md)). A stale hash gets 409 and the [M2 R7.4](m2-serve-edit.md#r7-live-reload) recovery, and a render error gets 422 with each `file:line` shown.

### R7 Editing blocks that hold comments

1. **Gate:** a house turndown rule writes a `<mark>` back as `{==…==}` around its content, and a thread as its stored note source. A block with comments then passes the gate like any other.
2. **In place:** notes are not editable, and highlighted text is. Deleting all of a highlight's text leaves its notes as a point comment.
3. **Fallback:** a block with comments that fails the gate edits in the panel, which shows the raw markup ([0005](../decisions/0005-comments-as-inline-criticmarkup.md)).

### R8 `agent-docs comments`

1. **Command:** `agent-docs comments {path}`, for a file or a folder (the same docs `check` walks).
2. **Output:** one head line per thread, then one indented line per note.

   ```text
   docs/m0-report.md:42: [c3] needs agent · "96% of GitHub issues"
     Quy: is that stable across repos?
   docs/m0-report.md:57: [c4] needs you · block comment on the table at line 51
     Quy: S1 is missing from this table.
     Claude: S1 has no cost row. It ran on fixtures only.
   2 threads in 1 doc: 1 needs agent, 1 needs you
   ```

3. **State:** `needs you` when the last note is by `Claude`, else `needs agent`.
4. **Exit:** 0 when every doc parses, with or without threads. Malformed markup exits 1 with each `file:line`, as `check` does.
5. **Quote:** a quoted block comment's head ends `, at "{phrase}"`, and its first note line shows only the text after the quote.

### R9 `export --clean`

1. **Flags:** `export {path} --out {dir} [--md] [--clean]`. `--md` writes `.md` files instead of pages. `--clean` strips comments.
2. **Stripping comments:** a highlight keeps its text, and notes and block comment lines go, with no doubled blank line left behind.
3. **With `--md`, `--clean` also strips islands' markup:** each `<!-- island {name} -->` line goes, and a YAML island's fence info becomes `yaml`. Frontmatter stays, and links between docs stay `.md`.
4. **Bytes:** every byte outside a stripped span equals the source.

### R10 Agent side

1. **Skill:** a short Comments section with the syntax, how to number a new comment, and the contract:
   - run `agent-docs comments {path}`, and work only on threads that need the agent;
   - when a comment asks for a change you can make exactly as asked, make it and delete the whole thread;
   - when it asks a question, needs a judgment call, or you disagree or need the user, reply with a `Claude` note after the last one and leave the thread open;
   - finish by running `agent-docs comments` again and reporting how many threads still need the agent and how many need the user.
2. **Read before every edit:** the page may have added a comment since the agent last read the file, so the M2 rule to read the `.md` again applies to comment work too.
3. **`/docs-review {path}`** runs that contract over a file or folder.
4. **Description:** the skill's always-on description does not grow. A new eval case ("address the review comments in {doc}") triggers the skill, and the M1 and M2 cases still pass.

### R11 Comment corpus

1. **Fixture:** copies of at least 5 of the first user's docs in a temp folder, as for the M2 edit corpus. The originals are never written.
2. **At least 25 cases,** each driven by keyboard and mouse in installed Chrome and checked against a hand-written expected file.
3. **Coverage:** a selection in plain text, one across bold, one inside link text, in a list item, in a heading, on a table, on an island, across two list items, a reply, resolving an inline thread and a block comment line, editing a paragraph that holds a comment, deleting a highlight's text, an overlapping selection, a note with no author configured, a comment saved after the file changed on disk, a phrase selected in a table and in an island (quoted block comments), and a reply on a quoted line.
4. **Each check:** the file equals its expected file byte for byte, and the bytes outside the edited block equal the original's.

## Acceptance

Each item is checked by a test or a recorded run. A12 needs the user's comments, and everything else can run right after implementation ([0022](../decisions/0022-m3-done-when-corpus-and-real-review.md)).

| # | Check | How |
|---|---|---|
| A1 | The comment corpus (R11) passes: every case gives its expected file, and no byte outside the edited block changes. | Playwright on installed Chrome |
| A2 | Over 5 seeded random selections in every gated block of the first user's `docs/` and this repo's `docs/`, the mapping (R5.3) holds for at least 99% of the selections that R5.4 doesn't send to a block comment. Every failure is listed and offers a block comment. | Playwright walk |
| A3 | On copies of the first user's docs with a comment added to every gated block, at least 95% of those blocks still pass the gate, and each that passes turns back into its source byte for byte. | Playwright, gate report |
| A4 | Each R3 error has a fixture that exits 1 with its `file:line`. | `check` fixtures |
| A5 | A commented heading keeps its slug and TOC label. Docs without comments differ by 0 pixels from M2 at 390px and 1280px. The golden diff is reviewed. | Render tests, `scripts/accept/pixel-diff.mjs` |
| A6 | Fixtures with inline, point, block and quoted comments, and a tall table, show the rail at 1280px and 1512px with each card aligned to its anchor or stacked, no overlap and no overflow, and the drawer at 390px, in both themes. | Playwright, screenshots in the pre-public archive |
| A7 | With a note box holding text, an external write shows the banner and holds the reload. Saving then gets 409, and the note's markdown is in the panel. | Playwright with a concurrent write |
| A8 | `comments` prints the expected output for a fixture folder and exits 0, and exits 1 with `file:line` on a malformed fixture. | CLI golden tests |
| A9 | `export --clean` and `export --md --clean` match their golden outputs, and the bytes outside stripped spans equal the source. | CLI golden tests |
| A10 | With no `--author` and no `git config user.name`, the note box refuses to save and names both. `--author` sets the author. | Playwright |
| A11 | Every M1 and M2 test still passes, and the skill eval passes with the new case. | `npm test`, `claude plugin eval` |
| A12 | Real review: you leave at least 10 comments on a copy of one of the first user's docs in the served page. A `/docs-review` session handles all of them, and afterwards every thread is gone with its change in the diff or answered by a `Claude` note. | Recorded run in the pre-public archive |

## Risks for M3

- **Chrome's editing DOM around `<mark>`.** Typing at a highlight's edge can extend or split the mark, and the turndown output then moves the highlight. The corpus covers edge typing. If it stays unreliable, blocks with comments edit in the panel ([0005](../decisions/0005-comments-as-inline-criticmarkup.md)).
- **Room for margin notes.** The shell may lack a right margin at common widths. Threads under their block are the fallback at every width, and A6 checks the layout.
- **The agent loops on its own replies** if it signs with another name. The skill fixes the name to `Claude`, and `needs you` comes from the last note's author.
- **Agents write comments by hand.** An agent that opens a thread to ask the user can pick a used ID. R3.4 makes `check` fail on it.
- **Snapping surprises.** A snapped highlight can be larger than what you selected: the spike grew 15% of paragraph selections, by a median of 9 to 13 characters. The snapped range shows before you type, and A2 measures it again.
- **Sentinels change escaping.** A sentinel next to `_` changed house escaping in 6 of the spike's selections. The guard (R5.3) turns each into a block comment. If real use hits it often, house escaping can skip the sentinels when it looks at a character's neighbors.
- **Diff noise.** Comments add and remove lines in the doc's history. That is the cost of keeping them where the agent reads, and `export --clean` keeps them out of what you send.

## Results

Run on 2026-10-24, branch `m3-comments`, after the rail and quote amendment ([0023](../decisions/0023-comment-rail-and-quoted-block-comments.md)). `npm test`: 541 of 542 pass, 1 skipped (the UI screenshot refresh, which runs only with `UPDATE_SHOTS=1`). Evidence is in the pre-public archive. Each comment test file was also run on its own, so a load flake could not hide behind the full run. A12 ran the same day on the review copy described in its row.

| # | Outcome | Evidence |
|---|---|---|
| A1 | Pass, 29 of 29 comment cases, and the 51 M2 cases still pass. Quoted block comments cover a table phrase, an island phrase, a cross-item selection and a reply on a quoted line. The lead reviewed every expected file before it counted. | pre-public archive |
| A2 | Pass, 99.88%. 5,880 selections: 5,065 inline, all exact and balanced; 809 block comments by R5.4 (801 cross, 8 in code); 6 guard refusals, each offered a block comment. | pre-public archive |
| A3 | Pass, 100%. 690 commented blocks in 34 of the first user's docs, all pass the gate and turn back into their source. | pre-public archive |
| A4 | Pass. 11 error fixtures (the 10 R3 cases plus a figure caption) each exit 1 from `check` with their `file:line`. | pre-public archive |
| A5 | Pass. A commented heading keeps slug and TOC label. The first user's docs, this repo's docs and the `all-blocks` fixture render byte for byte as in M2, and `all-blocks` and the first user's `system-design.md` differ by 0 pixels at 390px and 1280px. No existing golden changed. | pre-public archive |
| A6 | Pass. At 1280px and 1512px in both themes the rail sits beside the content, each card within 4px of its anchor's top or stacked 8px below the card above, with no overlap and no overflow. At 390px the drawer opens and closes with no overflow. Print shows threads in their blocks. | pre-public archive |
| A7 | Pass. | pre-public archive |
| A8 | Pass. | pre-public archive |
| A9 | Pass. | pre-public archive |
| A10 | Pass. | pre-public archive |
| A11 | Pass. Every M1 and M2 test passes. The skill eval passes 21 of 21 runs, the new case included, after the quote line was added to the skill. | pre-public archive |
| A12 | Pass, in the user's judgment. The user left 17 threads on a copy of the first user's `m0-report.md` (the whole of their `docs/` tree, in its own git repo; the original was never written), many of them quoted block comments on the verdicts island. The agent in the session closed 12 with their edits and answered 5 with `Claude` notes, now `needs you`: c4, c5, c6, c13, and c18, where it asked in the session before deleting live S5 resources. One rename also changed an island's column key. `check docs/` passes on the copy. | pre-public archive |

### What differed from the spec

- **The first real-review comment changed the display (R1.8, R4, R5.4, R8.5; [0023](../decisions/0023-comment-rail-and-quoted-block-comments.md)).** A phrase in the verdicts island could only take a block comment, and its note floated below the tall island. Threads now show as cards in a rail beside the content (a drawer below 1100px), and a block comment made from a selection quotes the phrase. The threads stay in their blocks at zero size, because `display: none` let a drag-delete at a highlight's edge remove its notes; the corpus caught it.
- **Comment styles and script only on pages with threads.** They live in `shell/comments.css` and `runtime/comments.js`, not `shell.css`, so a doc without comments stays byte-identical to M2 (R2.5).
- **Island selections needed shadow DOM work.** A selection inside an island's shadow root shows as collapsed in the page selection, so the runtime reads it with `getComposedRanges` and walks out of the shadow root to the island's block.
- **A heading number snaps both ways (R5.2).** A start inside a heading's number moves to just after it, and an end inside it moves to just before it, so the number is never highlighted.
- **Comment markup in a figure caption is an error,** like a table cell: the caption is rendered before thread records are made. A block comment line after the figure works.
- **A drag can't start on link text.** Chrome turns it into a link drag, so the corpus case for a link starts the drag just before it. Snapping a selection inside a link to the whole link is covered by the anchor tests.
- **An escaped `\{==` round trip fails the gate,** because house turndown doesn't escape `{==`. Such a block edits in the panel.
- **A12 ran in the session, with no headless `/docs-review`.** The agent already in the session finds the comments with `agent-docs comments` and acts on them under the skill's Comments contract; nothing spawns an agent to do it.
- **A review comment doesn't authorize an irreversible action.** c18 said "go ahead" to deleting live services, and the agent answered with a note and asked in the session instead.
- **The A2 guard refusals are the known `_` case.** All 6 are a sentinel next to `_` that changes house escaping (R5.3, risk "Sentinels change escaping").
