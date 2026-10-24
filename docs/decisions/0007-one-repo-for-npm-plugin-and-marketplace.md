---
title: One repo is the npm package, the plugin and the marketplace
status: superseded
superseded_by: 0024
updated: 2026-10-24
---

# 0007 One repo is the npm package, the plugin and the marketplace

## Context

Design §11 asks how the tool is installed. The design records no spike evidence for this choice.

## Decision

One repo is the npm package, the Claude Code plugin and its own marketplace. One command installs it, and the CLI is bundled inside the plugin. The bundled file is `dist/cli.js` ([0009](0009-typescript-cli-bundled-into-one-file.md)).

## Consequences

- Install is one command from the local path (spec R5.2, A13).
- A local-path plugin install runs from a cached copy. Edits in the repo do not reach new sessions, and `claude plugin update` reports nothing to do at the same version. Reinstalling refreshes the copy (spec, Results).
- The npm publish and the public marketplace come in M5 (spec scope).

## Alternatives considered

- **`curl | sh` installer.** Rejected: it hides what runs.
- **MCP server.** Rejected: the CLI and a skill cover it.
- **Installers for every agent.** Not chosen now. Claude Code comes first, and other agents get the SKILL.md later.
