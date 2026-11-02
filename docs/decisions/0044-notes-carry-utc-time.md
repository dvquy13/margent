---
title: A note carries the UTC minute it was written
status: accepted
updated: 2026-11-02
---

# 0044 A note carries the UTC minute it was written

## Context

Rail cards say who wrote each note, never when. In a review that runs over days, or a back-and-forth with an agent, a reader can't tell a stale thread from a fresh one. The markdown is the only copy ([0015](0015-renders-are-never-committed.md)), so a time has to live in the note itself or be derived from something else.

## Decision

- **Format.** `{>>[c1 2026-11-02T14:31Z] Quy: text<<}`: an optional time after the ID, inside the brackets, since an author can't hold `:`. UTC, to the minute, `Z` required. A note without a time stays valid.
- **Who writes it.** The served page stamps new notes and replies with the browser's clock. Editing a note keeps its time. Agents add it to their replies from `date -u +%Y-%m-%dT%H:%MZ`; the skill and the init block say how.
- **`check`** rejects a time that isn't a real UTC minute, at its line.
- **Display.** The rendered note carries `<time datetime>` with the UTC text, which is what print and no-JS readers see. The rail shows a relative time beside the author, with the full local time on hover.

## Consequences

- A note's source grows by 18 characters.
- Agent replies without a time stay valid and show no time.
- Times come from whoever wrote the note, so a wrong clock writes a wrong time. Nothing checks it.

## Alternatives considered

- **`git blame`.** Rejected: one time per line, and a paragraph's whole thread sits on one line; uncommitted notes have none; `open` and `export` would need git.
- **A sidecar file keyed by thread ID.** Rejected: the markdown stops being the only copy, and the two drift when a doc is copied or a thread resolved.
- **The server stamps notes it didn't write.** Rejected: it would rewrite files agents edit.
