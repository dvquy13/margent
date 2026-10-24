---
title: "`serve` binds 127.0.0.1 with a per-session token from M2"
status: accepted
updated: 2026-10-24
---

# 0016 `serve` binds 127.0.0.1 with a per-session token from M2

## Context

M2 adds the first endpoint that writes files: the save endpoint behind `agent-docs serve`. The design put the 127.0.0.1 bind and the per-session token at M5, together with the island sandbox and folder trust ([Security before a second user](../design/system-design.md#security-before-a-second-user)). Without a token, any page open in the browser can POST to a localhost port, so any website could edit a served doc from M2 until M5.

## Decision

From M2, `serve` listens on 127.0.0.1 only and generates a random token per run. The printed URL carries the token, which is exchanged for an `HttpOnly; SameSite=Strict` cookie that every route requires. Requests with a foreign `Host`, and POSTs with a foreign `Origin`, get 403. The island sandbox and folder trust stay at M5 ([0008](0008-island-isolation-sandbox-ready-now-iframe-at-m5.md)).

## Consequences

- Other websites can't read or edit served docs, including through DNS rebinding.
- Islands inside a served page still hold the cookie and can call the save endpoint. That stays acceptable for your own repos until M5.
- M5's security work shrinks to the sandbox and folder trust.
- A URL without the token, such as a bookmark from an earlier run, gets 403. The URL printed by the current run works.

## Alternatives considered

- **Keep everything at M5, as designed.** Rejected: it leaves cross-site writes open for three milestones, and the fix is about 30 lines.
- **Token in every URL instead of a cookie.** Rejected: relative links between docs would drop it.
