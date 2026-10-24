---
title: The OS user name signs notes when git has no name
status: accepted
updated: 2026-10-25
---

# 0032 The OS user name signs notes when git has no name

## Context

Decision [0021](0021-comment-operations-are-block-saves.md) signs a new note with `serve --author {name}`, else `git config user.name` in the served root, and with neither the page refuses notes. Once margent is public, a new user who runs `margent serve` on a machine without git config, or on a folder outside any repo setup, can't leave a single comment until they find the flag. The refusal is loud and says how to fix it, but it blocks the first thing a reviewer tries.

## Decision

- After `--author` and `git config user.name`, the OS user name from the environment signs notes: `USER`, else `USERNAME` (Windows), else `LOGNAME`. A name the note grammar can't hold (`:`, `]`, a line break) is skipped like an unusable git name.
- When the OS name is used, `serve` logs it at start with how to change it: `notes are signed "{name}", the OS user name ({why git gave none}); to change it: serve --author {name}, or git config user.name {name}`.
- With none of the three, the page still refuses notes, as in 0021.
- `margent doctor` resolves the author the same way (`src/serve/author.ts`) and prints where the name came from.

## Consequences

- A first `serve` on a fresh machine can comment at once, signed with a name the user recognizes and can change.
- The name comes from the environment, not `os.userInfo()`. Tests set or clear `USER`, `USERNAME` and `LOGNAME`, so expected files never depend on the machine, and the refusal path stays testable.
- A login name like `jdoe` is less readable than a full git name. The startup line says how to set a better one.

## Alternatives considered

- A fixed default such as "Owner". Rejected: every new user's notes would carry the same name, so two reviewers' notes in one file couldn't be told apart.
- `os.userInfo().username`. Rejected: it can't be overridden by the environment, so tests could not pin the name or reach the refusal path.
