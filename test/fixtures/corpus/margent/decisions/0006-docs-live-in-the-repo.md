---
title: Docs live in the repo, opened locally
status: accepted
updated: 2026-10-23
---

# 0006 Docs live in the repo, opened locally

## Context

Design §11 asks where docs should be hosted. The design records no spike evidence for this choice.

## Decision

Docs live in the project's git repo and are opened locally. Renders never go into the repo ([0012](0012-open-renders-into-user-cache.md)).

## Consequences

- The repo is the single source of truth for each doc.

## Alternatives considered

- **Claude Docs or artifacts.** Rejected: they are off-repo, so they are not a single source of truth.
- **Plannotator.** Skipped by choice.
