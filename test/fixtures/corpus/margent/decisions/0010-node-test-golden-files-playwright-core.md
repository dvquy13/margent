---
title: "node:test, golden files and playwright-core on installed Chrome"
status: accepted
updated: 2026-10-23
---

# 0010 node:test, golden files and playwright-core on installed Chrome

## Context

The M1 spec's test question. The spec's rationale: there is no test framework to install, and S4's Playwright checks port directly.

## Decision

Unit tests use `node:test`. Renders are checked against golden files. Pages are driven by `playwright-core` on the installed Chrome.

## Consequences

- No test framework needs to be installed.
- S4's Playwright checks port directly to M1.
- `check` runs islands headless in Chrome. A cold first run spends its time launching Chrome (2.09s), and warm runs take 1.08 to 1.22s, inside the 2-second budget (spec A14).

## Alternatives considered

None recorded at the time.
