# Island contract v1

The full contract between a doc, its island module and the runtime. Read it before writing a module.

## Data in the markdown

**Table-backed (the default).** An HTML comment line directly above a GFM table, with no blank line between them:

```md
<!-- island spike-verdicts -->
| Spike | Question | Verdict |
|---|---|---|
| S1 Source access | Can we fetch the sources we need? | Proceed, Adjust per source |

*No spike said stop. Eight adjustments reshaped the plan.*
```

- The marker may carry simple string attributes: `<!-- island llm-calls total=3.87 -->`. Use one only when a fact truly has no place in the table.
- The table stays an ordinary table. It is what GitHub shows, what an agent reads, and the island's fallback.
- A `|` inside a cell, including inside a code span, is written `\|`.

**YAML-backed.** A fenced block whose info string is `island {name}`, with a YAML body. Use it only for nested data with no table shape.

````md
```island milestone-depth
- id: M1
  scope: [HN and GitHub sources, raw and observation tables]
  done_when: 3 topics fill bronze and silver for 14 days in a row
```
````

Island names are lowercase letters, digits and dashes. Markers and fences sit at the top level of the doc, never inside a list or a quote.

## What the module receives

**Table-backed:** `data = { columns, rows, attrs }`.

- `columns`: `[{ key, label }]` in table order. `label` is the header as written.
- `key` is the label lowercased, with every run of characters other than Unicode letters and digits replaced by `_`, and leading and trailing `_` trimmed. "What it decides, and when" becomes `what_it_decides_and_when`. Two headers with the same key are an error.
- `rows`: one object per row, `{ [key]: cell }`. A cell is the raw markdown source of that cell, trimmed, with `\|` unescaped. Render it with `kit.md(cell)`.
- `attrs`: the marker's attributes as strings, `{}` when there are none.

**YAML-backed:** `data` is the parsed YAML value (a mapping or a sequence).

## Module

One file, `islands/{name}.island.js`, in the docs root's `islands/` folder. The runtime finds it by walking up from the doc's folder.

```js
export const contract = 1;

export const schema = {
  type: 'object',
  required: ['rows'],
  properties: {
    rows: {
      type: 'array',
      minItems: 1,
      items: { type: 'object', required: ['stage', 'cost'], properties: { stage: { type: 'string' }, cost: { type: 'string' } } },
    },
  },
  columns: { cost: { pattern: /^\\\$\d+(\.\d+)?$/.source } },
};

export default function render(root, data, kit) {
  const rows = data.rows.map((r) => ({ stage: r.stage, usd: Number(r.cost.replace(/^\\\$/, '')) }));
  const total = rows.reduce((s, r) => s + r.usd, 0);
  root.innerHTML = `
    <style>
      .box { container-type: inline-size; }
      .total { font-size: var(--font-5xl); font-weight: 650; font-variant-numeric: tabular-nums; }
      .strip { display: flex; height: 12px; gap: 2px; margin-top: var(--gap-sm); }
      .seg { background: var(--accent); border-radius: var(--radius-sm); }
      .seg:nth-child(even) { background: var(--accent-border); }
    </style>
    <div class="box">
      <div class="total">${kit.esc(kit.fmt.usd(total))}</div>
      <div class="strip" role="img" aria-label="Cost by stage">
        ${rows.map((r) => `<div class="seg" style="flex: ${r.usd}" title="${kit.esc(r.stage)}: ${kit.fmt.usd(r.usd)}"></div>`).join('')}
      </div>
    </div>`;
}
```

- **No `import`.** The runtime wraps the file as a classic script inside the island's frame. Allowed export forms: `export const`, `export function`, `export default function`.
- `contract` must be `1`. `schema` is required. The default export is `render(root, data, kit)`.
- `root` is an open shadow root inside the island's sandboxed frame (rule 4). The module owns everything inside it and may replace it on every render (`root.innerHTML = ...`).
- No fact lives only in the module. Labels for categories, tones and glyphs are display config and belong in the module. Names, numbers and dates come from `data`.

## Schema

The runtime validates `data` against `schema` before `render` runs, inside the island's frame. A violation shows in the island's box with the schema path, and `margent check` fails with the island's `file:line`.

Supported keywords: `type`, `enum`, `const`, `required`, `properties`, `additionalProperties`, `items`, `minItems`, `maxItems`, `contains`, `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, `allOf`, `anyOf`, `maxProperties`. Annotations `title`, `description`, `$comment`, `default` and `examples` are ignored. Any other keyword is an error, so a schema never looks stricter than it is.

### Column patterns

When the module reads structure out of a cell's wording, declare a pattern for that column with the root-level `columns` keyword:

```js
columns: {
  verdict: { pattern: /^(Proceed|Adjust|Decided|Stop)\b/.source },
  cost: { pattern: /\\\$\d/.source },
}
```

- The pattern is a JavaScript regular expression with the `u` flag, tested against the raw cell source with `test()`. A string or a regex literal's `.source` both work; the source is raw markdown, so a dollar amount reads `\$3.87`. Anchor it with `^` and `$` when the whole cell must match.
- Every cell of a declared column is tested. Undeclared columns are not checked.
- On a mismatch the cell still reaches the module as written, and the module must still show it (as plain text if nothing else). The page shows a warning badge listing each mismatched cell, and `margent check` fails with `file:line: island {name}: cell "{text}" does not match {key} pattern`.
- Declare a pattern for every column you parse. Without one, a reworded cell silently drops out of the visual.

## Kit

The third argument to `render`. Identical in every runtime.

| API | What it does |
|---|---|
| `kit.tokens` | Current theme values as a plain object keyed without `--`, e.g. `kit.tokens.accent`. For JS and SVG math only. In CSS, use `var(--accent)`. |
| `kit.onTheme(cb)` | `cb(tokens)` runs after a theme change. CSS variables update by themselves; use this only for colors computed in JS. |
| `kit.md(str)` | Inline markdown to a safe HTML string: `**bold**`, `*em*`, `` `code` ``, `[text](url)`, `~~strike~~`, and `\$` to `$`. Everything else is escaped. |
| `kit.esc(str)` | HTML-escape. Use it for every string you put into markup that is not passed through `kit.md`. |
| `kit.fmt.usd(n, digits = 2)` | `"$3.87"` |
| `kit.fmt.pct(x, digits = 0)` | `x` is a fraction: `0.41` gives `"41%"` |
| `kit.fmt.num(n)` | `"4,210"` |
| `kit.tone(name)` | `go`, `warn`, `stop`, `done` or `neutral` to a CSS color such as `var(--green)`. Unknown names throw. |

Tokens available as CSS variables inside the root: `--bg --bg2 --bg3 --border --text --text-muted --accent --accent-light --accent-border --green --amber --red --font-ui --font-prose --mono --font-xs --font-sm --font-md --font-body --font-base --font-lg --font-2xl --font-4xl --font-5xl --font-6xl --radius-sm --radius-pill --gap-xs --gap-sm --gap-md --gap-lg --gap-xl`.

The runtime adopts a base stylesheet into the root before `render`: every token on `:host`, `:host { display: block; position: relative; overflow: hidden }`, `box-sizing: border-box` everywhere, and the UI font at body size.

## Rules

1. **Primary facts only in the data.** Totals, shares and counts are computed by the module.
2. **No display config in the data.** Tones, glyphs and category labels live in the module.
3. **Interpretation lives in the prose or the caption** around the island.
4. **The island runs in a sandboxed frame.** Each island renders in its own `<iframe sandbox="allow-scripts">`. The frame has no network, and no access to the page, your cookies, storage or `serve`'s save endpoint. Stay inside these limits:
   - Draw only inside the root's box. Tooltips and panels too: the frame clips anything outside it.
   - Height comes from content. No viewport units, no `position: fixed`.
   - Theme values come from the kit tokens only. Never read page CSS or `document`.
   - No network: no `fetch`, no external images or scripts. Fonts load only from the Google Fonts hosts.
   - No access to `document` outside `root`, and no `window.top` or `window.parent`.
   - Responsive layout uses container queries on an inner wrapper (`.box { container-type: inline-size }`), because the frame cannot be its own container.
   - Links open in a new tab through the kit: a click on an `a[href]` in `root` is passed to the page, which opens only `http`, `https` and `mailto` links. Don't attach your own navigation.
   - A module that throws, or whose data fails the schema or a column pattern, shows its error in the island's box. `margent check` reports the same error with its `file:line`.

## What happens when things go wrong

| Problem | Result |
|---|---|
| Marker not directly above a table, or a malformed marker or fence | Render fails: `file:line` of the marker |
| Invalid YAML | Render fails: `file:line` inside the fence |
| No module found | Render fails: `file:line` of the island |
| Module has an `import`, or bad exports | Render fails: `file:line` of the island |
| Data violates the schema | Island box shows the error, with the schema path; `check` fails with `file:line` of the island |
| A column pattern names a column the table doesn't have, or sits on a YAML island | Island box shows the error; `check` fails with `file:line` of the island |
| Cell does not match its column pattern | Page shows the badge; `check` fails with the cell's line |
| Content spills outside the island's box at 390px or 1280px | `check` fails with the island's line and the width |
| `render` throws, at load or later | Island box shows a red error box with the message, plus the fallback table; `check` fails with `file:line` of the island |

The fallback table also shows when JavaScript is off, and it is what prints.
