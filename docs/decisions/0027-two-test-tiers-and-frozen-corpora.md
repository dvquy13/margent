---
title: Two test tiers, and corpus walks read frozen copies
status: accepted
updated: 2026-10-25
---

# 0027 Two test tiers, and corpus walks read frozen copies

## Context

After M5, `npm test` took 410s on clean `main` and failed 4 tests. Two failures came from a sibling checkout of another project: an uncommitted review thread there failed A3 and the "no comments" render check, on any margent branch. Several walks also read this repo's own `docs/`, so every new doc made the suite slower and a review comment in a doc failed it.

Timings on this machine (an M2 with 4 performance cores):

- Five corpus walks (gate report, A3, the A2 walks, the no-op walk, S2), plus `corpus` and `acceptance`, were about 280s of the 535s the files take when run one at a time.
- Without them, the remaining browser files still took 95s in parallel. Each browser test costs 1 to 2s alone and about 3× that when the default 7 files run at once, because every file drives its own Chrome.
- Running 4 files at a time instead of 7 made no consistent difference.

## Decision

- **Two tiers.** `npm test` is the fast tier, for every change, and must stay under 30s. `npm run test:full` sets `MARGENT_TIER=full` and runs every test. Run it before merging a branch into `main` and before a release.
- **One mechanism.** A test leaves the fast tier by passing `full` from `test/helpers/tier.mjs` as its node:test options: `test('…', full, async () => …)`. In the fast tier it shows as skipped, with the command that runs it, so the skip count is visible in every run.
- **What stays fast:** every test that doesn't use a browser, plus the main path of each feature and each security boundary in Chrome (about 35 browser tests). Corpus walks, the edit corpus, acceptance shots and link walks, timing checks (A7, A11) and edge cases are full tier.
- **Frozen corpora.** The walks read frozen copies under `test/fixtures/corpus/`: a second project's `docs/` and margent's own `docs/`. Refreshing one is a deliberate commit followed by `npm run test:full`. `margent check docs/` still covers the live docs.

## Consequences

- The fast tier measured 22 to 24s on a quiet machine, 301 tests run and 263 skipped. macOS background jobs push single runs to 50s or more, so judge a slow run by running it again.
- The full tier took 4 to 9 minutes in the runs here, depending on machine load, and still has load-sensitive timing checks (A7, A8/A9 shots). Those pass when their file runs alone.
- Making the corpus reliable took two harness fixes, found while measuring: `openServedPage` waits for island frames to settle (`islandsSettled` in `test/helpers/browser.mjs`), because a frame starts at height 0 and grows when its guest reports, so a click measured earlier lands on the frame; and the island click probe in `runtime.test.mjs` closes the tab each link click opens, since an open tab starved the next clicks under load.
- A new browser test runs in the fast tier unless it passes `full`. Mark it `full` unless it is a feature's main path.
- The tests no longer need a second checkout, so they work for anyone who clones the repo.
- A file whose tests are all `full` still runs its `before` hook (one Chrome launch, about 0.4s) in the fast tier.

## Alternatives considered

- **Lower concurrency.** Rejected: 4 at a time was no faster than 7 and no less noisy.
- **Live second project, opt-in through an env var.** Rejected for the default run: it keeps margent's tests at the mercy of another project's working tree. A refresh of the frozen copy is the controlled way to test against newer docs from that project.
- **Moving full-tier tests to a separate folder.** Rejected: it splits each topic file in two and breaks relative imports. The options argument keeps a feature's tests together.
