---
title: Islands run only in a sandboxed frame, pages carry a script policy, and there is no folder trust
status: accepted
updated: 2026-10-24
supersedes: 0008
---

# 0025 Islands run only in a sandboxed frame, pages carry a script policy, and there is no folder trust

## Context

- [0008](0008-island-isolation-sandbox-ready-now-iframe-at-m5.md) planned a sandboxed iframe and folder trust for M5, before anyone else installs margent ([0024](0024-margent-name-and-distribution.md) puts it on npm).
- Exploring M5 found two holes the iframe alone doesn't close:
  - **Island code runs in Node.** Every render (`open`, `export`, `check`, each served page) executed `islands/{name}.island.js` with `vm.runInContext` to read its schema. `node:vm` is not a security boundary: `this.constructor.constructor('return process')()` reaches the real process. So a cloned repo's island could run shell commands as the user before any page opened.
  - **Markdown can carry scripts.** markdown-it runs with `html: true` and nothing sanitizes it, so a `.md` can hold a `<script>` or an `<img onerror>` that calls `/_save` under `serve`, with no island involved.
- `serve` also returned any file under its root, dotfiles included.
- Spike S4 showed contract v1 islands run unchanged in `<iframe sandbox="allow-scripts" srcdoc>`, with heights within 1 px.

## Decision

- **Node never runs island code.** Render reads a module as text, rejects what would break the page, and wraps it with the kit's string transform. Loading, the `contract`, `schema` and `render` checks, schema validation and column patterns move into the sandboxed guest. `check` gets their results from the page and prints the same `file:line: message` lines as before.
- **Each island runs in `<iframe sandbox="allow-scripts" srcdoc>`.** The frame has an opaque origin, its own policy with no network except the Google Fonts hosts, and talks to the page only through `postMessage`. The parent sends theme tokens, its color scheme and quote marks. The guest sends its state, height, overflow, link clicks and selections. The parent accepts a message only from that island's frame, and opens only http, https and mailto links, with `noopener`.
- **Every page carries a script policy.** `script-src` lists the sha256 of each inline script the page and its guests run, and nothing else. `object-src`, `base-uri` and `form-action` are `'none'`. A script, inline handler or form written into the markdown doesn't run. Images stay open, so remote images in docs still load. `serve` sends the policy as a header, and pages written to disk carry it as a meta tag.
- **`serve` refuses dot paths.** Any path segment starting with `.` is a 404.
- **No folder trust.** The frame, the page policy and Node never running module code are the boundary.

## Consequences

- Opening a doc from a repo you didn't write can't run code on your machine or reach the save endpoint.
- `open`, `export` and serve saves no longer fail on a schema or pattern error. The island shows the error in its box, and `check` still exits 1 with the island's line. A save that breaks an island's data is accepted, and the page shows the error.
- Island contract v1 and every existing module stay as they are.
- An island that loops freezes its tab, because a srcdoc frame runs in the page's process. Accepted.
- Inside an island, text selection and quote marks for comments work through messages instead of reading the island's shadow root.
- Each island adds a frame and a message round trip on load.

## Alternatives considered

- **Static schema, contract v2.** Modules write `export const schema` as a JSON literal that Node reads as text, and render-time errors stay. Rejected: every module and the contract change, for errors `check` already reports.
- **Evaluate modules in a child process with Node's permission model.** Rejected: on Node 22 the model doesn't restrict the network, so it isn't a boundary either.
- **Sanitize the markdown's HTML.** Rejected: it breaks docs that use raw HTML on purpose, while the script policy blocks only what runs.
- **Folder trust (Jupyter, VS Code).** Rejected: with the frame and the policy in place, what's left (a frozen tab, misleading content) doesn't justify showing a new user's first doc as plain tables.
