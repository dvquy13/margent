---
title: Plan · M6 Review feedback
status: draft
updated: 2026-10-27
---

# Plan · M6 Review feedback

Triage of six notes from using margent for reviews at work, and the order to address them in. Three phases on branch `m6-review-feedback`, merged and released together as one version once all three are done. F5 misleads the reviewer, so it goes before the rail work. Delete this plan when M6 closes, once its contracts are in `architecture.md`.

## Tracker

- [x] Phase 1 · Quick fixes, full tier green
  - [x] T1 Links stay visible inside a comment highlight (F2)
  - [x] T2 Agents never cite a thread ID in the doc's text (F6). Unproven: 12 headless review rounds on a fixture that invites citations, half on `main`'s skill, cited no ID in either variant
  - [x] T3 Doc paths in the `serve` index (F1)
- [ ] Phase 2 · A repeated phrase marks only the one commented
  - [ ] T4 Reproduce F5 in a failing corpus case; decision 0041: quotes name their occurrence, superseding part of 0039
  - [ ] T5 Grammar, render record and `check`
  - [ ] T6 Store side: page and island selections record the occurrence
  - [ ] T7 Rail, `comments` output and skill
- [ ] Phase 3 · Comment rail for real reviews
  - [ ] T8 Thread IDs on cards (F3)
  - [ ] T9 Wider rail, compact cards, long threads and notes (F3)
  - [ ] T10 Keyboard shortcut to comment on a selection (F4)

## Triage

| # | Feedback | Kind | Root cause | Size | Phase |
|---|---|---|---|---|---|
| F1 | Show doc paths in the navigation page, since agents print paths | UX | The `serve` index (`src/serve/index-page.ts`) lists titles under folder names, never file names. The page shows its path only in the footer, relative to the docs root | S | 1 |
| F2 | A phrase highlight hides the links inside it | bug | Links differ from prose only by colour (`--text` against `--text-muted`) and a 1px underline in `--border`. Every highlight sets `color: var(--text)` (`shell/comments.css`), and the grey underline is lost on the accent tint, so a link reads as plain text. Hypothesis until reproduced | S | 1 |
| F3 | Show thread IDs (c5) so the user can follow the agent; a larger rail; better UI for long threads and notes | UX | Cards show no ID. The rail is a fixed 280px. Every card shows every note in full, so a long thread pushes the cards below it far from their anchors | M | 3 |
| F4 | Keyboard shortcut to comment on a selection | feature | Only the Comment pill opens a draft (`onTool` in `runtime/edit/comments.js`) | S | 3 |
| F5 | Commenting "keep" in row 2 of a table also highlights "keep" in row 6 | bug, by design | A table can't hold comment markup, so the comment is a quoted block comment, and [0039](../decisions/0039-quoted-phrase-must-match.md) marks every match in the block because the source can't say which one was meant | M | 2 |
| F6 | The agent writes "see c3" into the doc, and the reference dangles once the thread is resolved | agent behaviour | Resolve deletes the thread ([0035](../decisions/0035-agent-replies-human-resolves.md)). Nothing in the skills tells the agent that IDs belong only in notes and chat | S | 1 |

F3 and F6 pull the same way: IDs become something the user reads and says in chat, so they must never leak into the doc's prose, where they outlive their thread.

## Phase 1 · Quick fixes

Small, independent changes.

### T1 Links in a highlight (F2)

1. Reproduce before fixing: a fixture with a link inside an inline highlight (`{==see [the spec](x.md)==}`), inside a quoted phrase, and inside a prose block with an unquoted block comment. Screenshot each in light and dark.
2. Fix in `shell/comments.css` (and `shell.css` if the link style itself changes). Likely: drop `color` from `mark.c-hl` and both `::highlight` rules, so each element keeps its own colour, and give a link an underline that holds on the tint (`mark.c-hl a`; a Custom Highlight can't style a descendant, so the quote case may need a stronger underline on links everywhere). Pick with the design-principles skill.
3. If the reproduction shows a click on such a link also misbehaves, cover that in the same task.

Done when: a browser test asserts a link inside each of the three highlight forms keeps a visible underline and a colour distinct from the text around it, and the screenshots show it.

### T2 No thread IDs in the doc's text (F6)

1. `skills/margent/SKILL.md` and `skills/docs-review/SKILL.md`: a thread ID appears only in its notes and in what the agent tells the user. The doc's text never cites one ("see c3"), because resolving deletes the thread. The change goes into the doc itself, and the reply note says where.

Done when: the skill text is in, `claude plugin eval` still passes, and one headless review round on a fixture doc produces no ID in the doc's text.

### T3 Paths where the user looks (F1)

The `serve` index (`/`, what `margent serve docs` opens on) shows each doc's path relative to the served root next to its title, in the mono face and muted, so Cmd+F on a path an agent printed finds the doc. Folder headings stay. The page itself is unchanged.

Done when: golden and index tests show the paths, and the index of the frozen margent docs shows each doc's path.

## Phase 2 · One phrase, one mark

The note grammar changes, so this phase makes the release a `feat:` (minor).

### T4 Reproduce, then decision 0041

First a corpus case that reproduces F5 as reported (a comment on "keep" in row 2 of a table that also has "keep" in row 6) and fails on `main` because row 6 is marked too. The fix is done only when that same case passes.

Supersedes one bullet of [0039](../decisions/0039-quoted-phrase-must-match.md) ("a phrase that occurs more than once in its block is marked everywhere"). The source can now say which match was meant.

Recommended design: a quote may name its occurrence, `"keep" #2 → why keep this?`, meaning the second match in the block in reading order.

- The page writes `#n` when the selected phrase occurs more than once in the block, and never otherwise, so most quotes read as today.
- `check` fails on a quote that matches more than once with no `#n` (`comment c5: quoted phrase "keep" occurs 3 times in the table; add #n to say which`) and on a `#n` past the last match. An agent writing quotes by hand is told exactly what to fix.
- Known limit: an edit that adds an earlier match moves the mark to the wrong one, silently. The same is true of a quote today when its text changes; the reply note and the card's quote show what was meant.

Alternatives for the record: widen the stored quote until it is unique (changes what the card shows and what is marked); store a table row number (table only, and island rows don't map to it); markup in table cells (rejected in [0023](../decisions/0023-comment-rail-and-quoted-block-comments.md)).

### T5 Grammar, record, `check`

- `src/comments/syntax.ts`: `QUOTED`, `splitQuote` and `quotedText` read and write the optional ` #n`.
- `src/render/comments.ts`: the `Thread` record carries `occurrence`.
- `runtime/quote.js` keeps `find` returning every match; the caller picks the nth, so store and find stay in one file.
- `quoteReport()` and `src/cli/pages-run.ts` report both new failures.

### T6 Store side

- Page selection: count the matches of the stored phrase in the block that start before the selection's start (`MargentQuote.find` on the block, compared with `Range.compareBoundaryPoints`).
- Island selection: the guest knows which match the selection is, so its `selection` message gains `occurrence` and `count`.

### T7 Rail, `comments`, skill

- The rail marks only the nth range, in the page and in island frames (`mark` gains the occurrence).
- `margent comments` prints `"keep" #2` in the head line.
- The skill's comment section documents `#n` and when it is required.

Done when: a corpus case reproduces F5 (a comment on "keep" in row 2 of a table that has "keep" in row 6 too) and only row 2 is marked; the same in an island; `check` fails on an ambiguous hand-written quote and on an out-of-range `#n`.

## Phase 3 · Comment rail for real reviews

Design pass first (design-principles skill), with a mock of a long thread, a long note and a narrow window before any code.

### T8 IDs on cards (F3)

- Each card's head shows its ID (`c5`), mono and muted, before the first author. Selectable, so it can be copied into chat.
- The no-JS and print layouts show it too, so every view names the thread the same way.

### T9 Wider rail, compact cards (F3)

- Width: wider where the viewport allows (for example 360px from about 1300px, 280px between 1100 and 1300). The content column keeps its measure.
- Compact by default: an unlinked card shows the quote, the first note clamped to a few lines, a "{n} more" line for the middle notes, and the last note. The linked or focused card expands in full and the rail relays out around it, as Google Docs does with its selected comment.
- A long note clamps with "Show more", and the composer keeps growing to its cap.
- Below 1100px (the drawer) cards are already in a scrolling column; they take the same compact form.

Done when: corpus cases with a ten-note thread and a 1,500-character note show the unlinked card at its compact height, the focused card in full with no overlap, everything reachable by keyboard, and no change to the source.

Known limit: a new thread takes the ID one above the highest in the file, so resolving the highest thread frees its ID for reuse. Once users quote IDs in chat this can confuse across rounds. Not fixed here: avoiding it needs a record of resolved IDs.

### T10 Keyboard shortcut (F4)

- Cmd+Option+M on macOS and Ctrl+Alt+M elsewhere, the same as Google Docs. Match on `e.code === 'KeyM'`: Option+M types `µ` on a Mac, so `e.key` is wrong.
- It does what the Comment pill does, through `onTool`, in the same states (a selection inside one block, no draft open). The pill's label shows the shortcut.
- In an island the keydown happens in the frame. The guest posts a new `shortcut` message, and `host.js` raises it on the page like the `selection` message. Add the row to the messages table in `architecture.md`.

Done when: a browser test types the shortcut with real keyboard input on a prose selection, a table selection and an island selection, and each opens the right draft.

## Each phase is done when

- `npm test` passes during work, and `npm run test:full` before the merge into `main`.
- `architecture.md`, the skills, and a decision where the behaviour changes are updated in the same branch, and `node dist/cli.js check docs/` exits 0.
- One real review round at work on the release, since every note here came from one.

## Settled

- Phase order: F5 before the rail work.
- F5: occurrence `#n`, with `check` failing on ambiguous quotes, once the bug is reproduced in a failing test.
- F1: the `serve` index only, paths relative to the served root.
- F6: the skill rule alone, no `check` guard.
