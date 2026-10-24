---
title: markdown-it with GFM tables and markdown-it-front-matter
status: accepted
updated: 2026-10-23
---

# 0011 markdown-it with GFM tables and markdown-it-front-matter

## Context

The M1 spec's markdown parser question. markdown-it provides block source maps (S2), and S4's renderer already uses it.

## Decision

The parser is markdown-it with GFM tables and `markdown-it-front-matter`. The spec also allows stripping the frontmatter and reattaching it, as S2 did.

## Consequences

- Block source maps give each top-level block a `data-src` line range (spec R1.3). M2 depends on these.

## Alternatives considered

None recorded at the time.
