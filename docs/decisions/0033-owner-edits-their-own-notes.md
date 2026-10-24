---
title: The owner edits their own notes from the page
status: accepted
updated: 2026-10-25
---

# 0033 The owner edits their own notes from the page

## Context

M3 made notes write-once in the page: spec R7.2 says notes are not editable, so fixing a typo in your own comment meant opening the `.md`. margent's reviews have one owner working with an agent. The owner is the name `serve` signs new notes with ([0021](0021-comment-operations-are-block-saves.md), [0032](0032-os-user-name-signs-notes-without-git.md)), and the agent signs its replies with its own name.

## Decision

- A note signed with the page's author (`state.author`, compared exactly) shows an `Edit` control in its rail card. Other notes don't, and with no author no note does.
- Edit opens the comment box with the note's text. For a quoted first note of a block comment line, only the body after `"phrase" →` is in the box, and the quote is kept. Saving unchanged text closes the box without a save; empty text is refused in the box.
- The save is an ordinary block save, like reply and resolve: `replaceNote(block, id, index, text)` in `src/comments/syntax.ts` rewrites one note's text through `noteSource` and leaves every other byte of the block alone. Notes in a thread share its id, so a note is addressed by the id and its position among that id's notes in the block.
- The note keeps its author, and nothing marks it as edited. Git history shows the change.
- This amends M3 R7.2 for the owner's own notes. Highlighted text stays editable in place as before.

## Consequences

- The owner can fix their own wording without leaving the page, and the agent's notes can't be reworded under its name from the page.
- The one-owner assumption is load-bearing: two people serving the same docs under the same name could edit each other's notes. Anyone can still edit any note in the `.md` itself.
- Edit gets the same stale check, validation, atomic write and live reload as every other comment save.

## Alternatives considered

- Any note editable, as resolve works on any thread. Rejected: it lets the owner put words in the agent's mouth.
- An "(edited)" marker in the note grammar. Rejected: every reader of the grammar (render, `comments`, `export --clean`, the skill) would need to learn it, for information git already has.
- Per-note ids. Rejected: replies share their thread's id by design (R1.5), and position within the block is enough for a block save, which the hash check keeps current.
