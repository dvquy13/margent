---
name: margent
description: 'Write and edit markdown docs that render into designed pages, and add data-driven visuals ("islands") whose data stays in the markdown. Use when asked to write or edit a doc, report, spec or design note, or to address review comments in one (load it first, before gathering content: it sets the format and workflow), when adding a chart, board or other visual to a doc, or when previewing or checking docs with margent, or to set up or remove margent in a project.'
---

# margent

The markdown file is the doc. `margent` renders it into a designed page with a table of contents, theme toggle and inline diagrams. Renders live in a cache outside the repo and are rebuilt on every run, so there is never an HTML file to keep in sync. Never write, edit or read a rendered `.html`: read and edit the `.md`.

## Running margent

<!-- x-release-please-start-version -->
Run `margent --version` once. If it prints `0.6.0`, run every command below as `margent …`.

Otherwise run them as `npx -y margent@0.6.0 …`. It needs Node 22 or later, and the first call downloads the package. Don't install anything globally unless the user asks.
<!-- x-release-please-end -->

The rest of this skill writes `margent` for whichever form applies.

If a margent command fails for an environment reason (Chrome not found, no browser opener, cache not writable), run `margent doctor` and show the user its `fail` lines. It also runs a sample island in its frame, so it shows whether islands render on this machine.

## Workflow

1. Write or edit the `.md`.
2. Run `margent check {file or folder}`. It renders in memory, runs every island headless at phone (390px) and desktop widths, and prints one `file:line: message` per problem, including a link to a missing file or heading and an island whose content spills outside its box. Fix each one in the source. A clean run prints `ok {n} docs, {m} islands`.
3. Run `margent open {file}` to show the user the page. It renders the file and every doc it links to, opens the browser, and prints the page path.

`margent export {path} --out {dir}` writes standalone pages for sending to someone. Add `--clean` to strip review comments, and `--md` to write markdown files instead of pages (with `--clean`, island markup goes too).

`margent serve {docs root}` (also the `docs-serve` skill: `/docs-serve`, or `/margent:docs-serve` through the plugin) is how the user reviews and edits docs: it serves every page, reloads it when the `.md` changes, and lets the user edit blocks in the page, which writes the `.md`. While docs are served, the user may have changed a file since you last read it, so read the `.md` again before every edit.

## Projects

Before the first doc you write or edit in a repository during a session, run `margent init {doc path}`. It adds a short margent block to the nearest `AGENTS.md` or `CLAUDE.md` (creating `AGENTS.md` at the git root when neither exists), so a colleague's agent keeps comment markup intact and runs `check`. When it prints `added` or `updated`, tell the user in one line which file changed. Say nothing on `unchanged`. If it says the folder is not in a git repository, skip it and carry on. When the user asks to set up margent in a project, run `margent init {docs folder}` and report the file.

When the user asks to remove margent from a project or stop using it there, run `margent teardown {docs folder}` without asking, once for each docs folder, and report the files it changed or deleted. It removes only the nearest block, so a monorepo's root block stays for the other packages. It doesn't touch the docs. To strip review comments from a copy, use `margent export … --clean`.

Never edit the margent block by hand. Run `init` again instead.

## Doc format

```md
---
title: M0 report
status: draft
updated: 2026-10-23
---

# M0 report

One or two paragraphs that say what this doc is and what it concludes.

## Verdicts at a glance

Prose, lists, tables, code. Each `##` becomes a section and a table-of-contents entry.

![Pipeline in three stages: ingest, know, act.](../assets/pipeline.svg)

*Legend or claim for the diagram, as an italic line right after the image.*
```

- Frontmatter `title`, `status`, `updated` and `version` go to the page header. Write dates as `YYYY-MM-DD`.
- One `#` title. Sections are `##`. Use `###` inside a section when it really has parts.
- A local `.svg` image is inlined so it follows the theme. Style it with the page tokens (`var(--text)`, `var(--accent)`, ...) with fallbacks.
- Link other docs with relative `.md` links (`[eval setup](../evals/eval-setup.md#gold-labels)`). The renderer points them at the rendered page.
- Escape a literal dollar sign as `\$`.

## When a diagram earns its place

Before writing a spec, design note or report, list the structures it describes. Draw one SVG diagram for each structure the reader would otherwise rebuild in their head from prose:

- parts and the boundaries between them: components, processes, trust or ownership lines
- a flow: a pipeline, a request path, a sequence of messages across processes
- states and the transitions between them

A doc that adds or changes one of these gets the diagram, placed before the prose that walks through it. Skip it when the structure is a short list of steps or has two parts. Put the file in an `assets/` folder at the top of the docs tree unless the project's docs say otherwise, and give it the same caption test as an island: one italic sentence stating what the reader should take from it.

## When an island earns its place

An island is a small JS module that draws a visual from data that stays in the markdown, usually a table that is already in the doc. Build one only when the visual shows something the reader can't see at a glance in the table or prose:

- a computed view: a tally, totals, shares, a ranking, a gauge against a limit
- a shape: a flow, a timeline, stages, depth across milestones
- a comparison across many rows that a table makes the reader do in their head

Stay with prose or a plain table when the table is short and reads fine, when the visual would only restyle the cells (pills and colors on the same grid), when the point is one number, or when the visual would need facts that are not in the doc. A static structure that never changes with the data is an SVG diagram, not an island.

Test it first: write the caption, one italic sentence stating the claim the visual makes. If you can't write that sentence, don't build the island.

## Adding an island

1. Read [references/island-contract.md](references/island-contract.md) before writing any module. It is the full contract: data forms, module shape, schema, column patterns, kit API and rules.
2. Choose the backing. Default to a table: put `<!-- island {name} -->` on the line directly above an existing table, and leave the table's wording alone. Use a YAML fence only for nested data with no table shape.
3. Design it. If a design skill such as `/design-principles` is available, load it and follow it. Otherwise read [references/design-guide.md](references/design-guide.md).
4. Write `islands/{name}.island.js`. Islands are found by walking up from the doc's folder, and the topmost folder that holds `islands/` is the docs root. For a project's first island, create `islands/` at the top of the docs tree (for example `docs/islands/`), so every doc below it can use it.
5. For every column whose wording the module parses (a cost like `\$1.58 (41%)`, a verdict like `Proceed, Adjust judge`), declare a pattern in the schema. A cell that stops matching then shows a warning badge and fails `check`, so a reworded cell is never silently dropped.
6. Put the caption, an italic line stating the claim, right after the table.
7. Run `margent check` until it is clean, then `margent open`.

Rules that keep the markdown the source of truth:

- **Primary facts only in the data.** Totals, shares and counts are computed by the module, so they can't contradict each other.
- **No display config in the data.** Tones, glyphs, colors and category labels live in the module.
- **Interpretation lives in the prose and caption,** where it reads as the author's framing.
- **Never put a fact only in the module.** Every number and name the island shows comes from the markdown.

## Comments

Review comments live in the `.md` as inline CriticMarkup, so they sit next to the text they are about. The user adds them in a served page, and you may add one to ask the user something.

```md
The filter keeps {==96% of GitHub issues==}{>>[c3] Quy: is that stable across repos?<<}

| Spike | Verdict |
|---|---|
| S3 | Proceed |

{>>[c4] Quy: S1 is missing from this table.<<}
```

- A note is `{>>[c{n}] {author}: {text}<<}`: one line of plain text in the source. Write `<br>` for a line break inside a note. Notes with the same ID, written directly after each other, are one thread.
- A thread right after `{==highlighted text==}` is about that text. A thread alone on its own line is about the block above it: this is how tables, code, islands and figures take comments. Never put comment markup inside a table cell or island YAML.
- A comment about words in a paragraph, heading or list item highlights those words, so the page marks them. Keep a thread on its own line for tables, code, islands and figures, and for a remark about a whole block.
- A block comment line may start with the phrase it is about: `{>>[c5] Quy: "Proceed" → is this still right?<<}`. The phrase is the text as the page shows it, with no markdown (no backticks, `**` or `|`), and it must appear in that block, or `margent check` fails. `margent comments` prints the phrase in the thread's head.
- Sign your notes as `Claude`, exactly. A new thread takes the ID one above the highest in the file.

When asked to address comments (or `/docs-review`):

1. Run `margent comments {file or folder}`. It lists each thread with its `file:line`, its notes, and whether it `needs agent` or `needs you`. Work only on threads that need the agent.
2. Read the `.md` again before every edit: the user may have added a comment in the page since you last read it.
3. When a comment asks for a change you can make exactly as asked, make it, then append a `{>>[c{n}] Claude: …<<}` note directly after the thread's last note, with the same ID, saying in one line what you changed and where ("Reworded to X in the second sentence"). Leave the thread open: the user resolves it after reading your note, and that is how they see what you did.
4. When it asks a question, needs a judgment call, or you disagree or need the user, append the same kind of note with your answer or question, and leave the thread open.
5. Run `margent check` on what you changed, then `margent comments` again, and report how many threads still need the agent and how many need the user.

## Errors

Every error is `file:line: message`, and the command exits 1. `open`, `export` and `serve` don't fail on a broken island: the island's box shows the error, and `check` is the command that fails on it. Fix the source it points at. Don't work around an error by deleting the island marker or loosening a pattern unless the user agrees that the change is right.
