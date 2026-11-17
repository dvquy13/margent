---
title: No per-block Comment control
status: accepted
updated: 2026-11-16
---

# 0048 No per-block Comment control

## Context

- M3 R5.4 gave every block a Comment control at its top right, next to its edit control. Hovering a block that isn't gated (a table, code, a figure, an island, a diagram) showed it. A gated block showed it only once it held focus.
- The user reported on 2026-11-16 that the control gets in the way of selecting text: it shows on hover right where a drag near the block's top right starts or ends, so highlighting a phrase there is awkward.
- Every block that has text can already take a block comment from a selection. A selection in a block that isn't gated, across two blocks' children, or inside code becomes a block comment line that quotes the selected text (R5.4, [0023](0023-comment-rail-and-quoted-block-comments.md)). Selecting all of a block's text gives the same comment with the whole text as its quote.

## Decision

- The per-block Comment control is removed. A comment, inline or block, always starts from a selection, through the Comment tool at the selection or the comment shortcut.
- The rest of R5.4 stands: the cases that turn a selection into a block comment line, and a second block comment on a block going after the first.

## Consequences

- Hovering a block shows only its edit control, and only for blocks that edit in the panel.
- A block comment made in the page always quotes a phrase. The only unquoted one left is a selection of nothing but white space.
- A block with no selectable text, such as a figure that is only an image, can't take a comment in the page. The author or an agent writes one in the markdown instead (`{>>[c5] Quy: …<<}` on its own line after the block).
- The edit corpus drops its three cases that used the control (a table, a paragraph and an island); the table and island cases that start from a phrase cover those blocks. The case for a second block comment now starts from a selection.

## Alternatives considered

- **Keep the control and move it out of the text's way** (outside the block, or only after a delay). It stays one more thing on hover, and a selection already does the same job.
- **Show it only on keyboard focus.** It would be invisible to a mouse user, so it would add code for a path few would find.
