---
title: "Island isolation: sandbox-ready contract now, sandboxed iframe at M5"
status: superseded
superseded_by: 0025
updated: 2026-10-25
---

# 0008 Island isolation: sandbox-ready contract now, sandboxed iframe at M5

## Context

Design §11 asks how islands are isolated, with security as the concern. Before M5, islands run with the page's full access, including the write endpoint. That is fine for the author's own docs and unsafe for a cloned repo (design §12, "Islands run as code").

The M1 spec's "Iframe host" row says the iframe host is not shipped in M1. S4's `host-iframe.js` was the starting point for M5. S4 showed that the move into an iframe costs no island changes.

## Decision

Contract v1 has sandbox-ready rules now. A sandboxed iframe and folder trust ship at M5, before anyone else uses the tool.

## Consequences

- Until M5 the tool is for the author's own repos only, and it is not published (design §12).
- Moving the host into an iframe needs no island changes (S4).
- M5 adds the sandbox and folder trust before anyone else installs the tool (design §12).

## Alternatives considered

- **Shadow DOM only.** Rejected: it isolates styles, not code. It is unsafe for repos you did not write.
- **Sandbox in M1.** Rejected: it adds cost before there is a second user.
