# Diagrams

One diagram of each type pele draws, all synthetic.

## Flow

```mermaid
flowchart LR
  A["Markdown source<br/>with a mermaid fence and islands"] --> B["Parse and validate<br/>the islands and the fences"] --> C["Render each fence<br/>through pele, twice"] --> D["Shape the page<br/>shell, policy and scripts"] --> E["Write the HTML<br/>one file per doc"] --> F["Open it in serve<br/>with edits and comments"]
```

*A left-to-right flow that is too wide for the page column, so the wide layout turns it top-to-bottom.*

## Sequence

```mermaid
sequenceDiagram
  participant Author
  participant Render
  participant Browser
  Author->>Render: writes doc.md
  Render-->>Browser: doc.html
  Browser->>Render: comment on a block
  Render->>Author: note spliced into the source
```

*Who sends what between the author, the renderer and the browser.*

## State

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Review : request review
  Review --> Accepted : approved
  Review --> Draft : changes asked
  Accepted --> Superseded : new record
  Accepted --> [*]
  class Review accent
  class Accepted go
```

*A record's life, with the review step in the accent colour and the accepted step in the go tone.*

## Entities

```mermaid
erDiagram
  DOC ||--o{ ISLAND : embeds
  DOC ||--o{ COMMENT : anchors
  COMMENT }o--|| ANCHOR : kind
  DOC {
    string path
    string hash
  }
```

*The records a doc holds: its islands, its comments, and what each comment anchors to.*

## Classes

```mermaid
classDiagram
  class Renderer {
    +renderDoc(input)
  }
  class Island {
    +name
    +render(root, data)
  }
  Renderer --> Island : loads
```

*Two classes and the one dependency between them.*

## Gantt

```mermaid
gantt
  title Example build plan
  dateFormat YYYY-MM-DD
  section Evidence
  Spike           :done, s1, 2026-11-03, 1d
  Decisions       :d1, after s1, 1d
  section Build
  Render + errors :b1, after d1, 2d
  Skill + evals   :b2, after b1, 2d
```

*Three phases, one after another, with the first already done.*

## Timeline

```mermaid
timeline
  title Example releases
  2026-10-24 : 0.1.0 first public release
  2026-10-27 : 0.7.0 review feedback
  2026-11-02 : 0.9.0 polish
  2026-11-03 : 0.10.0 folder tree index
```

*Releases in date order, one line each.*

## Mind map

```mermaid
mindmap
  root((Example))
    Render
      markdown-it
      islands
      Mermaid
    Serve
      edit
      comments
    Ship
      npm
      skills
      plugin
```

*The parts of the project, grouped under three branches.*

## Pie

```mermaid
pie title Review comments by kind
  "Inline" : 18
  "Block, quoted" : 9
  "Block, unquoted" : 4
  "Point" : 2
```

*How the comments in one review were anchored.*

## Quadrant

```mermaid
quadrantChart
  title Visual tier by effort and payoff
  x-axis Low effort --> High effort
  y-axis Low payoff --> High payoff
  quadrant-1 Hand SVG
  quadrant-2 Mermaid
  quadrant-3 Prose
  quadrant-4 Avoid
  Flowchart: [0.2, 0.7]
  Island chart: [0.7, 0.8]
  Hero illustration: [0.85, 0.6]
  Restyled table: [0.6, 0.2]
```

*Where each kind of visual sits on effort and payoff.*

## Chart

```mermaid
xychart-beta
  title "Fast tier runtime by release (s)"
  x-axis [0.5, 0.6, 0.7, 0.8, 0.9, 0.10]
  y-axis "seconds" 0 --> 60
  bar [22, 26, 31, 38, 29, 33]
  line [22, 26, 31, 38, 29, 33]
```

*A bar and line chart of one number over six releases.*
