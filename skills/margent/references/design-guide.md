# Design guide for islands

Use this when no design skill is installed. If the project or the user has one, it takes precedence.

## Start from the claim

1. Write the caption first: one sentence stating what the reader should conclude.
2. Decide what the reader's eye should land on first. That is usually one computed number or one shape: a total, a tally, the row that breaks the pattern.
3. Draw that, then add only what supports it. Every element should help the caption's claim or answer the next question a reader would ask.

Prefer computed views to restyled tables. A tally with a zero for the kind nobody got, shares that add up, a gauge against a cap, or a flow between stages shows something the table can't. Pills and colors on the same grid usually don't.

## Contrast, repetition, alignment, proximity

- **Contrast.** Things that differ should look clearly different: the key number large and heavy, supporting labels small and muted. A slight difference looks like a mistake.
- **Repetition.** Reuse the same treatment for the same meaning: one style for every status pill, one for every label, one spacing rhythm.
- **Alignment.** One left edge for block content. Numbers align on their baseline and use `font-variant-numeric: tabular-nums`. A second left edge is a defect.
- **Proximity.** Group with spacing before reaching for borders or fills. Related things sit close together, unrelated things further apart.

## Color

- Black, white and one accent: `var(--text)`, `var(--bg)`, `var(--accent)` with `--accent-light` and `--accent-border` for tints.
- Status colors (`kit.tone`: `go`, `warn`, `stop`, `done`, `neutral`) are for status only, never decoration.
- Don't add a second accent. Weight, size, spacing and opacity solve most of what feels like it needs one.
- Take every color from a token. In CSS use `var(--token)`; in JS and SVG math use `kit.tokens` and re-read it in `kit.onTheme`. Then dark mode works with no extra code.

## Type

- UI text, labels and numbers: `var(--font-ui)`. Longer prose inside an island: `var(--font-prose)`. IDs, code and machine values: `var(--mono)`.
- Sizes come from the scale only (`--font-xs` to `--font-6xl`), never raw pixel values.
- Small caps-style labels: `--font-xs`, uppercase, slight letter spacing, `var(--text-muted)`.

## Space and layout

- Spacing comes from `--gap-xs` to `--gap-xl`. Be generous; crowding fights contrast and proximity.
- Design for the page column (about 900px) and for a 390px phone. Put `container-type: inline-size` on an inner wrapper and use `@container` queries to restack, since the island cannot be its own container.
- Height comes from content. No viewport units, no fixed heights that clip text.
- Long labels wrap or truncate with the full text available on hover or focus. Nothing may spill outside the island's box: the host clips it.

## Interaction

- Interaction is optional. Add it when it answers a real question (filter by verdict, show a row's details), not for decoration.
- Interactive elements are neutral at rest. On hover and focus, text, borders and icons move to the accent together.
- Use real `<button>` elements with a visible `:focus-visible` outline in `var(--accent)`. Everything that works on hover also works on focus and click.
- Tooltips and detail panels stay inside the island's box.
- Motion is brief and functional: 100–150ms for color and opacity, about 400ms for a bar's width. No bouncing, no infinite attention-seeking animation.

## Avoid

- Shadows and decorative borders. A border should mark structure, not fill space.
- Accent creep: when everything is accent, nothing is.
- Hard-coded facts, labels copied from the data, or text that restates the caption.
- Charts whose axis, legend or units the reader has to guess. Label things directly where you can.

## Accessibility

- Give an SVG chart `role="img"` and an `aria-label` that states what it shows.
- Keep text as real text, not paths.
- Color is never the only signal: pair a status color with a word or glyph.
