---
title: M6 spec · Review feedback
status: done
updated: 2026-10-27
---

# M6 spec · Review feedback

M6 fixes what the first weeks of real reviews at work turned up: six notes on the served page, the comment rail and how agents answer comments. Each note is one requirement, F1 to F6, and test names cite those IDs. It shipped in three phases, released together as 0.7.0.

## Requirements

| ID | Requirement | Done when |
|---|---|---|
| F1 | The `serve` index shows each doc's path under the served root next to its title, so a path an agent printed can be found with the browser's find. | Index tests show every path, the frozen margent docs included. |
| F2 | A link inside any comment tint (an inline highlight, a quoted phrase, a prose block's block comment, the pending selection) keeps its own colour and a visible underline. | A pixel test of each tint, light and dark, fails on the old styles and passes. |
| F3 | Rail cards show their thread ID; the rail is wider when the window allows it; long threads and long notes stay compact until a card is expanded. | Display tests for IDs, widths, the compact form, every expand and collapse path, and Reply on a folded thread. |
| F4 | Cmd+Option+M on macOS, Ctrl+Alt+M elsewhere, comments on the selection, in the page and in islands. | Real-keyboard tests on a paragraph, a table cell and an island, and a no-op with no selection. |
| F5 | A comment on a phrase that repeats in its block marks only the match that was selected ([0041](../decisions/0041-quote-names-its-occurrence.md)). | The reported case (a table with "keep" in rows 2 and 6) fails on the old code and passes; the same in an island; `check` fails on an ambiguous or out-of-range quote. |
| F6 | Agents never cite a thread ID in a doc's own text, since resolving deletes the thread. | The rule is in the `margent` and `docs-review` skills. |

## Results

- F1, F2, F4 and F5 met as stated; each test failed before its fix where the requirement says so.
- F3 met. The no-JS and print layouts keep threads inline without IDs: a served page always has JS, and that is where reviews happen.
- F6 is in the skills but unproven: 12 headless review rounds on a doc whose comments invite cross-references (6 with the skill from `main`, 6 with the new rule) cited no thread ID in either case, so the old behaviour never reproduced.
- Not yet checked: a real review round at work on 0.7.0. What it finds starts new work.

## What differed from the plan

- F5 changed decision 0039 in part, so [0041](../decisions/0041-quote-names-its-occurrence.md) amends it rather than superseding it, and `docs/README.md` gained the `amends`/`amended_by` rule.
- F3's IDs are on rail cards only (above).
- Thread ID reuse after a resolve surfaced while designing F3 and is deferred ([decisions index](../decisions/README.md#deferred)).
