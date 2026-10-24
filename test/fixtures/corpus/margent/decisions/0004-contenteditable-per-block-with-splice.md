---
title: Editing uses contenteditable per block, spliced into source lines
status: accepted
updated: 2026-10-23
---

# 0004 Editing uses contenteditable per block, spliced into source lines

## Context

Design §11 asks how edits made in the rendered page get written back to the markdown. S2 simulated edits in jsdom, and the design notes that real browsers add wrapper divs, stray `<br>` and paste markup (design §12). The block line ranges that M2 needs come from the source maps in spec R1.3, which markdown-it provides ([0011](0011-markdown-it-for-parsing.md)).

## Decision

Each block is `contenteditable`. Edits go through the house turndown and are spliced into the block's source lines. A round-trip gate checks each edit. The editor ships in M2.

## Consequences

- Playwright tests of typing, pasting and undo in Chrome are required before the editor ships (design §12).
- If CriticMarkup does not survive turndown inside a block, that block is edited in the panel instead ([0005](0005-comments-as-inline-criticmarkup.md)).

## Alternatives considered

- **Milkdown, Tiptap.** Rejected: they rewrite the file on save.
- **CodeMirror live preview.** Rejected: it edits a source view, not the rendered page. It stays as the fallback if contenteditable fails in real browsers.
