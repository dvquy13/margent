---
title: "`check` runs islands headless at 390px and 1280px and fails on overflow"
status: accepted
updated: 2026-10-24
---

# 0014 `check` runs islands headless at 390px and 1280px and fails on overflow

## Context

The first unbriefed run of R6.2 (the fresh session that adds an island) overflowed at 390px. The session followed the workflow, but nothing checked phone width (spec, Results, "What differed from the spec").

## Decision

`check` fails when an island's content overflows its box at 390px or 1280px. This enforces the contract's rule that an island draws only inside its own box. The skill says that `check` tests both widths.

## Consequences

- The second run passed (spec, Results).

## Alternatives considered

None recorded at the time.
