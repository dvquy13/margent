---
title: Rename to margent, ship the CLI on npm and the skills to any agent
status: accepted
updated: 2026-10-25
supersedes: 0007
---

# 0024 Rename to margent, ship the CLI on npm and the skills to any agent

## Context

- The CLI is only on PATH inside Claude Code. The plugin's `bin/` is added to the Bash tool's PATH and nowhere else, and the installed copy sits in a versioned folder (`~/.claude/plugins/cache/agent-docs/agent-docs/0.1.0/`), so a user's shell can't point at it.
- claude.ai and Cowork refuse plugins that have a `bin/`, so the plugin as built can't reach them.
- The common pattern (Lavish, agent-browser, beads) publishes the CLI on npm and has the skill call it, with `npx -y` as the no-install path.
- `npx skills add` (vercel-labs/skills) installs a repo's `skills/` into Claude Code, Codex, Cursor, Copilot, Gemini CLI, OpenCode and about 75 more agents. Slash commands in `commands/` are a Claude Code feature it doesn't carry.
- The name `agent-docs` is taken on npm (an unrelated package at v1.4.0). `margent` is free.

## Decision

- **Name:** `margent` everywhere: the npm package, the plugin, the marketplace, the CLI command, the main skill, internal identifiers (`window.margent`, `MargentKit`, `margent-*` ids and attributes, `margent_*` markdown-it rules), the `MARGENT_CHROME` env var, the `margent:` error prefix, and the diagram class `mg-d` (was `ad-d`). No alias for any old name. History keeps `agent-docs`: the old decision records and git history are not renamed, and this record links the two names.
- **Three channels over one repo:**
  - npm carries the CLI: `npm i -g margent`, `bin: margent` pointing at the bundled `dist/cli.js`, no runtime dependencies. `dist/cli.js` is built by `prepack` and no longer committed.
  - `npx skills add {owner}/margent` carries the skills to any agent.
  - A thin Claude Code plugin (`.claude-plugin/plugin.json` and `marketplace.json`) over the same `skills/`, with no `bin/` and no hooks.
- **Commands become skills:** `docs-open`, `docs-serve` and `docs-review` move from `commands/` to `skills/{name}/SKILL.md` with `disable-model-invocation: true`, so they stay user-invoked and travel with `npx skills add`. Through the plugin they are `/margent:docs-open` and so on.
- **The read-guard hook is dropped.** The skill already says never to read a rendered `.html`, and hooks don't travel to other agents.
- **Version pin:** the skills name one CLI version. They run `margent --version`; if it prints the pinned version they call `margent …`, otherwise `npx -y margent@{version} …`. `allowed-tools` lists both forms. A test fails `npm test` when `package.json`, `plugin.json` and every `margent@{x}` in `skills/` don't carry the same version, so a release can't ship skills that call a different CLI.

## Consequences

- Any shell, editor or agent can run `margent` after one global install, and an agent with no install still works through `npx`, at the cost of a cold start on its first call.
- The plugin is installable on claude.ai and Cowork, since it holds only skills.
- Island modules written against `AgentDocsKit` or `window.agentDocs` break. A search found none outside this repo.
- Without the hook, nothing blocks an agent from reading a rendered `.html`. The skill's rule is the only guard.
- Every release bumps the version in three kinds of file at once, and the sync test enforces it.
- `npm publish` and the GitHub repo become the release path, both the user's actions.

## Alternatives considered

- **A plugin-only `/docs-install-cli` that writes a shim into `~/.local/bin`.** Rejected: it serves Claude Code users only, and no other tool distributes this way.
- **A SessionStart hook that writes the shim without asking.** Rejected: it writes outside the plugin without consent.
- **The npm package is the plugin (Lavish).** `margent setup {agent}` subcommands install the skills per agent. Rejected: one installer per agent is more code to keep up than `npx skills add`, which already covers 80 agents.
- **Keep the name `agent-docs` on npm under a scope.** Rejected: the unscoped name is taken, a scoped CLI is clumsy to type with `npx`, and the generic name collides with other projects.
