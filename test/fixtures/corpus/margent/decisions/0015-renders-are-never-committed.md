---
title: Renders are never committed to the repo
status: accepted
updated: 2026-10-25
---

# 0015 Renders are never committed to the repo

## Context

Design §11 asks where renders should live, in git or in build outputs. Design §07 says renders never land in the repo. They exist in memory or in a cache and are regenerated on every change. This retires the first user's provenance hashes, the stale-render check and the rule against editing HTML, because there is nothing to keep in sync by hand. The design records no spike evidence for this choice.

## Decision

Renders are never committed. They live in memory under `serve`, in a cache for `open`, and wherever the author chooses for `export`. Islands are inlined, so exported files open from disk.

## Consequences

- No provenance hashes, stale-render check or hand-editing rule is needed, because nothing in the repo can drift from its source.
- `open` renders into the user cache ([0012](0012-open-renders-into-user-cache.md)).

## Alternatives considered

- **Committed renders with provenance hashes.** Rejected: the sync problem this design removes.
