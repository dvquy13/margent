---
title: Threads show in a comment rail, and block comments can quote a phrase
status: accepted
updated: 2026-10-24
---

# 0023 Threads show in a comment rail, and block comments can quote a phrase

## Context

- The first comment of the real review (M3 T12) was on a phrase in the M0 verdicts table, which an island draws from the table's cells. Comment markup can't go in a cell, because island data is read from cell source (M3 R3.5), so the selection became a block comment, and nothing recorded which phrase it was about.
- Threads floated in the right margin at the height of their markup. A block comment line sits after its block, so its note showed below a tall island, far from what it was about. Below 1000px wide, notes sat inline in the text.
- The user expects the usual convention: comments in a rail beside the content, each next to what it is about.
- A thread must stay inside its block in the DOM, because house turndown writes the block back from the thread's `data-md` ([0021](0021-comment-operations-are-block-saves.md)).

## Decision

- **Rail:** every page with threads shows them as cards in a right-hand rail. Each card lines up with the top of what it is about (the highlight, a point comment's marker, or the block a block comment line is anchored to), and cards stack in document order when they would collide. The page column narrows to make room. Below 1100px wide the rail is a drawer behind a "Comments" button. The cards are a view built by the page script. The threads stay in their blocks, hidden while the rail is on, and the inline layout remains for print and pages read without JS.
- **Quote:** a block comment line's first note may start with the phrase it is about: `{>>[c1] Quy: "Reddit, Discourse and Stack Exchange are out" → why are these left out?<<}`. A selection that becomes a block comment (a table, an island, a figure, code, or a selection across blocks) records its text this way. The rail shows the quote, `agent-docs comments` prints it, and the page marks the phrase in a plain table on hover. Island data and table source stay untouched.

## Consequences

- Comments never sit in the text at any width, so reading the page with comments open stays clean.
- The agent knows exactly which cell or phrase a block comment means, without a new kind of anchor in the source.
- A quote is plain note text, so reply, resolve, `export --clean` and the gate need no change. A note that doesn't match the quote form exactly is ordinary text, never an error.
- The rail needs JS and layout work on resize and when islands render. That code lives in the read-only page script, so `open` and `export` pages get the rail too.

## Alternatives considered

- **Top-align the margin notes only.** Rejected: wide tables and islands at 1280px leave no margin, so those notes would still drop below their block.
- **Inline markup in plain table cells.** Rejected: tables would need a house turndown round trip, in-cell markup makes rows hard to read in the `.md`, and islands would still need another way.
- **Mention the phrase in the note by hand.** Rejected: the page could neither show nor mark it, and nothing would make it consistent.
