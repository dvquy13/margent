---
title: A quoted phrase must be found in its block
status: accepted
updated: 2026-10-26
---

# 0039 A quoted phrase must be found in its block

## Context

- A quoted block comment ([0023](0023-comment-rail-and-quoted-block-comments.md)) stores its phrase as text from the page, with whitespace collapsed and each `"` written as `'`. The page finds it again by searching the block. Every highlight bug since 0023 was a quote that this search missed: a phrase across two list items, an island quote with no space at a block boundary, a `"` on the page. Each was fixed where it showed, and the search rules ended up in three copies: the edit runtime's `quoteOf`, the rail's `findText` and the island guest's `findRanges`. The rail marked the first match and the guest marked every match.
- A missed quote was silent. The card linked to the whole block, so the miss showed only to a reader who noticed the phrase wasn't tinted.
- An agent writes quotes by hand and may copy markdown into them (`` `gardener apply P1` ``), which never matches the page's text.
- A card with no highlight in a real review turned out to be an agent's unquoted block comment on a paragraph. The skill offered a thread on its own line and an inline highlight as equal choices, so the agent picked the block form for a remark about one sentence.

## Decision

- `check` fails on a quoted block comment whose phrase isn't in the block it is anchored to: `{file}:{line}: comment {id}: quoted phrase "{quote}" is not in the {anchorKind} it is anchored to`. `open`, `export` and `serve` render the page as before, as for a broken link ([0036](0036-check-fails-on-broken-links.md)), so an edit that breaks a phrase never blocks the page.
- The page shows a missed quote: its card says the phrase is not found in the page.
- One file, `runtime/quote.js`, holds the rules for storing and finding a quote. The rail, the island guest and the edit runtime all use it.
- A phrase that occurs more than once in its block is marked everywhere it occurs, in the page as in islands. The source can't say which one was meant, so the page doesn't pick one. This isn't a `check` failure.
- A block comment with no quote is marked all the time, not only while its card is linked. A paragraph, heading, list or blockquote gets all its text tinted, the same way a quoted phrase is. A table, code, a figure or an island keeps its left bar in the light tint, since tinting the whole block would be one large patch of colour. Both turn strong while the card is linked. Before, such a comment showed nothing in the page until its card was hovered.
- The skill tells agents to highlight the words when a comment is about words in prose, and to keep a thread on its own line for tables, code, islands, figures and remarks about a whole block. A quote is the text as the page shows it, with no markdown.

## Consequences

- A quote that drifts, from an edit to the block or a mistyped agent quote, fails the command agents already run after every edit, with the comment's line.
- A note that doesn't have the exact quote form is still plain text (0023). Only a well-formed quote is checked.
- `check` loads a page in Chrome when the doc has a quoted comment, as well as when it has islands.
- A future change to the rules lands in one file, and the store and find sides can't disagree.
- Out of scope: a selection in prose that turndown can't map still becomes a quoted block comment (`runtime/edit/anchor.js`).

## Alternatives considered

- **Strip markdown from a quote before matching.** Rejected: one more lossy step for the search to get wrong, when `check` already tells the agent to fix the quote.
- **Anchor quotes by position, or in a sidecar file.** Rejected for the reasons in [0005](0005-comments-as-inline-criticmarkup.md): positions drift with every edit, and the agent would need a special read.
- **Mark only the first match of a repeated phrase.** Rejected: it quietly picks one when the source doesn't say which.
