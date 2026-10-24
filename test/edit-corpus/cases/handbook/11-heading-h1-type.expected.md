---
title: margent maintainer handbook
status: draft
version: 0.1.0
updated: 2026-10-25
---

# margent maintainer handbook notes

This handbook covers how **margent** is built, released and reviewed. It is for the people who change the renderer, the islands runtime and the skills, and it assumes you have read [the block kinds page](extra-kinds.md) once. Read it *in order* the first time, then use the sections as a reference. The project needs [Node.js](https://nodejs.org/) 22 or later, and every command below runs from the repository root.

## 1. Architecture

margent is one loop with one source. The markdown file is the doc, and every page is rebuilt from it on each run. Nothing rendered is ever committed, because the page cache lives outside the repository.

Three stages. The renderer turns markdown into a page. The islands runtime draws each data-driven visual in its own frame. The server reloads the page on change and saves edits from the browser back into the file.

### Module map

The codebase splits into five parts, and each one owns a single job. The tests import the bundles built from these parts, so a stale build tests old code.

- **render**: turns a markdown file into a page, with its islands and shell
- **islands**: the contract, the schema check and the sandboxed frame runtime
- `serve`: a local server that reloads pages and saves edits to the markdown
- **shell**: the page chrome, the table of contents and the theme toggle
- `doctor`: checks that Chrome, the browser opener and the cache work on this machine

![Markdown renders into a page, a reader reviews the page, and comments and edits go back into the markdown.](assets/margent-loop.svg)

*The loop has one source. A page is never edited by hand, so every change starts in the file.*

### Runtime limits

Islands run in sandboxed frames with no network and no access to the page. A broken module shows its error in its own box and nowhere else.

> Island code never runs in Node, so a bad module cannot crash the server.
> Its only output is pixels inside its frame, and its only input is the data in the table.

## 2. Release process

A release is cut from `main` and from nothing else. The version lives in several files, and a scaffold test fails when they disagree. Publishing is manual, so the maintainer runs each step in order and stops at the first failure.

1. Run the full tier with `npm run test:full` and wait for it to pass.
2. Bump the version in `package.json`, the plugin manifest and every skill, all in one commit.
3. Run **npm pack --dry-run** and check the file list against the package contents.
4. Tag the commit with the new version and push the tag to the remote.
5. Run `npm publish` from a clean tree, then check the package page.

If a step fails, fix the cause and start again from step one. A partial release leaves a version number on the registry that nobody can reuse.

## 3. Reviewing changes

Every change gets a review before it lands on `main`. The reviewer reads the diff, runs the commands in the table, and opens the page when the change touches what the reader sees.

| Command | What it runs | When |
|---|---|---|
| `npm test` | a build, then the fast tier | after every change |
| `npm run test:full` | every test, 4 to 9 minutes | before a merge or a release |
| `npm run typecheck` | a type check, which esbuild skips | before a merge |
| `UPDATE_GOLDEN=1 npm test` | rewrites the golden files | after an intended output change |
| `node dist/cli.js check docs/` | renders every doc and runs its islands | after a docs edit |

Rebuild before any command that reads `src/`. A stale build runs old code without an error, so the output looks plausible and is wrong.

```sh
npm run build
node dist/cli.js check docs/
node dist/cli.js open docs/handbook.md
```

A golden file records what the renderer produced for a fixed input. Review its diff line by line before you commit it, because it is the only record of the change.

> A golden diff is a claim about the output.
> Read it as a claim, and reject the change when the claim is wrong.

## 4. Milestone status

Milestones run in order, and each one closes with an acceptance record in the results folder. The board below is read from the table, so a verdict edit in the table also changes the tally. Verdicts are one of four kinds, and a milestone can carry more than one.

<!-- island milestone-status -->
| Milestone | Outcome | Verdict |
|---|---|---|
| M1 Render and islands | Pages render with islands in a sandboxed frame | Proceed |
| M2 Serve and edit | Blocks edit in the page and save to the markdown | Proceed |
| M3 Comments | Review comments live inline in the markdown | Proceed, Adjust the rail layout |
| M4 Catalog | Waits for the first public release | Decided to wait for the release |
| M5 Ship | Local checks pass, the publish steps are still open | Adjust the publish steps |

*The renderer and the editor shipped as planned. The release is the open item, and the catalog waits for it.*

A doc carries one status in its frontmatter. The values are fixed, so the page header reads the same everywhere.

| Status | Meaning |
|---|---|
| draft | still changing, not yet reviewed |
| accepted | reviewed, and the plan of record |
| done | shipped and kept for reference |

## 5. Troubleshooting

### Leaked Chrome

Interrupted test runs can leave headless Chrome processes behind. Each one slows every later run, so look for them after an interrupted run. A leaked process has PID 1 as its parent and the flag `--disable-field-trial-config` on its command line, and it is safe to kill.

### Failing islands

A failing `check` names the island's file and line. Read the message, fix the source it points at, and run `check` again. Do not delete the island marker to make the error go away, because the marker is what ties the table to its visual.

### Stale output

When a page looks wrong after a code change, rebuild first and render again before you debug anything else. Most stale-output reports end at a missing build step, not at a bug in the renderer.

## 6. Ownership

Each part of the codebase has one maintainer at a time, and the maintainer answers for its tests. A change that crosses two parts names both owners in the pull request. That habit keeps the review short, because the reviewer knows which tests to run and which golden files to read.

Ownership moves with the work, not with the calendar. When a maintainer steps away from a part, they write down the open questions in the milestone plan, so the next person starts from a list instead of from memory. The plan is deleted when the milestone closes, so anything worth keeping moves into the decisions folder first.

Decisions are numbered and never reused. A decision that no longer holds gets a new record that supersedes it, and the old record stays in place. That rule means a reader can always see why the code looks the way it does, even after the reasons have changed.
