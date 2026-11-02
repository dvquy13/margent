---
title: The skill asks which file gets the margent block, CLAUDE.local.md included
status: accepted
updated: 2026-11-02
amends: 0040
---

# 0043 The skill asks which file gets the margent block, CLAUDE.local.md included

## Context

[0040](0040-init-writes-nearest-agents-file.md) has `init` write its block into the nearest shared `AGENTS.md` or `CLAUDE.md`, and the skill run it without asking. That suits a project the team runs margent in. It doesn't suit a user who reviews docs with margent in a repository the team shares but hasn't adopted it in: the first doc they edit changes a file every colleague reads. Claude Code also reads `CLAUDE.local.md`, a personal file kept out of git, which no rule of 0040 can reach.

## Decision

This replaces 0040's "the skill runs init without asking" and its choice of file. The bounds, the block format and teardown's walk stay.

- **The skill asks once per repository.** Before the first doc it touches, it runs `margent init {path} --dry-run`. When a block already exists on the walk, it runs `init`, which updates that block where it is, and asks nothing. Otherwise it asks the user which file gets the block: the one 0040's rule picks (recommended, so colleagues' agents learn the rules), `CLAUDE.local.md` (only this user, and only Claude Code reads it), or another `AGENTS.md` or `CLAUDE.md` on the walk. There is no "skip": `CLAUDE.local.md` is the choice that changes nothing shared.
- **`--into {file}`** writes the chosen file. Its name must be `AGENTS.md`, `CLAUDE.md` or `CLAUDE.local.md`, in a folder from `{path}` up to the git root. A block in another file on the walk is an error that names it and says to run `teardown` first.
- **An existing block wins.** Plain `init` finds the nearest folder on the walk whose files hold a block and updates those files, before 0040's rule. Choosing once is enough, and no setting is stored.
- **`CLAUDE.local.md` stays out of git.** When git doesn't already ignore it, `init` adds it to the repository's `info/exclude`, which is never shared, and says so. `teardown` that deletes the emptied file removes that line.

## Consequences

- No margent rule changes a shared file without the user's say.
- A local block reaches only Claude Code. Colleagues' agents see no block, which is what the user chose.
- The CLI never prompts: agents run it, so the question belongs to the skill.

## Alternatives considered

- **A "skip" answer.** Rejected: it has to be remembered somewhere, or the skill asks every session.
- **A user setting for the default file.** Rejected: once a block exists, `init` follows it, so the per-repository choice already sticks.
- **Add `CLAUDE.local.md` to `.gitignore`.** Rejected: that changes a shared file, which is what the local choice avoids.
