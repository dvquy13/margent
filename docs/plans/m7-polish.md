---
title: M7 plan · Polish
status: accepted
updated: 2026-11-02
---

# M7 · Polish: Home/End, card alignment, init target choice, note time

## Tracker

- [x] T0 Branch `feat/m7-polish`; write `docs/specs/m7-polish.md` (P1–P4), `docs/plans/m7-polish.md` (this plan), decisions 0043 and 0044; `check docs/` exits 0
- [ ] T1 P1 Home/End move the caret in every editor text field on macOS (`fix:`)
- [ ] T2 P2 A block comment's card lines up with its quoted phrase (`fix:`)
- [ ] T3 P3 `margent init` previews and takes a chosen file, `CLAUDE.local.md` included; the skill asks once per repo (`feat:`)
- [ ] T4 P4 Notes carry an optional UTC time; cards show it (`feat:`)
- [ ] T5 Docs: architecture, system design, CLAUDE.md spec map, spec Results; `npm run typecheck`, `npm run test:full`, `claude plugin eval`
- [ ] T6 Stop and ask before merging into `main` (no push, no release)

## Context

The user asked for four improvements after 0.8.0:
1. Choose where `init` writes its block, including the personal, gitignored `CLAUDE.local.md`, with the skill confirming the target with the user (this amends decision 0040, which rejected asking).
2. Show when a comment was written.
3. On macOS, Home in a comment box scrolls the page to the top instead of moving the caret (Chrome follows the Cocoa convention).
4. A block comment that quotes a phrase lines up with the top of its block, not the phrase, which is far off in a long table.

Approved in conversation: `CLAUDE.local.md` is the local file; note time is option A (in the grammar); Home/End as proposed; no "skip" in the init question.

## Execution model

Sequential subagents on Haiku, one per task, lead reviews each diff before the next. Not parallel: T4 touches files T1 to T3 also touch (`runtime/edit/comments.js`, `runtime/comments.js`, `src/cli/agents-block.ts`, `skills/margent/SKILL.md`), and parallel agents in one tree break each other's test runs (a `src/` edit mid-run fails `page-edit.test.mjs`) and load makes browser tests flaky. Each agent: runs tests in the foreground, commits with a pathspec, one Conventional Commit per task, test names cite P1–P4. New browser tests get `full` from `test/helpers/tier.mjs` (decision 0027). Each new test must fail on the old code first.

## T0 Docs first (lead)

- `docs/specs/m7-polish.md`: requirements table P1–P4 with "Done when" (from the sections below), Results left empty. Mirror `docs/specs/m6-review-feedback.md`.
- `docs/decisions/0043-init-asks-which-file.md` (`amends: 0040`; add `amended_by` to 0040 per `docs/README.md`), `docs/decisions/0044-notes-carry-utc-time.md`. Add both to `docs/decisions/README.md`.
- `docs/plans/m7-polish.md`: this plan.

## T1 P1 Home/End in editor fields

Files: new `runtime/edit/keys.js`; wire into `runtime/edit/comments.js` `attachDraft` (~:403), `runtime/edit/inline.js` keydown (~:30, only when the target is a contenteditable block), `runtime/edit/panel.js` keydown (~:204).

- `lineKeys(e)`: returns false unless macOS (move `IS_MAC` from `comments.js:24` into `keys.js` and import it in both places), key is Home or End, no Alt, not composing. Then `preventDefault()` and:
  - textarea: Home/End go to the start/end of the current line (text between `\n`); Cmd+Home/End go to the start/end of the field. Shift extends from the selection's anchor (respect `selectionDirection`). Use `setSelectionRange(start, end, direction)`.
  - contenteditable: `getSelection().modify(shift ? 'extend' : 'move', home ? 'backward' : 'forward', cmd ? 'documentboundary' : 'lineboundary')`.
- Other platforms keep native behavior.
- Tests (`test/comments-ui.test.mjs`, `test/edit.test.mjs` or wherever inline/panel typing tests live; tier `full`): scroll the page down, open the field, type `world`, press Home, type `hello `, assert value `hello world` and `scrollY` unchanged. Also End, Shift+Home selects, Cmd+Home on a two-line comment (Shift+Enter) goes to field start. One case each for an inline block and the panel. Real keyboard only.

## T2 P2 Card lines up with the quoted phrase

File: `runtime/comments.js`.

- Call `markQuotes()` before the first `relayout()` (today :326 runs after :265).
- In `relayout()` (~:213), a card's `wanted` top is the top of its first marked range (`markRanges.get(id)[0].getBoundingClientRect().top`) when it has one and its anchor isn't a prose block marked whole; otherwise its anchor's top as today. A quote not found, or in an island, keeps the block top.
- Sort entries by `wanted` (stable) before placing, so two quotes in one table stack in page order; reorder the rail's card nodes to match when the order changed, so Tab order follows what is seen. The draft insertion (`findIndex(e.wanted > wanted)`) then works on sorted entries.
- Out of scope: phrases quoted inside islands (the page can't measure inside the frame). Note it in the spec Results as a follow-up.
- Tests (`test/comments-display.test.mjs`): new fixture with a ~30-row table, block comments quoting a cell in row 25 and, after it in the source, one in row 3. `layout()` uses the phrase's rect for quoted block comments (find it with the page's `MargentQuote.find(anchor, quote)`, honoring `#n`); `assertWideLayout` walks cards sorted by top. Must fail on the old code.

## T3 P3 init target choice

Files: `src/cli.ts` (`commandInit`, `commandTeardown`, `USAGE`, a `parseInit` in the style of `parseExport`), `src/cli/agents-block.ts`, `test/init.test.mjs`, `skills/margent/SKILL.md` `## Projects` (:38–42).

- Files margent knows: `AGENTS.md`, `CLAUDE.md`, `CLAUDE.local.md` (add to `AGENT_FILES`, so `agentsFilesOn` and teardown see it).
- `initTargets`: first, the nearest folder on the walk whose known files hold a block wins (update in place, those files only). Otherwise today's rule (0040).
- `margent init {path} --dry-run`: writes nothing; prints `would add|would update|unchanged {file}` per target.
- `margent init {path} --into {file}`: the file's name must be one of the three and its folder on the walk (start to git root); else exit 1 naming the allowed choices. If a block already exists in another file on the walk: exit 1, "a margent block is already in {file}: run margent teardown first". Home-dir refusal still applies.
- Writing `CLAUDE.local.md`: if `git check-ignore -q` says it isn't ignored, append `/{path from root}` to the file from `git rev-parse --git-path info/exclude` (worktree-safe) and print `excluded {file} in .git/info/exclude`. Teardown that deletes an emptied `CLAUDE.local.md` removes that exact exclude line.
- Skill text: before the first doc in a repo, run `margent init {doc path} --dry-run`. If it prints `would update` or `unchanged`, run `margent init {doc path}`. If `would add`, ask the user once: the proposed file (recommended, colleagues' agents learn the rules), `CLAUDE.local.md` (only you; only Claude Code reads it), or another `AGENTS.md`/`CLAUDE.md` on the path; then `margent init {doc path} --into {choice}`. Same ask when the user asks to set margent up.
- Tests in `test/init.test.mjs` (temp git repos as today): dry-run writes nothing and prints each state; `--into CLAUDE.local.md` writes it and the exclude line, once; already-ignored file adds no line; `--into` outside the walk, a wrong name, or with an existing block elsewhere exits 1; plain init after `--into CLAUDE.local.md` updates it and never touches `AGENTS.md`; teardown removes the local block, the file and the exclude line.

## T4 P4 Note time

Format: `{>>[c1 2026-11-02T14:31Z] Quy: text<<}`. Optional, UTC, minute precision, `Z` required. Old notes stay valid.

- `src/comments/syntax.ts`: `NOTE` gains `(?: (?<time>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z))?` after the id; `NoteParts.time?`; `noteSource` validates and writes it; `findNotes` carries it; `replaceNote` keeps the note's original time (an edit doesn't restamp); `appendNote` writes the passed time.
- `src/render/comments.ts`: `EMPTY_NOTE` (:46) accepts the time; `noteRule` reads it; an impossible date (month 13) is `{file}:{line}: comment time {t} is not a valid UTC time`; malformed-head message names both forms. Renderer emits `<time class="c-time" datetime="{t}">{YYYY-MM-DD HH:MM} UTC</time>` after `.c-author` (static text for no-JS and print). Error fixture in `test/fixtures/comments/errors/` + `ERROR_FIXTURES` row.
- `runtime/comments.js` card build (:93–119): move `.c-time` into `.c-note-head` beside the author (else it lands in `.c-text`); text becomes relative (`just now`, `5m`, `3h`, `2d`, then `Nov 2` / `Nov 2, 2025`), `title` the full local time; refresh every 60s. Style in `shell/comments.css` (muted, small).
- `runtime/edit/comments.js` `submit` (:385): new notes and replies get `time: new Date().toISOString().slice(0, 16) + 'Z'`; edits pass the original.
- Tests: syntax round-trips with and without time, `replaceNote` keeps it; render golden gains a timed note (`UPDATE_GOLDEN=1`, review diff); display test for relative text and title; serve/UI tests and the edit corpus pin the clock with Playwright `page.clock.setFixedTime` (playwright-core 1.64) so `*.expected.md` stay deterministic, then regenerate the corpus expected files and review the diff (only the new time in new notes).
- Agents: `skills/margent/SKILL.md` `## Comments` (:125, :136) and `src/cli/agents-block.ts` `BLOCK`: replies carry the time from `date -u +%Y-%m-%dT%H:%MZ`, e.g. `{>>[c1 2026-11-02T14:31Z] Claude: …<<}`; the time is optional.

## T5 Docs and verification (lead)

- `docs/architecture.md` (`### Comment HTML`, init rows at :20 and :164, edit runtime keys), `docs/design/system-design.md` (`### Comments` :121, `## How agents use it` :230), `CLAUDE.md` Rules: add `docs/specs/m7-polish.md` for P1–P4. Spec Results filled. `node dist/cli.js check docs/` exits 0.
- `npm run typecheck`; `npm run test:full` (judge a timing failure by rerunning that file alone); `claude plugin eval` after the SKILL.md edits.
- Manual: `margent serve` a doc with a long table; Home in a comment box; quoted-cell card level with its row; a new comment shows "just now"; `margent init --dry-run` / `--into CLAUDE.local.md` in a scratch repo.
- Clean up leaked Chromes/servers I started.

## T6

Report and ask before merging `feat/m7-polish` into `main`. No push, no release.
