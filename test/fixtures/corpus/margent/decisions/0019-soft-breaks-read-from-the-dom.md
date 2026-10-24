---
title: Soft breaks carry no renderer marker; the edit runtime reads them from the DOM
status: accepted
updated: 2026-10-25
---

# 0019 Soft breaks carry no renderer marker; the edit runtime reads them from the DOM

## Context

House turndown must write a wrapped paragraph's line breaks back, or every wrapped paragraph fails the round-trip gate. S2 made markdown-it render a soft break as `<br data-soft>`, which a turndown rule turned back into `\n`. That `<br>` shows a line break, so M2 spec R8.1 asked for a marker element that renders as the space a soft break renders today, such as `<span data-soft> </span>`, with R8.2 requiring no pixel change.

M2 T2 measured it. With Google Fonts blocked so screenshots are deterministic, a `<span>` at each soft break changed 109 pixels on the first user's `system-design.md` at 1280px, all on the lines that hold soft breaks. An empty span followed by a plain space gave the same 109 pixels, while a plain space gave 0. Any element boundary at the break changes how Chrome shapes the text around it.

## Decision

The renderer emits no soft-break marker. markdown-it's default stays: a soft break is a bare `\n` in the paragraph's text. The HTML parser keeps that `\n` in the text node's data; only rendering collapses it to a space. Before turndown, the edit runtime clones the block and turns each `\n` that has inline content on both sides into `<br data-soft>` on the clone (`prepareClone` in `runtime/edit/turndown.js`). A turndown rule writes that back as `\n`. Newlines between block-level children, and text inside `pre` or `code`, are left alone.

The list gap marks (`data-gap="1"`) and the original link and image targets (`data-md-href`, `data-md-src`) stay in the renderer: they are attributes, so they change no pixel.

## Consequences

- `open`, `export` and `serve` pages render pixel-identical to M1. A10 measured 0 differing pixels on `all-blocks` and the first user's `system-design.md` at 390px and 1280px.
- The soft-break logic lives in one place, the edit runtime. The renderer's output keeps no editing concerns beyond attributes.
- The runtime must tell soft breaks from formatting newlines by their neighbours, which is a heuristic over markdown-it's output shape. The gate catches a wrong guess: the block fails and edits in the panel.

## Alternatives considered

- **`<span data-soft> </span>` in the renderer (spec R8.1 as written).** Rejected: it changes glyph placement (109 pixels on `system-design.md`).
- **Accept the sub-pixel shift and relax A10.** Rejected: the DOM already carries the information, so no change to the page is needed.
- **A zero-width character at the break.** Not tried: it is still a change to the text the browser shapes, and it would leak into copy and paste.
