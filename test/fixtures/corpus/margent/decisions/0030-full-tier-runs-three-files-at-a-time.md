---
title: The full tier runs three test files at a time
status: accepted
updated: 2026-10-25
---

# 0030 The full tier runs three test files at a time

## Context

`npm run test:full` ([0027](0027-two-test-tiers-and-frozen-corpora.md)) ran with `node --test`'s default concurrency, which is one less than the core count: 7 files at once on this 8-core machine. Most full-tier files launch their own Chrome, and several tests have wall-clock limits (the 10s island report wait in `check`, the A7 and A8/A9 timing checks). On 2026-10-25 a default run took 539s, the load average passed 30, and `check: a pattern mismatch (A5)` printed nothing within its wait; the file passed alone. The suite's own Chromes were enough to push its timing checks past their limits.

## Decision

`test:full` passes `--test-concurrency=3`. The fast tier keeps the default.

## Consequences

- Three full runs at concurrency 3, back to back on 2026-10-25: 335s, 417s and 431s, peak load 21 to 25, 575 pass and 0 fail each time. Against one default run of 539s with 1 flake: faster, because fewer Chromes compete for the cores. The comparison rests on one default run.
- The total is still set by the longest files (the A3 gate runs and the A2 margent walk, 190 to 270s each), so a lower concurrency would cost time without a known gain.
- Other heavy work on the machine still slows the run. Judge a failure by rerunning its file alone, as before.

## Alternatives considered

- Raising the wall-clock limits. Rejected: it hides real slowness in `check`, and the flakes came from the suite's own load.
- Sharing one Chrome per file, or sampling fewer blocks in the A3 gate. Not needed for stability; worth profiling if the full tier's time becomes the problem.
