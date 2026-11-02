---
title: M7 spec · Polish
status: done
updated: 2026-11-02
---

# M7 spec · Polish

M7 fixes two annoyances in the served page and adds two features the user asked for after 0.8.0. Each item is one requirement, P1 to P4, and test names cite those IDs.

## Requirements

| ID | Requirement | Done when |
|---|---|---|
| P1 | On macOS, Home and End in a comment field, the edit panel or a block being edited move the caret to the start or end of the line, and Cmd+Home and Cmd+End to the start or end of the field. Shift extends the selection. The page doesn't scroll. Other platforms keep the browser's own keys. | Real-keyboard tests in each of the three fields fail on the old code and pass. |
| P2 | A block comment that quotes a phrase lines up its rail card with the phrase, not the top of its block. Cards stack in page order. A phrase that isn't found, or sits in an island, keeps the block's top. | A display test with two quoted cells in a long table, written in the reverse of page order, fails on the old code and passes. |
| P3 | `margent init` previews its target with `--dry-run` and writes a chosen file with `--into`, `CLAUDE.local.md` included. A block already on the path is updated where it is. The skill asks the user which file once per repository ([0043](../decisions/0043-init-asks-which-file.md)). | Init tests for each output, each refusal, the local file's exclude line and its teardown. The `margent` skill states the ask, and `claude plugin eval` passes. |
| P4 | A note can carry the UTC minute it was written, `{>>[c1 2026-11-02T14:31Z] Quy: text<<}`. The page writes it on new notes and replies, an edit keeps it, and cards show it as a relative time ([0044](../decisions/0044-notes-carry-utc-time.md)). | Syntax, render, error-fixture, display and corpus tests. The skill and the init block tell agents to add the time to their replies. |

## Results

- P1 met. The new tests fail on the old runtime because Home left the caret where it was. Headless Chrome didn't scroll the page, so the caret assertions prove the fix, not the scroll checks. The tests run on macOS only (`fullMac` in `test/helpers/tier.mjs`), since other platforms keep the browser's keys.
- P2 met, in the rail and in the drawer, which lists cards in page order too. Not covered: a phrase quoted inside an island still lines up with the island's top, since the page can't measure inside the frame. That needs the guest to report the phrase's rect.
- P3 met. `claude plugin eval` passes.
- P4 met. Served-page tests and the edit corpus pin the browser clock (`PINNED_NOW` in `test/helpers/serve-page.mjs`), so new notes in the corpus expected files carry `2026-11-02T14:31Z`.
- `npm run test:full`: 768 pass, 0 fail, 1 skipped (the screenshot test, which runs only with `UPDATE_SHOTS`).
- Not yet checked: a real review round on the release that ships M7.
