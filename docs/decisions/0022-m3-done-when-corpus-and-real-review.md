---
title: M3 is done when a comment corpus passes and a real review is handled
status: accepted
updated: 2026-10-25
---

# 0022 M3 is done when a comment corpus passes and a real review is handled

## Context

- The design's done-when for M3 is that the agent resolves or answers every comment on a real review.
- For M2, [0018](0018-m2-done-when-scripted-edit-corpus.md) chose a scripted corpus alone, so M2 could close right after implementation.
- A script can prove that creating, replying and resolving write the right bytes. It cannot prove that the agent's choices are sensible on real feedback, which is the point of comments.

## Decision

M3 is done when both of these pass.

- **Comment corpus:** at least 25 scripted cases in installed Chrome, driven by keyboard and mouse only, each checked byte for byte against a hand-written expected file.
- **One real review:** the user leaves at least 10 real comments on a copy of one of the first user's docs in the served page. A `/docs-review` session then handles all of them. Afterwards every thread is either gone, with its change visible in the diff, or answered with an agent reply. The run is recorded in the pre-public archive.

## Consequences

- Closing M3 needs about 30 minutes of the user's time, after implementation.
- The real review checks the agent contract and the `comments` command end to end, on feedback nobody wrote for a test.
- The first user's doc is a copy, so the original is never written.

## Alternatives considered

- **Scripted only, with seeded comments.** Rejected: seeded comments test the bytes, not whether the agent's judgments hold up on real feedback.
- **A week of real use with counts.** Rejected: slow to close, and the counts mostly measure how much reviewing happened that week.
