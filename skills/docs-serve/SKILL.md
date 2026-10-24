---
name: docs-serve
description: Serve a docs folder with margent so the user can review and edit pages in the browser
argument-hint: <docs root>
# x-release-please-start-version
allowed-tools: Bash(margent serve:*), Bash(npx -y margent@0.1.1 serve:*), Bash(margent --version)
disable-model-invocation: true
---

Run `margent --version` first. If it prints `0.1.1`, use `margent` as written below;
otherwise replace `margent` with `npx -y margent@0.1.1` in every command.
<!-- x-release-please-end -->

Run `margent serve $ARGUMENTS --no-open` with the Bash tool in the background (`run_in_background: true`). It runs until stopped.

- Read its output until the line `margent serving {root} at {url}` appears, then report the URL in one line. The URL carries the session token, so give it in full.
- If it exits instead, show every line it printed, verbatim, including any `file:line: message`. Do not retry on another port unless the user asks.
- While it runs, the user may edit any served doc in the page. Read a `.md` again before editing it.
