---
name: positive-benchmark-island
tags: [trigger, diagram]
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a short report for docs/reports/search-latency.md on this week's search latency benchmark, with a chart so the team can compare the configurations. The results, in milliseconds:

| Config | p50 | p95 | p99 |
|---|---|---|---|
| baseline | 42 | 118 | 240 |
| cache-warm | 18 | 61 | 150 |
| sharded-4 | 27 | 74 | 133 |
| sharded-8 | 25 | 69 | 121 |

Don't write any files: show me the full markdown, and the content of any other file the report needs, in your reply.
