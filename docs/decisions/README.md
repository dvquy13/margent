# Decisions

One file per decision. Format and rules: `docs/README.md`.

| # | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-deterministic-script-renders-pages.md) | A deterministic script renders pages; the LLM designs only islands | accepted | 2026-10-23 |
| [0002](0002-bespoke-islands-promoted-on-second-use.md) | Bespoke islands, promoted to a catalog on second use | superseded | 2026-10-23 |
| [0003](0003-island-data-in-markdown-tables.md) | Island data in markdown tables, YAML when nested | accepted | 2026-10-23 |
| [0004](0004-contenteditable-per-block-with-splice.md) | Editing uses contenteditable per block, spliced into source lines | accepted | 2026-10-23 |
| [0005](0005-comments-as-inline-criticmarkup.md) | Comments as inline CriticMarkup | accepted | 2026-10-23 |
| [0006](0006-docs-live-in-the-repo.md) | Docs live in the repo, opened locally | accepted | 2026-10-23 |
| [0007](0007-one-repo-for-npm-plugin-and-marketplace.md) | One repo is the npm package, the plugin and the marketplace | superseded by [0024](0024-margent-name-and-distribution.md) | 2026-10-24 |
| [0008](0008-island-isolation-sandbox-ready-now-iframe-at-m5.md) | Island isolation: sandbox-ready contract now, sandboxed iframe at M5 | superseded by [0025](0025-islands-run-only-in-a-sandboxed-frame.md) | 2026-10-24 |
| [0009](0009-typescript-cli-bundled-into-one-file.md) | TypeScript CLI bundled into one dist/cli.js; kit and host as plain browser JS | accepted | 2026-10-23 |
| [0010](0010-node-test-golden-files-playwright-core.md) | node:test, golden files and playwright-core on installed Chrome | accepted | 2026-10-23 |
| [0011](0011-markdown-it-for-parsing.md) | markdown-it with GFM tables and markdown-it-front-matter | accepted | 2026-10-23 |
| [0012](0012-open-renders-into-user-cache.md) | `open` renders into the user cache, never the repo | accepted | 2026-10-23 |
| [0013](0013-docs-root-is-nearest-islands-ancestor.md) | Docs root is the nearest ancestor containing islands/ | accepted | 2026-10-23 |
| [0014](0014-check-tests-overflow-at-two-widths.md) | `check` runs islands headless at 390px and 1280px and fails on overflow | accepted | 2026-10-24 |
| [0015](0015-renders-are-never-committed.md) | Renders are never committed to the repo | accepted | 2026-10-23 |
| [0016](0016-serve-binds-localhost-with-session-token.md) | `serve` binds 127.0.0.1 with a per-session token from M2 | accepted | 2026-10-24 |
| [0017](0017-gate-and-turndown-run-in-the-browser.md) | Round-trip gate and turndown run in the browser | accepted | 2026-10-24 |
| [0018](0018-m2-done-when-scripted-edit-corpus.md) | M2 is done when a scripted edit corpus passes in real Chrome | accepted | 2026-10-24 |
| [0019](0019-soft-breaks-read-from-the-dom.md) | Soft breaks carry no renderer marker; the edit runtime reads them from the DOM | accepted | 2026-10-24 |
| [0020](0020-selection-maps-through-turndown-sentinels.md) | A selection maps to source through house turndown with sentinels | accepted | 2026-10-24 |
| [0021](0021-comment-operations-are-block-saves.md) | Comment operations are block saves | accepted | 2026-10-24 |
| [0022](0022-m3-done-when-corpus-and-real-review.md) | M3 is done when a comment corpus passes and a real review is handled | accepted | 2026-10-24 |
| [0023](0023-comment-rail-and-quoted-block-comments.md) | Threads show in a comment rail, and block comments can quote a phrase | accepted | 2026-10-24 |
| [0024](0024-margent-name-and-distribution.md) | Rename to margent, ship the CLI on npm and the skills to any agent | accepted | 2026-10-24 |
| [0025](0025-islands-run-only-in-a-sandboxed-frame.md) | Islands run only in a sandboxed frame, pages carry a script policy, and there is no folder trust | accepted | 2026-10-24 |
| [0026](0026-m5-done-when-it-works-on-this-machine.md) | M5 is done when it works on this machine, including a local install | accepted | 2026-10-24 |
| [0027](0027-two-test-tiers-and-frozen-corpora.md) | Two test tiers, and corpus walks read frozen copies | accepted | 2026-10-24 |
| [0028](0028-islands-start-at-their-remembered-height.md) | Islands start at their remembered height | accepted | 2026-10-25 |
| [0029](0029-folder-walks-skip-gitignored-files.md) | Folder walks skip gitignored files | accepted | 2026-10-25 |
| [0030](0030-full-tier-runs-three-files-at-a-time.md) | The full tier runs three test files at a time | accepted | 2026-10-25 |
| [0031](0031-first-public-release.md) | First public release, generic fixtures and release-please | accepted | 2026-10-25 |
| [0032](0032-os-user-name-signs-notes-without-git.md) | The OS user name signs notes when git has no name | accepted | 2026-10-25 |
| [0033](0033-owner-edits-their-own-notes.md) | The owner edits their own notes from the page | accepted | 2026-10-25 |
| [0034](0034-no-island-catalog.md) | No island catalog; M4 is cut | accepted | 2026-10-25 |
| [0035](0035-agent-replies-human-resolves.md) | The agent replies to every comment and only the user resolves | accepted | 2026-10-25 |
| [0036](0036-check-fails-on-broken-links.md) | `check` fails on broken links | accepted | 2026-10-25 |
| [0037](0037-note-line-breaks-as-br.md) | A note's line breaks are stored as `<br>` | accepted | 2026-10-25 |
| [0038](0038-serve-tells-pages-when-margent-changed.md) | `serve` tells open pages when margent changed on disk | accepted | 2026-10-26 |
| [0039](0039-quoted-phrase-must-match.md) | A quoted phrase must be found in its block | accepted, amended by [0041](0041-quote-names-its-occurrence.md) | 2026-10-26 |
| [0040](0040-init-writes-nearest-agents-file.md) | `init` writes a margent block into the nearest AGENTS.md or CLAUDE.md | accepted | 2026-10-27 |
| [0041](0041-quote-names-its-occurrence.md) | A quoted phrase names its occurrence when it repeats (amends 0039) | accepted | 2026-10-27 |

## Deferred

None yet.
