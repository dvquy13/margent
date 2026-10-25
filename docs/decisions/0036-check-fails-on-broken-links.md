---
title: check fails on broken links
status: accepted
updated: 2026-10-25
---

# 0036 check fails on broken links

## Context

An agent writing specs in another project found that `margent check` passed a link to a missing heading. It passed every broken link: `[x](#no-such-heading)`, `[y](b.md#nope)` and `[z](gone.md)` all gave `ok`. The renderer rewrote a `.md` link to `.html` whether or not the file existed, and nothing looked at anchors. The only link check was `scripts/accept/link-walk.mjs`, an acceptance script that walks rendered pages in a browser (M1 A10), which users never run.

Two precedents exist. A missing image is a `RenderError` in every command (M1 R1.7). An island problem fails only `check`, while `open`, `export` and `serve` still render the page and show the error in the island's box.

## Decision

`check` fails on a broken local link, and the other commands render as before.

- Render records every heading slug and raw HTML `id` or `<a name>` on the page (`anchors`), and every local or `#` link with its source line (`refs`). Rendered HTML does not change.
- `check` prints one `file:line` problem per broken link: a `#x` with no such heading on the page, a target that doesn't exist (a folder counts), or a `.md` target that lacks the `#x` heading. A target outside the checked set is rendered to read its headings. If it fails to render, the link is reported as one that can't be checked.
- External links are not fetched, and anchors on non-`.md` targets are not checked.

## Consequences

- Agents and users find broken links with the command they already run after every edit.
- `serve` keeps showing a page whose link has a typo, as it does for a broken island, so a mid-edit typo never blocks the page.
- A heading rename that breaks a link elsewhere now fails `check` on the docs that link to it, not on the renamed doc.

## Alternatives considered

- **A `RenderError` in every command, as for images.** Rejected: a typo in a link would stop `serve` from showing the page while the user is editing it.
- **Run the browser link walk inside `check`.** Rejected: it needs Chrome and a page load per target, while the renderer already knows every id it writes.
