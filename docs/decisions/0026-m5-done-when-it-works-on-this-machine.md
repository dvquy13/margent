---
title: M5 is done when it works on this machine, including a local install
status: accepted
updated: 2026-10-24
---

# 0026 M5 is done when it works on this machine, including a local install

## Context

The design's M5 row ends with "someone else installs it from one sentence to their agent and opens a doc." That needs either a second person's time or a clean-room run against the published package, and the package is published only at the end of M5.

## Decision

M5 is done when its acceptance checks pass on this machine. That includes installing from the `npm pack` tarball into a temporary prefix, `npx skills add` into a temporary HOME, and a headless agent session opening a doc whose island draws in its frame. A fresh install by someone else, from one sentence, comes later and is not an M5 gate.

## Consequences

- M5 can close before `npm publish`, and the release is the user's step right after it.
- Problems only a fresh machine shows (another OS, no Chrome, a different agent) surface after release.

## Alternatives considered

- **A clean-room run with a fresh Claude Code and Codex after publishing.** Not chosen now: it waits on the release and costs more than the user wants for M5.
- **A real second person.** Not chosen now: it depends on their time.
