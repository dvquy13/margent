---
title: "`margent update` finds every install and updates it"
status: accepted
updated: 2026-10-27
---

# 0042 `margent update` finds every install and updates it

## Context

- margent ships through three channels ([0024](0024-margent-name-and-distribution.md)): the CLI on npm, skills for any agent through `npx skills`, and a Claude Code plugin. Each has its own updater, and each skill names the CLI version it was written for, so they should move together.
- A user who doesn't remember how margent was installed had to run three checks and up to four commands (README "Update").

## Decision

- `margent update` finds each install, reads the latest version from npm (`npm view margent version`), and updates every install that is behind, at once, without asking: typing `update` is the consent. Each step prints `{channel}: {current} → {latest}` and the command it runs.
- `margent update --check` prints the same report and changes nothing.
- The installs it finds:
  - **CLI:** `npm ls -g margent --json`. Updated with `npm i -g margent@{latest}`.
  - **Claude Code plugin:** `margent@margent` in `claude plugin list --json`. Updated with `claude plugin marketplace update margent`, then `claude plugin update margent@margent`.
  - **Skills from `npx skills`:** entries whose source is `dvquy13/margent` in the skills lock file, global and in the current project. Their version is the CLI version the installed `margent` skill names. Updated with `npx -y skills update {margent's skills} -y`, global or project.
- A development install is never touched: a CLI that is a link to a folder (`npm link`), or a plugin whose marketplace is a local folder. It prints `skipped {channel}: …` with the folder.
- A tool that isn't on PATH (`claude`, `npx`) means that channel isn't installed. A command that fails, or a tool whose output can't be read, prints the command and the error and makes the exit code 1. The other channels still run.
- After a plugin or skills update, it says to start a new agent session, since agents read skills at session start.
- The CLI is updated to the exact version `npm view` printed, so every channel lands on one version.

## Consequences

- One command, the same for a person and an agent, whatever the install mix.
- Installs older than this command lack it. The README says `npx -y margent@latest update`, which runs the newest margent whatever is installed, and keeps the manual commands.
- margent now runs other tools that change the machine (npm, the Claude CLI, the skills CLI), and it depends on the output formats of `claude plugin list --json` and the skills lock file. A format change shows up as a loud failure for that channel, not a skipped update.

## Alternatives considered

- **`doctor` reports outdated installs and prints the commands.** Rejected as the only fix: the user still runs each command by hand. `update --check` gives the report.
- **Ask before updating, with `--yes` to skip.** Rejected: an agent that forgets `--yes` hangs on the prompt, and the user already asked for the update.
- **Recommend one channel only (the plugin, with the CLI through `npx`).** Doesn't help machines that already have several installs.
