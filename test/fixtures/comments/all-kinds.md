---
title: Comments in one doc
status: draft
updated: 2026-10-24
---

# Comments in one doc

A filter keeps {==96% of **rendered** pages==}{>>[c1] Quy: is that stable across repos?<<}{>>[c1] Claude: Measured on 4 repos in S3.<<} as the sample.

A point comment sits here.{>>[c3] Quy: Cite the source for this.<<} The text goes on.

## 2 Costs {==per month==}{>>[c4] Quy: or per run?<<}

Spend is about {==\$40==}{>>[c5] Claude: Per run, from the S3 log.<<} each month.

| Spike | Verdict |
|---|---|
| S3 | Proceed |

{>>[c6] Quy: S1 is missing from this table.<<}

{>>[c7] Quy: Add S4 too.<<}

- First item with {==an inline note==}{>>[c8] Quy: keep it short.<<}
- Second item

Escaped \{==this stays text\==} and the fence below stays text.

```text
The filter keeps {==96% of rendered pages==}{>>[c3] Quy: is that stable?<<}
```

A code span `{>>[c9] X: y<<}` stays text too.
