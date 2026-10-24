# S3 fixture changes

Source: written for margent's island tests, from the layout of the S3 spike (`A.md`, `B.md`, `C.md`, `islands/*.island.js`). The island modules are unchanged except as listed here.

Schemas were checked against the keywords in `runtime/kit.js`. Every keyword the three schemas use (`type`, `required`,
`properties`, `items`, `allOf`, `contains`, `const`, `minItems`, `minLength`, `pattern`, `additionalProperties`,
`maxProperties`) is supported, so no schema changed.

## llm-calls.island.js

- Added the root `columns` keyword with patterns for `what_it_decides_and_when`, `model`, `cost_average_month` and
  `evaluated_by`. Each pattern is the shape the module's own parser (`parseDecides`, `parseModel`, `parseCost`,
  `parseEval`) reads, and accepts the plain-text cells the parser falls back to. The patterns flag only wording the
  parser would misread: a question with no "when" part, "proposed" without "for M{n}", a dollar amount or a bare number that is not
  the parsed form, and an evaluation with no reference or status.
- Not declared: nothing else. "Every {unit}" and "proposed" are optional per row, so a per-cell pattern cannot require
  them.

## milestone-depth.island.js

- Added `columns.scope` with the pattern `,\s`. The scope's first sentence is a comma list (`parseScope`), so a cell
  with no comma-space is one item, and the badge names it. This flags single-item scopes too, which is a deliberate
  false alarm: a warning, not an error.
- `done_when` has no pattern. `emphasize` only sets numbers in bold, and a cell with no number is valid.

## spike-verdicts.island.js

- Added `VERDICT_PART` and `VERDICT_PATTERN` next to `COLS`. A verdict cell is a comma list of parts, each an optional
  count (`three`, `2`) and a kind from `KINDS` (`Proceed`, `Adjust`, `Decided`, `Stop`), as `parseVerdict` reads them.
- Added `columns.spike` with `^S\d+(?:\s*[–-]\s*S?\d+)?\s+.+$`, the id and range shape of `parseSpike`.
- Added `columns.verdict` with `VERDICT_PATTERN`.
- Not declared: `question` (plain text only) and `what_it_changed`. Gauges are optional sentences, so a per-cell
  pattern cannot require one.
