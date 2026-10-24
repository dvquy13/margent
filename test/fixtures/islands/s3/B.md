## 13 Milestones

Each milestone ships something that runs end to end; later ones add depth.

<!-- island milestone-depth -->
| M | Scope | Done when |
|---|---|---|
| M1 | Markdown to designed pages, islands in sandboxed frames, the CLI, figures. No cache: every render rebuilds from the source | `margent render` builds the example docs in one run, and every island reports within 10 seconds. |
| M2 | Serve and edit in the browser, save back to the source | An edit saved in the browser round-trips to the same Markdown bytes, in 100 tries. |
| M3 | Review comments, anchored notes, highlights | A comment written in the browser survives 3 re-renders with its anchor. |
| M4 | Catalog of islands, search, a gallery page | A reader finds 10 islands by name from the gallery page. |
| M5 | Ship: sandbox policy, doctor, the README and the agents section | The first release builds on a clean machine, and `margent doctor` passes. |
