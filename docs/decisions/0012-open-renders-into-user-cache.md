---
title: "`open` renders into the user cache, never the repo"
status: accepted
updated: 2026-10-23
---

# 0012 `open` renders into the user cache, never the repo

## Context

The M1 spec's question of where `open` writes its renders. Design §07 says renders never land in the repo. The wider rule is in [0015](0015-renders-are-never-committed.md).

## Decision

`open` writes renders to `$XDG_CACHE_HOME/agent-docs/{sha1 of the docs root path}/`. The default is `~/.cache/agent-docs/`.

## Consequences

- Renders never land in the repo (design §07).
- `check` renders in memory and writes nothing. `export` writes to the folder you name, and its output opens from `file://` (spec R4, design §11).

## Alternatives considered

- None recorded at the time for the cache path.
