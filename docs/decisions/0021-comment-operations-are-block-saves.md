---
title: Comment operations are block saves
status: accepted
updated: 2026-10-24
---

# 0021 Comment operations are block saves

## Context

- M3 adds creating, replying to and resolving comments in a served page. Comments are inline CriticMarkup in the markdown ([0005](0005-comments-as-inline-criticmarkup.md)).
- M2 already has one write path: `POST /_save` with `{path, range, hash, text}`. It refuses a stale hash with 409, renders the spliced file and refuses a render error with 422, then writes atomically ([M2 spec R6](../specs/m2-serve-edit.md#r6-saving)).
- The design said the server wraps the selection in the block's source. The selection, though, lives in the browser's DOM, and the browser already holds the file's source and hash.

## Decision

- Each comment operation computes the affected block's new source in the browser and sends it through the existing `POST /_save` as an ordinary block edit. There is no comment endpoint.
- The page state gains `author`. `serve` takes it from `--author {name}`, else from `git config user.name` in the served root. With neither, the page refuses to create or reply to a comment, with a message naming both ways to set it.
- A new comment's ID is `c{n+1}`, where `c{n}` is the highest comment ID in the source the page holds. The hash check guarantees that source is current, so two IDs never collide.

## Consequences

- No new server write path. Comment saves get the stale check, validation, atomic write and live reload for free.
- A comment save that races an agent edit gets 409 and the M2 recovery: the page reloads and the panel holds the block's markdown with the new comment in it.
- The server log shows a comment as an ordinary `saved {path} lines {start}-{end}` line.
- Until the M5 sandbox, an island in the page could write a comment as it can write any edit. This is the same exposure M2 accepted ([0008](0008-island-isolation-sandbox-ready-now-iframe-at-m5.md)).

## Alternatives considered

- **A `/_comment` endpoint that splices on the server.** Rejected: it duplicates the stale check, validation and write, and the server would need its own anchoring logic, far from the DOM selection it anchors.
- **The user types an author name per comment.** Rejected: friction on every comment, for a value git already knows.
