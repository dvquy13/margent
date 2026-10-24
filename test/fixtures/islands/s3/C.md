## Verdicts at a glance

<!-- island spike-verdicts -->
| Spike | Question | Verdict | What it changed |
|---|---|---|---|
| S1 Parser | Can islands be read from plain Markdown tables, with no extra syntax? | Proceed, Adjust per island | Tables are the data. An island with no table falls back to plain text. |
| S2 Sandbox | Can island code run without touching the page around it? | Proceed, Adjust policy | Sandboxed frames with a hash-based script policy. Node never runs island code. |
| S3 CI cost | What does a month of CI cost at the release rate? | Proceed | \$3.87 average, \$5.88 peak, under the \$10 cap. Free runners only, no paid tier. |
| S4 Versions | Do page versions stay stable across rebuilds? | Proceed, three Adjusts | Goldens for every page, a version in every build, a changelog file. Spread only for islands with a schema. |
| S5 Plumbing | Can `render` run with no server? | Proceed, Adjust watching | Build runs without a server. Watch mode rebuilds after a 300 ms pause. |
| S6 Backtest | Does `doctor` flag a broken island before a release? | Adjust | `doctor` replays the example docs, with broken ones, and measures false alarms. |
| S7 Agent trust | Can the agent be confined to its tools and a scoped role? | Proceed, Adjust env | The sandbox strips secrets from its environment before the agent starts. |
| S8–S10 Templates | Which template and fonts does each page kind use? | Decided | Every page kind on the same shell through one stylesheet. |
