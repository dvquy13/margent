---
title: M2 is done when a scripted edit corpus passes in real Chrome
status: accepted
updated: 2026-10-25
---

# 0018 M2 is done when a scripted edit corpus passes in real Chrome

## Context

The design said M2 was done when "a week of your edits to the first user's docs produces no unintended diff". That can only be judged a week after implementation, and how carefully it is judged depends on reviewing git diffs by hand. The user asked for a definition of done that can be verified right after implementation.

## Decision

M2 is done when a scripted edit corpus passes: at least 40 edits on copies of at least 5 docs from a real docs tree, driven by Playwright keyboard and mouse input in installed Chrome, each with a hand-written expected file. Every edit must give its expected file byte for byte, with no byte outside the edited range changed. A no-op walk (focus and blur every editable block without typing) must write nothing. The full list is in [the M2 spec](../specs/m2-serve-edit.md#r10-edit-corpus).

## Consequences

- M2 closes when its tests pass, with no waiting period.
- Real browser input covers what S2's jsdom simulation could not: wrapper `<div>`s, `<br>`s, paste and undo.
- The corpus covers the edits someone thought of. Edits nobody scripted are caught only in use, so each bug found later becomes a new corpus case.

## Alternatives considered

- **A calendar week of real use, reviewed in git.** Rejected: it can't be verified at implementation time.
- **A save journal plus a count of real saves.** Rejected for the same reason.
