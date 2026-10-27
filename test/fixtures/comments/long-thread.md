---
title: Long threads in one doc
status: draft
updated: 2026-10-27
---

# Long threads in one doc

## Retries

The retry policy caps each island at {==three attempts==}{>>[c1] Quy: Is three attempts enough for the slow chart islands?<<}{>>[c1] Claude: Three covers the S3 log. Only one island needed a fourth try, and it was the one with the cold cache.<<}{>>[c1] Quy: A cold cache should be rare after the first build. Can we check how often it happens in CI?<<}{>>[c1] Claude: In the last 40 CI runs it happened twice, both on the first run of a branch. The counts are in the S3 log.<<}{>>[c1] Quy: Two in forty is more than I expected. Is the cache key too narrow?<<}{>>[c1] Claude: Possibly. The key includes the commit hash, so every commit starts cold. Keying on the lockfile would keep the cache warm across commits.<<}{>>[c1] Quy: Then let's key on the lockfile and see whether the retries drop.<<}{>>[c1] Claude: Done on the draft branch. The first run after a lockfile change is still cold, which is expected and is one run in many.<<}{>>[c1] Quy: Good. Keep three attempts for now, and note the cache change in the release log.<<}{>>[c1] Claude: Noted. I will add the release-log line and link this thread from it, so the next reader sees why three was chosen.<<}

Each island gets its own render budget, which is {==ten seconds==}{>>[c2] Quy: Is ten seconds still right after the font change?<<}{>>[c2] Claude: Yes. The slowest passing island in the log took 6.8 seconds.<<}.

Failed renders are listed on the status page, {==newest first==}{>>[c3] Quy: Should this list also show the cause?<<}{>>[c3] Claude: Adding the cause means changing the status schema. I would leave it for the next milestone.<<}.

## Comparison

The comparison below draws its sample from both builds, and {==the island definition decides the result==}{>>[c4] Quy: The sample is drawn from the last two quarters of rendered pages, so the figure describes what readers saw rather than what the build produced. That matters for the second half of the argument, where we claim the regression is confined to pages with islands. Before we accept that claim, the team should agree on what counts as an island page. Right now the script counts any page with at least one island tag, which includes a page whose only island is a static legend that never fetches data. Those pages render the same in both builds, so they dilute the comparison and make the regression look smaller than it is. If we exclude them, the gap between the two builds widens from about four points to about seven, and the interval no longer crosses zero. I would rather report the narrower definition and say so than keep a definition that flatters the result. The time window needs the same care. The regression appeared in the week of the font change, and the sample starts two weeks before it. Those two weeks are a useful baseline, but they are also the weeks the content team migrated tables, so the table-heavy pages may not be comparable. We could drop the migration weeks, or match pages by table count. Matching answers the question directly. The harness also records a failure when an island takes longer than ten seconds, and those failures belong on their own line, not folded into the rendering rate. Proposed next step: rerun the comparison with the stricter island definition and the matched baseline, and publish the table next to this note.<<}.
