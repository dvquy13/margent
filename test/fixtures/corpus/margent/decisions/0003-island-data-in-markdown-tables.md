---
title: Island data in markdown tables, YAML when nested
status: accepted
updated: 2026-10-23
---

# 0003 Island data in markdown tables, YAML when nested

## Context

Design §11 asks how island data should be written, with readability as the concern. S3 needed only one marker line on the original table for all three islands. S1 found JSON blocks cryptic and about 2x the size of the input.

## Decision

Island data goes in markdown tables first, and in YAML when the data is nested. Only primary facts go in the data.

## Consequences

- Table-backed islands read their structure from cell text (S3). Rewording a cell can change what the visual shows. Declared column patterns catch this: the island shows a warning badge, and `check` fails with `{file}:{line}` (spec R3.1, A5).
- The YAML form has no spike behind it. M1 covers its parsing with a fixture. A real nested visual waits for the first doc that needs one (see the Deferred table in [the index](README.md)).

## Alternatives considered

- **JSON blocks.** Rejected: S1 showed them cryptic and about 2x the size of the input.
