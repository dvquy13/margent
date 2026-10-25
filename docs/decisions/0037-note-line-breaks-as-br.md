---
title: A note's line breaks are stored as <br>
status: accepted
updated: 2026-10-25
---

# 0037 A note's line breaks are stored as `<br>`

## Context

A note was one line of plain text (M3 spec R1.2). In the comment box, Enter saved and Shift+Enter saved too, and a pasted line break became a space. The user wanted Shift+Enter to start a new line, as it does in most chat and comment boxes.

The one-line rule does real work. A note sits inline next to the text it is about, the grammar matches it within one line, and an agent can find and grep a whole thread on one line.

## Decision

A note stays one line in the source, and `<br>` in its text displays as a line break.

- In the comment box, Shift+Enter starts a new line and Enter saves. Pasted lines stay lines. On save each line break is written as `<br>`. Editing your own note shows the breaks as lines again.
- The page and the rail show each `<br>` as a break. Any other HTML in a note is still shown as text.
- `margent comments` prints each further line of a note on its own line, indented to where the text starts.
- Readers accept `<br>`, `<br/>`, `<br />` in any case. Writers write `<br>`.
- A note whose text is empty once its breaks are removed is an error, the same as an empty note.

## Consequences

- The grammar, the one-line guard in `noteSource`, splice and turndown are unchanged. Only display and the comment box's conversions changed.
- A literal `<br>` typed into a note now means a line break, so a note can't show the text `<br>`.
- Agents write `<br>` when a reply needs more than one line.

## Alternatives considered

- **Real line breaks in the source.** Rejected: a note would span lines, so it could no longer sit inside a paragraph line, and the grammar, splice and the agent's grep would all need to handle that.
- **A `\n` escape.** Rejected: notes about code often contain a literal `\n`.
- **One note per line.** Rejected: separate notes read as separate replies.
