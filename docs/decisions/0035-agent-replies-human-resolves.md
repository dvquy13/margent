---
title: The agent replies to every comment and only the user resolves
status: accepted
updated: 2026-10-25
---

# 0035 The agent replies to every comment and only the user resolves

## Context

When a comment asked for a change the agent could make exactly as asked, the skill told it to make the change and delete the thread. After a round the user saw threads vanish with no clue what changed in the doc. Resolve already deletes a thread from the source ([0021](0021-comment-operations-are-block-saves.md)), so a resolved thread is gone by design.

## Decision

The agent never deletes a thread. For every thread that needs it, it appends a `Claude` note with the same ID: one line saying what changed and where, or its answer, question or disagreement. The thread stays open and `margent comments` reports it as `needs you`. The user reads the note and clicks Resolve. This is a skill-only change (`skills/margent/SKILL.md`, `skills/docs-review/SKILL.md`); the code is untouched.

## Consequences

- The reply is the only record of what the agent did. It is a claim by the agent, not a diff of the doc.
- Every handled comment costs the user one click to resolve. Rounds with many trivial comments get noisier.
- Resolved threads are still not kept anywhere, and a mistaken Resolve has no undo or reopen. Out of scope: the user can ask the agent to restore the thread, or recover it from git. An undo toast (re-saving the block's earlier source) is the cheap fix if it ever hurts.

## Alternatives considered

- **Highlight the agent's changes in the page, from a baseline of the source at the round's start.** Deferred: block-level highlighting is a feature of its own (serve state, a diff, a toggle). Revisit if replies prove too weak to review a round.
- **Keep resolved threads in the markdown or a sidecar log.** Rejected for now: it clutters the source or adds a file for history nobody has asked to read.
- **Agent edits as CriticMarkup suggestions.** Rejected: it needs a new render and edit model.
