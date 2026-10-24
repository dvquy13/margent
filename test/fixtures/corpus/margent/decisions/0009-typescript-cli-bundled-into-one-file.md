---
title: TypeScript CLI bundled into one dist/cli.js; kit and host as plain browser JS
status: accepted
updated: 2026-10-23
---

# 0009 TypeScript CLI bundled into one dist/cli.js; kit and host as plain browser JS

## Context

The M1 spec's language question. The renderer, the M2 editor and the islands all run JS, so one runtime covers them all.

## Decision

The CLI and renderer are TypeScript. esbuild bundles them into one `dist/cli.js` with no runtime dependencies. The kit and host are plain browser JS, inlined into pages.

## Consequences

- One bundled file is what the plugin ships (design §13, spec R5.1).

## Alternatives considered

None recorded at the time.
