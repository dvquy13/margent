---
title: Docs root is the nearest ancestor containing islands/
status: accepted
updated: 2026-10-23
---

# 0013 Docs root is the nearest ancestor containing islands/

## Context

The M1 spec's docs root question. The design asks for zero config (design §10).

## Decision

The docs root is the nearest ancestor of the file that contains an `islands/` folder. If there is none, the docs root is the file's own folder.

## Consequences

- Island lookup walks up from the doc's folder to the docs root and uses the first `islands/{name}.island.js` it finds. Two candidates at the same level are an error (spec R3.5).
- Island lookup and relative links both stop at the docs root (spec, "Docs root").

## Alternatives considered

None recorded at the time.
