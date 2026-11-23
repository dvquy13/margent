---
title: "`update` reads latest from the version list and proves each install moved"
status: accepted
updated: 2026-11-23
amends: 0042
---

# 0050 `update` reads latest from the version list and proves each install moved

## Context

- A user's `margent update` reported success twice when nothing had changed (2026-11-23):
  - **A pinned marketplace.** The user had added the plugin's marketplace as `dvquy13/margent@v0.11.0`. `claude plugin marketplace update` fetches that tag again, and `claude plugin update` then says "already at the latest version" and exits 0. `update` printed `plugin: 0.11.0 → 0.12.1` and "start a new session", and the plugin was still 0.11.0.
  - **A stale `latest` tag.** The user's npm reads from a company Artifactory mirror. It listed 0.12.2, but its `latest` tag still named 0.12.1. `npm view margent version` reads the tag, so `update` called the 0.12.1 CLI `ok` and never updated it. The only sign was `ok plugin: 0.12.2` next to `latest: 0.12.1`. The plugin comes from GitHub, not npm.
- [0042](0042-update-command-updates-every-install.md) trusted exit codes and the `latest` tag. Both cases break its rule that a failure is loud.

## Decision

This replaces two parts of 0042: where latest comes from, and what counts as a successful update.

- **Latest is the highest `x.y.z` in `npm view margent versions --json`**, not the `latest` tag. Prereleases are left out, and a list with no `x.y.z` fails as `fail latest: …`. The CLI is still updated to that exact version, which a mirror serves even when its tag is stale.
- **Each updated channel is read again** after its commands exit 0. If it reached latest, `update` prints `updated {channel}: {version}`. If it is still behind, it prints `fail {channel}: still {version} after the update` and exits 1, and that channel doesn't count toward the new-session line.
- **A marketplace pinned to a ref** (`ref` in `claude plugin marketplace list --json`) adds a `note:` line under the plugin's commands, with the commands that re-add it unpinned. The same note ends the `still … after the update` line. A pin is the user's choice, so `update` never removes it. The update still runs, since a ref can be a branch that moves.
- An install newer than latest is `ok` and says `(newer than {latest} on the npm registry)`. This means the registry hasn't caught up yet.

## Consequences

- Every success line in the output has been checked. A command that changes nothing can't end in "start a new session".
- Each update costs one more detection per channel: `npm ls -g` for the CLI, `claude plugin list` and `marketplace list` for the plugin, and a file read for the skills.
- A version published by mistake that is still listed is chosen over the tag. margent doesn't move `latest` back to undo a release. It would deprecate the version or publish a fix, and either way the highest version stays the one to install.
- `npx -y margent@latest update` (README) still resolves `@latest` through the user's registry, so on a stale mirror it runs an older margent. That margent reads the version list only if it is a release with this change.

## Alternatives considered

- **Fail at once when the marketplace has a `ref`.** Rejected: a ref can be a branch, which updates normally. The check after the update catches a ref that doesn't move, and the note says why.
- **Remove the pin and re-add the marketplace automatically.** Rejected: it overrides a choice the user made.
- **Keep the `latest` tag and only warn when an install is newer than it.** Rejected: on a mirror with a stale tag, a machine with only the CLI shows nothing at all.
