---
title: init writes a margent block into the nearest AGENTS.md or CLAUDE.md
status: accepted
updated: 2026-10-27
---

# 0040 init writes a margent block into the nearest AGENTS.md or CLAUDE.md

## Context

The design promised no project setup: agents learn margent from the skill, which loads when they write or edit a doc. That holds only for agents that have the skill. A colleague who clones a project with margent docs, or their agent, sees plain markdown with CriticMarkup threads, `<!-- island -->` markers and an `islands/` folder, and nothing saying what they are. Their agent can delete a thread, resolve one itself (against [0035](0035-agent-replies-human-resolves.md)), reword a cell an island parses, or write a malformed note, and it never runs `check`. The breakage surfaces later, on the doc owner's machine.

The file every coding agent already reads is the project's `AGENTS.md`, or `CLAUDE.md` for Claude Code. In a monorepo that file can sit in a package folder rather than at the root.

## Decision

`margent init {path}` writes a short block, between `<!-- margent:start -->` and `<!-- margent:end -->`, into the nearest instructions file above `{path}`. `margent teardown {path}` removes it. The margent skill runs `init` before the first doc it writes or edits in a repository, and `teardown` when the user asks to remove margent from a project, without asking either time.

- **Which file.** Walk from `{path}` (its folder for a file) up to the git root. The first folder holding `AGENTS.md` or `CLAUDE.md` wins. If it holds both, both get the block, unless `CLAUDE.md` already imports `@AGENTS.md`. If no folder on the walk has one, `init` creates `AGENTS.md` at the git root.
- **Bounds.** Never above the git root, never the home directory, never a global file. Outside a git repository `init` and `teardown` exit 1: the block is for people sharing the repository, and the skill skips it there.
- **Only the block.** `init` replaces the block's inside, or appends it after one blank line, and prints `added`, `updated` or `unchanged` per file. Every byte outside the block is kept, and line endings follow the file. A start with no end, an end with no start, or a second block is a `{file}:{line}` error, and nothing is written.
- **teardown** walks the same folders and removes the block from the nearest folder whose `AGENTS.md` or `CLAUDE.md` holds one, then stops. In a monorepo, removing margent from one package leaves the root block that the other packages read. It deletes a file left with only whitespace. `teardown` after `init` gives back the original bytes of a file that ended in a newline.
- **No version in the block.** It says `npx -y margent check`, so a release never changes a project's `AGENTS.md`.

## Consequences

- A colleague's agent learns the four rules that protect a doc: run `check`, keep comment markup, answer without resolving, keep island markers and parsed wording. The full workflow stays in the skill, which the block points to.
- Projects pick the block up the next time the skill touches a doc, with no sweep over existing repositories. The user sees the change in one line and in `git diff`.
- The design's "no project setup" is now "one marked block, written and removed by margent".
- `check` on a docs folder that holds the block must pass: its comment examples are inside backticks.

## Alternatives considered

- **teardown clears every block up to the git root.** Rejected: in a monorepo, removing margent from one package would strip the root block the other packages rely on.
- **Always the git root.** Rejected: in a monorepo the package's own `AGENTS.md` is the one its agents read, and a root file may belong to another team.
- **The user edits AGENTS.md by hand.** Rejected: every project needs the same text, and nothing would keep it current or remove it.
- **The skill asks before running init.** Rejected by the user: the change is one marked block, visible in `git diff`, and `teardown` reverses it.
- **A version-pinned `npx -y margent@{version}` in the block.** Rejected: every release would rewrite every project's block.
