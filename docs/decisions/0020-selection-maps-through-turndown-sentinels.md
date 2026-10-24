---
title: A selection maps to source through house turndown with sentinels
status: accepted
updated: 2026-10-25
---

# 0020 A selection maps to source through house turndown with sentinels

## Context

- An inline comment wraps the selected text in the block's markdown source (`{==text==}`), so the page must find where the selection's start and end fall in that source ([0005](0005-comments-as-inline-criticmarkup.md)).
- The design proposed searching the block's source for the selected text and refusing unless it occurs exactly once. Selected text and source differ whenever the selection crosses formatting (`the filter keeps` in the page is `the **filter** keeps` in source), and short selections repeat.
- For a block that passes the round-trip gate, house turndown of the block's DOM equals its source byte for byte ([0017](0017-gate-and-turndown-run-in-the-browser.md)). Characters inserted into the DOM come out at the matching place in the source.
- Spike S5 tested this on 2026-10-24 on every gated block of the first user's `docs/` and this repo's `docs/`, with 5 seeded random selections per block. 720 of 5,560 selections spanned list items and would get a block comment. Of the other 4,840, 4,826 (99.7%) mapped exactly with balanced markup. Snapping grew 15% of paragraph selections, by a median of 9 to 13 characters.

## Decision

- Only blocks with `data-gate="pass"` take inline comments. Every other block takes a block comment line after it.
- **Snap** each selection boundary outward until both sit in the same inline parent. A link and a code span are taken whole. A heading's number is never highlighted, so a boundary in it moves to just after it, where the renderer's number detection still sees the number first.
- **Block comment instead** when the boundaries sit in different block children (two list items, or a nested list inside one item) or when either boundary is inside a code block.
- **Map:** insert two sentinel characters at the snapped boundaries in a copy of the block and run house turndown on it. The sentinels are private-use characters that no house rule uses, which a test asserts. The house mid-line mark is U+E000, so the sentinels can't be.
- **Guard:** the positions are used only if the output without the sentinels equals the block's source. Otherwise the page offers a block comment, so an anchor is never guessed.

## Consequences

- An inline comment never depends on the selected text being unique or matching the source character for character.
- The anchor rule and the edit rule are the same code: whatever turndown understands, comments understand.
- A sentinel next to `_` can change house escaping (`can_use_tool` became `can_use\_tool` in 6 of the spike's selections). The guard catches it, and the cost is a block comment for that selection.
- A highlight can be larger than the selection. The page shows the snapped range before the note is typed.

## Alternatives considered

- **Search the source for the selected text.** Rejected: fails across formatting, and needs a longer selection whenever the text repeats.
- **Anchor on the server.** Rejected: the selection lives in the DOM, and the server sees only text ([0021](0021-comment-operations-are-block-saves.md)).
- **Map DOM offsets to source offsets with markdown-it token positions.** Rejected: markdown-it maps blocks to lines, not inline tokens to columns, so this would mean a second, column-level source map next to the gate.
