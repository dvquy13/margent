---
title: No island catalog, M4 is cut
status: accepted
supersedes: 0002
updated: 2026-10-25
---

# 0034 No island catalog, M4 is cut

## Context

Decision 0002 made islands bespoke and promoted them to a shared `catalog/` on second use, built in M4. Nothing in the code, the skills or the CLI depends on it: M1 to M5 and the 0.2.0 release shipped without it. Island lookup has one tier, the nearest `islands/` folder up to the docs root.

## Decision

Cut M4. Islands stay bespoke and project-local. There is no `catalog/` folder, no promotion step, no schema-plus-fixture requirement and no catalog lookup tier. The bespoke half of 0002 stands.

## Consequences

- A second project that wants an island copies the module, and its agent pays the design cost again. The cost is accepted until a second project exists.
- The "starter islands" shipped with the package are gone from the design. A new user's first doc has the renderer but no ready-made visuals.
- Island quality control is `margent check` alone (render errors and overflow at 390px and 1280px, [0014](0014-check-tests-overflow-at-two-widths.md)). There is no screenshot test per island.
- Island lookup keeps its single tier, so no name-clash rule is needed.
- To reopen this, write a new record that supersedes this one.

## Alternatives considered

- **Defer M4 instead of cutting it.** Rejected: the plan and the design would keep promising a feature with no owner or trigger.
- **Ship a few starter islands without promotion.** Rejected: it adds a lookup tier and a name-clash rule for no demonstrated use.
