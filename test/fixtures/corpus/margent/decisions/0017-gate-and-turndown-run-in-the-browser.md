---
title: Round-trip gate and turndown run in the browser
status: accepted
updated: 2026-10-24
---

# 0017 Round-trip gate and turndown run in the browser

## Context

The design checks each block with `turndown(render(src)) === src` "at render time" to decide whether it edits in place ([Editing in the page](../design/system-design.md#editing-in-the-page)). turndown needs a DOM. S2 ran it in Node with jsdom. The CLI has no DOM and ships as one bundled file with no runtime dependencies ([0009](0009-typescript-cli-bundled-into-one-file.md)). The edits themselves are turned into markdown in the browser, because that is where the edited DOM is.

## Decision

The gate and house turndown both run in the browser. A served page embeds the file's source and hash. On load, the edit runtime runs turndown on each candidate block's live DOM and compares the result with that block's source lines. esbuild bundles `turndown` and the house rules into the edit runtime, which is inlined as a `?raw` string like the rest of `runtime/`.

## Consequences

- One turndown, in one environment, both gates a block and converts its edits. A block passes the gate in the same DOM it is edited in.
- The CLI needs no DOM library. `dist/cli.js` grows by the size of turndown and the rules.
- The runtime under `runtime/` is no longer only hand-written plain JS: the edit runtime has a build step ([0009](0009-typescript-cli-bundled-into-one-file.md) still holds for the kit and host).
- `check` does not report gate results. The gate report lives in the page (`window.agentDocs.gate`), and tests read it from there.

## Alternatives considered

- **Gate in Node with jsdom or linkedom.** Rejected: it adds a DOM library to the CLI, and it gates against a DOM that differs from the one the user edits.
- **Page sends HTML, server runs turndown.** Rejected for the same reason, and it moves the DOM dependency to the server.
