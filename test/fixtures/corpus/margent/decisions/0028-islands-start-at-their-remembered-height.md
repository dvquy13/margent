---
title: Islands start at their remembered height
status: accepted
updated: 2026-10-25
---

# 0028 Islands start at their remembered height

## Context

Since M5 ([0025](0025-islands-run-only-in-a-sandboxed-frame.md)) each island runs in a sandboxed frame that starts at height 0, and the page shows the JS-off fallback until the guest reports `rendered`. The guest's state and height arrive after the page's first paint, so the fallback disappears and the frame grows. On `test/edit-corpus/docs/spikes/m0-report.md` at 1280px, first paint came at 64–104ms and two shifts at 138–214ms: a cumulative layout shift of 0.205 on the first load and on every reload. Under `serve` every save reloads the page, so an author saw the fallback flash and the page jump after each edit. Decision 0027's corpus flake had the same cause: a click measured before the islands grew landed on a frame.

## Decision

The page remembers each island's last reported height in `sessionStorage`, keyed by page path, island position, name and the island's width. On the next load in the same tab the frame starts at that height, and `data-reserved` hides the fallback until the guest reports. The first state clears `data-reserved`. If no state comes within the host's 10s state wait, the frame goes back to height 0 and the fallback shows, as before. If storage is blocked, the host warns once in the console and frames start at 0.

## Consequences

- Reloads of m0-report measured 0 layout shift (was 0.205), and first paint stays at 64–132ms.
- A doc's first open in a tab is unchanged. It shifts when the islands report after the first paint: 2 of 6 fresh loads in the measurement.
- When an island's content changes height (after an edit), the reload starts at the old height and shifts once by the difference.
- A different window width, or a different tab, starts from 0 again. `check` runs in a fresh headless context, so it never reads a remembered height.

## Alternatives considered

- **Hold the first paint until every island reports, capped at about 500ms.** Rejected by the user: first paint would move from about 70ms to 150–250ms or more, and every page's display would depend on its islands.
- **Both: remembered heights, and a held paint only on a doc's first open.** Rejected: two mechanisms to test for a jump that happens once per doc per tab.
- **localStorage.** Rejected: keys would pile up forever. sessionStorage lasts as long as the tab, which is the editing loop.
