# docs

Where each kind of doc lives, the rules for writing them, and the status of every doc. Read this before adding, moving or writing a doc.

## Where each kind of doc lives

| Kind | Location | Format |
|---|---|---|
| System design (whole system, why) | `docs/design/{name}.md` | living, versioned via frontmatter `version` |
| As-built architecture | `docs/architecture.md` | describes only what exists in code |
| Decisions | `docs/decisions/{NNNN}-{slug}.md` | one decision per file, append-only |
| Specs (one milestone, testable) | `docs/specs/{milestone}-{slug}.md` | |
| Plans (task order) | `docs/plans/{milestone}-{slug}.md` | Tracker section at the top. Delete when the milestone closes, once its contracts are in `architecture.md` and its outcomes in the spec's Results; git history keeps it |
| Diagrams | `docs/assets/{name}.svg` | standalone SVG, see Diagrams |
| Doc islands | `docs/islands/{name}.island.js` | island modules used by the docs in `docs/` |

If a fact fits two homes, put it in one and link from the other. Don't duplicate it.

## Frontmatter

Every doc in `docs/` (except READMEs) starts with:

```yaml
---
title: {Title}
status: draft | accepted | superseded | done
updated: {YYYY-MM-DD}
---
```

Update `updated:` on every content change, and keep `docs/README.md`'s table in sync when adding, renaming or changing the status of a doc.

## Decisions

- Number sequentially and never reuse a number. Filenames are `{NNNN}-{kebab-slug}.md`.
- Sections: Context, Decision, Consequences, Alternatives considered.
- Never rewrite an accepted decision. To change one, write a new record with `supersedes: {NNNN}`, and set the old one's status to `superseded` with `superseded_by: {NNNN}`.
- Deferred questions are listed in `docs/decisions/README.md` under "Deferred" until decided.

## Writing

- No angle-bracket placeholders (`<name>`) in markdown. Use `{name}`.
- Write em-dashes without spaces around them, and sparingly.

## Renders

- Renders are not committed (decision [0015](decisions/0015-renders-are-never-committed.md)). Make one to read it: `margent open docs/{path}.md` (in this repo, `node dist/cli.js open docs/{path}.md`).
- Check that every doc renders: `margent check docs/` (in this repo, `node dist/cli.js check docs/`). It must exit 0 after any docs edit.
- Don't add generated `.html` renders to git.

## Diagrams

- Each SVG is standalone: `xmlns`, `class="mg-d"`, `data-asset="{name}.svg"`, `role="img"`, an `aria-label` stating its claim, and an embedded `<style>`. Copy the `<style>` from an existing asset.
- Colors use `var(--page-token, var(--d-fallback))`. Standalone (GitHub, image viewers), the `--d-*` fallbacks apply, including a dark-mode media query. Inlined into a rendered page, the page's tokens win, so the page's theme switch works.
- A doc references a diagram as an image, followed by an italic caption line:

```markdown
![{aria-label}](../assets/{name}.svg)

*{Caption: what the reader should take from the diagram.}*
```

## Status

| Doc | Status | Updated |
|---|---|---|
| [design/system-design.md](design/system-design.md) | draft v0 | 2026-10-25 |
| [architecture.md](architecture.md) | accepted | 2026-10-25 |
| [decisions/](decisions/README.md) | 34 accepted, 3 superseded | 2026-10-25 |
| [specs/m1-render-islands.md](specs/m1-render-islands.md) | done | 2026-10-25 |
| [specs/m2-serve-edit.md](specs/m2-serve-edit.md) | done | 2026-10-25 |
| [specs/m3-comments.md](specs/m3-comments.md) | done | 2026-10-25 |
| [specs/m5-ship.md](specs/m5-ship.md) | done | 2026-10-25 |
