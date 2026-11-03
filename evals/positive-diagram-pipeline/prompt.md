---
name: positive-diagram-pipeline
tags: [trigger, diagram]
allowed_tools: [Read, Glob, Grep, Skill]
---

Draft a design note for our new ingestion pipeline, for docs/design/ingestion.md. Events arrive from three sources (webhooks, a nightly CSV import and the public API). Each event is validated, deduplicated, enriched with account data and written to the warehouse. A rejected event goes to a dead-letter queue that the on-call engineer reviews each morning. Cover what changes, the options we considered and the decision. Don't write any files: show me the full markdown in your reply.
