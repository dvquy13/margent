---
title: Folder walks skip gitignored files
status: accepted
updated: 2026-10-25
---

# 0029 Folder walks skip gitignored files

## Context

`check`, `export`, `comments` and the `serve` index walk every `.md` under a folder, skipping only `node_modules` and dot-folders. One file that fails to render fails the whole run, and `export` then writes nothing. Repos often hold markdown that isn't theirs: vendored copies of other repos (`docs/ext/`), test data, eval outputs. A survey of 30 local repos on 2026-10-25 found 8 where `margent check .` failed, and in 5 of them the failing file was gitignored. In one repo, an invalid frontmatter line in a vendored `docs/ext/` file blocked `check`, `export` and `comments` on every folder above it.

## Decision

`markdownUnder` asks git once per walk (`git ls-files --others --ignored --exclude-standard --directory`) and skips every file and folder it lists, so a walk covers what git would show as the repo's own files.

- A tracked file that matches an ignore pattern is still walked: `--others` lists only untracked files.
- A folder the user names that is itself ignored (`margent check docs/ext`) is walked in full, because naming it is an explicit request.
- Outside a git repository, or without a `git` binary, there is nothing to honor and the walk covers every file as before. Any other git failure stops the command with git's message.
- A doc reached by following a link, or named as a file, is rendered whether or not git ignores it.

## Consequences

- In one repo, `check .` went from exit 1 to `ok 15 docs`, skipping `docs/ext/` and the gitignored skill-eval outputs.
- Errors in a repo's own tracked or untracked-but-not-ignored docs still fail loudly. The two such files the survey found (a draft with invalid frontmatter and a copy missing its island module) still fail.
- Each folder walk runs two git commands, a few milliseconds each.

## Alternatives considered

- An ignore option or a `.margentignore` file. Rejected for now: `.gitignore` already says which files aren't the repo's own, in every repo surveyed, and a second list would drift from it.
- Skipping a file that fails to render and warning. Rejected: a silent fallback, against the rule that every error path is loud.
- `git ls-files --cached --others --exclude-standard` as the list of files to walk. Rejected: it doesn't list files inside submodules, so docs there would vanish.
