---
title: Comments as inline CriticMarkup
status: accepted
updated: 2026-10-23
---

# 0005 Comments as inline CriticMarkup

## Context

Design §11 asks where comments are stored, with agent visibility as the concern. The design records no spike evidence for this choice.

## Decision

Comments are inline CriticMarkup, each with an ID.

## Consequences

- Comment markup inside a paragraph must survive turndown. If it does not, the round-trip gate sends that block to the edit panel (design §12). Comment cases go into the S2 corpus.
- Fallback: blocks with comments always edit in the panel (design §12).

## Alternatives considered

- **Sidecar file with text anchors.** Rejected: the agent needs a special read, and anchors drift. Its one advantage is cleaner markdown.
