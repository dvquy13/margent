---
title: A quoted phrase names its occurrence when it repeats
status: accepted
updated: 2026-10-27
amends: 0039
---

# 0041 A quoted phrase names its occurrence when it repeats

## Context

- In a real review the user commented on "keep" in row 2 of a table. A table can't hold comment markup, so the comment became a quoted block comment, `"keep" → …`. The table has "keep" in row 6 too, and the page marked both.
- [0039](0039-quoted-phrase-must-match.md) chose that on purpose: the source couldn't say which match was meant, so the page didn't pick one. The page knew which one the user selected, though, and threw it away when it stored the quote.
- Every other part of 0039 holds: one file for the quote rules, `check` failing on a quote that isn't found, the "not found in the page" label, and how unquoted block comments are marked.

## Decision

- A quote may name which match it means: `{>>[c5] Quy: "keep" #2 → why keep this?<<}` is the second match in the block, in reading order. `#n` is 1-based and comes right after the closing `"`, with one space each side.
- When a selection becomes a quoted block comment and its phrase occurs more than once in the block, the page writes `#n` for the selected match. A phrase that occurs once gets no `#n`, so most quotes read as before. An island's selection does the same: the guest knows which match was selected.
- The page marks only the `n`th match. In islands the same rule applies through the `mark` message.
- `check` fails on a quote that matches more than once with no `#n`: `{file}:{line}: comment {id}: quoted phrase "{quote}" occurs {count} times in the {anchorKind} it is anchored to; add #{n} after the quote to say which`. It also fails on a `#n` past the last match: `{file}:{line}: comment {id}: quoted phrase "{quote}" #{n}: the {anchorKind} it is anchored to has only {count}`.
- The page still renders such a quote, as it does a quote that isn't found. An ambiguous quote marks every match, and its card says how many places it matches. A `#n` past the last match gets the "not found in the page" label.
- `MargentQuote` (`runtime/quote.js`) stays the one place for the rules: `find` still returns every match, and the caller picks the `n`th. A new helper gives the occurrence of a selected range.
- `#1` on a phrase that occurs once is allowed. It is in range, so there is nothing to fix.

This amends 0039: it replaces the bullet that marks a repeated phrase everywhere, and the rest of 0039 stands.

## Consequences

- A comment on one cell marks that cell, in tables and in islands.
- An agent that writes a quote by hand learns from `check` when it is ambiguous, and which `#n` values exist.
- Docs whose quotes repeat in their block now fail `check` until each gets a `#n`. margent is 0.x and keeps no compatibility here.
- An edit that adds a match before the selected one moves the mark to the wrong match without an error. A quote whose text changes has the same weakness today. The card shows the quote, and the thread's notes show what it was about.
- `#n` is part of the first note's source, so reply, resolve, `export --clean` and note edits carry it unchanged.

## Alternatives considered

- **Widen the stored quote until it is unique** (`"keep the cache" → …`). Rejected: the card and the mark would show more than the user selected, and a widened quote can still grow ambiguous after an edit.
- **Store a table row number.** Rejected: it works only for plain tables, and an island draws rows its own way.
- **Comment markup inside table cells.** Rejected in [0023](0023-comment-rail-and-quoted-block-comments.md): island data is read from cell source.
- **Mark only the first match when no `#n` is given.** Rejected for the reason in 0039: it picks one quietly.
