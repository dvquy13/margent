---
title: Bespoke islands, promoted to a catalog on second use
status: accepted
updated: 2026-10-23
---

# 0002 Bespoke islands, promoted to a catalog on second use

## Context

Design §11 asks how much freedom island designs get against reuse. The design records no spike evidence for this choice.

## Decision

Islands start bespoke. An island is promoted to the shared catalog on its second use. The catalog and promotion are built in M4 (spec scope).

## Consequences

- Each island has a schema and a fixture (design §12, "Island quality drifts").
- Catalog islands get a screenshot test (design §12).

## Alternatives considered

- **Fixed component kit only.** Rejected: it loses the fresh visuals the author values.
- **Typed catalog from day one.** Rejected: same problem, earlier.
