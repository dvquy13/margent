---
name: docs-open
description: Render a markdown doc with margent and open it in the browser
argument-hint: <file.md>
# x-release-please-start-version
allowed-tools: Bash(margent open:*), Bash(npx -y margent@0.6.0 open:*), Bash(margent --version)
disable-model-invocation: true
---

Run `margent --version` first. If it prints `0.6.0`, use `margent` as written below;
otherwise replace `margent` with `npx -y margent@0.6.0` in every command.
<!-- x-release-please-end -->

Run `margent open $ARGUMENTS` with the Bash tool.

- On success, report the page path it printed, in one line.
- On failure, show every `file:line: message` line it printed, verbatim, and offer to fix the source. Do not retry with different arguments unless the user asks.
