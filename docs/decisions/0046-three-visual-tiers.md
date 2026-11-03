---
title: Three visual tiers, with Mermaid as the default for diagrams
status: accepted
updated: 2026-11-03
---

# 0046 Three visual tiers, with Mermaid as the default for diagrams

## Context

- With [0045](0045-mermaid-fences-render-through-pele.md), an agent can draw a visual in three ways: a Mermaid fence, a hand-drawn SVG in `assets/`, or an island. The skill names only the last two, and tells agents to draw an SVG for every structure the reader would otherwise rebuild from prose.
- Mermaid also draws charts: pie, xychart (bar and line), quadrant, sankey, radar, treemap. They overlap with islands. An island keeps its numbers in a markdown table ([0003](0003-island-data-in-markdown-tables.md)): a reader without JS sees the table, `check` validates each cell, and a comment can quote one cell. A Mermaid chart keeps its numbers inside the fence, so the page shows no table and a comment can only quote a label.
- An easy default pulls every visual toward it. If Mermaid is the easiest tier, docs where layout should carry meaning get a generic flowchart instead.

## Decision

The skill gives agents three tiers, in this order:

1. **Mermaid fence**, the default for common structures: a flow or pipeline (flowchart), messages across processes (sequence), states and transitions (state), entities (ER, class), plans and history (gantt, timeline), and a breakdown (mindmap). Also a small chart that illustrates a point and whose numbers no one needs to check: a pie of a few shares, a positioning quadrant.
2. **Hand-drawn SVG**, when layout carries meaning that auto-layout can't give: a layered stack, a map of a space, a before-and-after, callouts on parts of one thing, or emphasis beyond colouring a node. Also when the rendered Mermaid diagram crosses edges or buries its point, or is too wide for the column after a top-to-bottom rewrite.
3. **Island**, when a visual is computed from data a reader should be able to check or comment on cell by cell. A chart of numbers that matter stays an island over a table.

- The agent looks at the rendered page (`margent open`) before keeping a Mermaid diagram, and moves up a tier when the layout fails tier 1's test.
- Every tier keeps the caption rule: one italic sentence stating what the reader should take from the visual.
- Diagrams are coloured only with margent's named styles ([0045](0045-mermaid-fences-render-through-pele.md)), never hex colours, `style` lines, or theme settings in the fence.
- The full rules and the list of recommended diagram types go in a new `skills/margent/references/diagrams.md`, read when an agent draws a diagram. `SKILL.md` keeps the tier order and points to it.

## Consequences

- Most structural diagrams cost a few lines, and the agent's design effort goes to the visuals that need it.
- The rule for charts follows from [0003](0003-island-data-in-markdown-tables.md): numbers people check live in tables.
- Skill evals check both directions: a design note with a pipeline gets a Mermaid fence, and a request for an illustration whose layout carries meaning gets an SVG.
- Existing hand-drawn SVGs stay as they are. Nothing moves them to Mermaid.

## Alternatives considered

- **Mermaid for every visual, charts included.** Rejected: chart numbers would leave the tables that make them readable without JS and checkable by cell.
- **Let the agent choose with no order.** Rejected: agents fall back to what they know best, which is either hand SVG at full cost or Mermaid everywhere.
- **Keep Mermaid out of the skill and let users ask for it.** Rejected: the cost saving only happens if agents reach for it unprompted.
