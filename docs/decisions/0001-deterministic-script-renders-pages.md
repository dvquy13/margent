---
title: A deterministic script renders pages; the LLM designs only islands
status: accepted
updated: 2026-10-23
---

# 0001 A deterministic script renders pages; the LLM designs only islands

## Context

Design §11 asks who writes the HTML for a doc. The one rejected option is an LLM that renders the page on each change. The design cites S0 for the double edits and drift that this approach causes.

## Decision

A deterministic script renders every page. The LLM designs islands, never whole pages. Islands are described in [0002](0002-bespoke-islands-promoted-on-second-use.md) and [0003](0003-island-data-in-markdown-tables.md).

## Consequences

- The same inputs give the same bytes (spec R1.6, check A3).
- Changing a doc means changing its `.md` only, which ends the double edit.
- Changing a verdict cell in the `.md` updates the island on the next `open`, with no LLM call (spec A4).

## Alternatives considered

- **LLM renders on each change.** Rejected: double edits and drift (S0).
