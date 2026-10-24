---
title: M1 spec · Render and islands
status: done
updated: 2026-10-25
---

# M1 spec · Render and islands

M1 makes a markdown doc render into a designed page with no LLM involved, and gives agents a way to add bespoke visuals (islands) whose data stays in the markdown. It ends the double edit: after M1, changing a doc means changing its `.md` only. Editing in the page (M2), comments (M3), the catalog (M4) and publishing (M5) build on it.

Design: `docs/design/system-design.md`, sections 05–07, 10 and 13. Island contract v1 is defined in the M0 spike plan ("Island contract v1") and amended below. Evidence: spikes S0 to S4 (pre-public archive).

## Scope

**In**

1. **Renderer:** markdown to a complete HTML page with the house shell. Deterministic.
2. **Islands:** the table-backed and YAML-backed forms, contract v1, the kit, and the Shadow DOM host.
3. **CLI:** `agent-docs open`, `agent-docs check`, `agent-docs export`.
4. **Agent side**, as a Claude Code plugin installed from the local path: the `agent-docs` skill, the HTML-read hook, and the `/docs-open` command.
5. **Dogfood:** the first user's `m0-report.md` renders from markdown alone, with two islands.

**Out** (later milestones)

- `serve`, live reload, in-page editing (M2).
- Comments and `export --md --clean` (M3).
- The shared catalog and island promotion (M4).
- The iframe sandbox, folder trust, npm publish, the public marketplace, `doctor` (M5).
- Migrating the first user's `render-doc` skill and `check_docs.py`. That is a follow-up in the first user's repo once M1 is accepted.

## Decisions for M1

Recorded as decisions:

- [0008 Island isolation: sandbox-ready contract now, sandboxed iframe at M5](../decisions/0008-island-isolation-sandbox-ready-now-iframe-at-m5.md)
- [0009 TypeScript CLI bundled into one dist/cli.js; kit and host as plain browser JS](../decisions/0009-typescript-cli-bundled-into-one-file.md)
- [0010 node:test, golden files and playwright-core on installed Chrome](../decisions/0010-node-test-golden-files-playwright-core.md)
- [0011 markdown-it with GFM tables and markdown-it-front-matter](../decisions/0011-markdown-it-for-parsing.md)
- [0012 `open` renders into the user cache, never the repo](../decisions/0012-open-renders-into-user-cache.md)
- [0013 Docs root is the nearest ancestor containing islands/](../decisions/0013-docs-root-is-nearest-islands-ancestor.md)

## Requirements

### R1 Renderer

1. **Frontmatter:** `title`, `status`, `updated` and `version` (when present) go to the header meta line. A file without frontmatter uses its first `#` heading as the title. Frontmatter is never rendered as content.
2. **Headings:** `#` becomes the title block and gets a slug `id` too, so `[x](#title)` links land. Each `##` becomes a `<section>` with a slug `id`, and gets an entry in the table of contents. Duplicate slugs get `-2`, `-3`.
3. **Source maps:** every top-level block gets `data-src="{start}-{end}"` (1-based, inclusive source lines, counted in the original file including frontmatter). M2 depends on this.
4. **Links:** a relative link to a `.md` becomes the matching `.html`, keeping the `#anchor`. Links to anything else are left alone.
5. **Images:** a local `.svg` image is inlined (its `<svg>` element verbatim, wrapped in `<figure>`), and the italic line right after it becomes the `<figcaption>`. This keeps the first user's diagrams themeable. Other images stay `<img>`, with the path rewritten relative to the output.
6. **Determinism:** the same inputs give the same bytes. No timestamps in the output except the frontmatter's `updated`.
7. **Errors:** a broken input exits non-zero with `{file}:{line}: {message}`. Broken inputs are: an island marker not followed by a table, invalid YAML, a missing module, an unreadable image, or a schema violation. Nothing is skipped silently.

### R2 House shell

1. **Built once with `/design-principles`,** starting from the first user's current shell, so their docs keep their look.
2. **Tokens:** every token in contract v1, including `--amber` and `--red`, defined for light and dark. Dark mode applies under `prefers-color-scheme` and under `data-theme`, with a header toggle.
3. **Phone width:** at 390px there is no horizontal page scroll, and wide tables and figures scroll inside their own box.
4. **Footer:** `Rendered from {md path}`.
5. **Location:** the shell lives in `shell/` as `shell.html` (with a `{{main}}`-style slot) plus `shell.css`. It is the only place page-level design lives.

### R3 Islands

Contract v1 as in the M0 spike plan, with these amendments from S3 and S4:

1. **Column patterns.** A table-backed island's `schema` can declare `columns: { {key}: { pattern: "{regex}" } }`. The runtime tests every cell of a declared column.
   - **On a mismatch:** the cell still reaches the module as written. The island shows a warning badge listing each mismatched cell (row and column), and `agent-docs check` fails with `{file}:{line}: island {name}: cell "{text}" does not match {key} pattern`.
   - **Undeclared columns** are not checked.
2. **Self-contained modules.** A module is a single file with no `import`. The runtime wraps it as a classic script and reads `contract`, `schema` and `default` from it.
3. **Stylesheet:** the runtime adopts the kit stylesheet with `adoptedStyleSheets`; it never inserts it into the root.
4. **Column keys:** lowercase, every run of characters outside `[\p{L}\p{N}]` becomes `_`, and leading and trailing `_` are trimmed.
5. **Lookup:** walk up from the doc's folder to the docs root, using the first `islands/{name}.island.js` found. If two candidates exist at the same level, that is an error.
6. **Fallback:** a table-backed island keeps its table as light-DOM content inside the host element. It shows when JS is off or the module fails, and it is what print uses (`@media print` hides the shadow content and shows the table).
7. **Module errors:** a module that throws shows a red error box with the message inside the island, plus the fallback table. `check` also runs every module headless and fails on a throw.
8. **Kit:** port the S4 kit module, keeping the API in contract v1 exactly: `tokens`, `onTheme`, `md`, `esc`, `fmt.usd/pct/num`, `tone`.

### R4 CLI

| Command | Behavior |
|---|---|
| `agent-docs open {file}` | Renders `{file}` and every `.md` it links to, recursively within the docs root, into the cache. Opens the page in the default browser and prints its path. Fails on any render error, before opening anything. |
| `agent-docs check {path}` | Renders a file or every `.md` under a folder in memory, and runs every island headless (schema, column patterns, throws). Prints one line per problem and exits 1 if there are any. Exits 0 with `ok {n} docs, {m} islands` otherwise. |
| `agent-docs export {path} --out {dir}` | Same as `open` without opening a browser, writing to `{dir}`. The output opens from `file://`. |
| `agent-docs --version` | Prints the version, which is also stamped into every rendered page's `<meta name="generator">`. |

`check` must finish in under 2 seconds for the first user's `docs/` when Chrome is already installed. If it doesn't, the headless island run is split out behind `--islands` and the slowdown is reported in this spec's results.

### R5 Agent side (plugin)

1. **Layout** as in design section 13: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` with source `"."`, `skills/agent-docs/`, `hooks/hooks.json`, `commands/docs-open.md` and `bin/agent-docs`.
2. **Install:** `claude plugin install agent-docs --marketplace {agent-docs checkout}` installs it for the user. After `/reload-plugins`, the Bash tool can run `agent-docs`.
3. **Skill `agent-docs`**: a description of no more than 400 characters. The body covers the doc format (design 05), when an island earns its place and when prose or a plain table is enough, contract v1 and its rules as a reference file, the workflow (write md, `agent-docs check`, `agent-docs open`), and a distilled design guide as a reference file. If a design skill such as `/design-principles` is available, the skill says to use it.
4. **Hook:** a PreToolUse hook on `Read`, and on `Bash` commands that read a file (`cat`, `head`, `sed -n`, `grep` on a single file). If the target `.html` has a sibling `.md` with the same base name, the hook denies the call with: `{file} is a render of {md}. Read {md} instead.` Everything else passes. It is a standalone Node script with no dependencies.
5. **`/docs-open {file}`** runs `agent-docs open {file}` and reports the path.

### R6 Dogfood: the first user's m0-report

On a branch of the first user's repo (`m1/agent-docs-dogfood`), with no file there changed except as listed:

1. **Add `docs/islands/spike-verdicts.island.js`** (S3's C module, updated to R3), and the marker line above the "Verdicts at a glance" table in the first user's `m0-report.md`.
2. **One new island, built through the skill.** A fresh session with only the plugin installed is asked to "add an island for the Problems we hit table in m0-report". That is the test that the skill works without hand briefing. The lead does not edit the island it produces. If it needs fixing, the fix goes into the skill, and the request is run again.
3. **Nothing else in the first user's repo changes:** no CLAUDE.md edit, no config file, no gitignore entry.

## Acceptance

Each item is checked by a test or a recorded run. All must pass.

| # | Check | How |
|---|---|---|
| A1 | `agent-docs open {m0-report.md}` in the first user's repo opens the page with zero console errors, and every word in the markdown appears in the page text. | Playwright, plus a text-coverage script |
| A2 | Both islands render. The Problems island was produced by the skill in a fresh session, with no edits by the lead. | Playwright, plus the session transcript |
| A3 | Rendering the same input twice gives identical bytes. | Unit test, plus a `cmp` of two `export` runs |
| A4 | Changing a verdict cell in the md changes the island on the next `open`, with no LLM call. | Playwright |
| A5 | Rewording a pattern-checked cell shows the warning badge, and `check` exits 1 with `file:line`. | Playwright and CLI test |
| A6 | Invalid YAML, a missing module, a marker with no table, and a module that throws each exit 1 with `file:line`. | CLI tests, one fixture each |
| A7 | With JavaScript disabled, a table-backed island shows its original table. | Playwright with JS off |
| A8 | At 390px wide, light and dark, there is no horizontal page scroll. The theme toggle restyles the page and both islands. | Playwright screenshots, reviewed by the lead |
| A9 | The first user's SVG diagrams in `system-design.md` render inline and follow the theme. | Playwright on `system-design.md` |
| A10 | Every `.md` link in m0-report opens its rendered target, and anchors land. | Playwright link walk |
| A11 | The hook denies `Read` on `m0-report.html` with the message, and allows `Read` on `m0-report.md` and on an `.html` with no sibling `.md`. | Hook unit test with Claude Code hook JSON input |
| A12 | The skill triggers for "write a report on X as a doc" and "add a visual to this doc", and does not trigger for "fix this failing test". | `claude plugin eval`, 3 positive and 3 negative cases |
| A13 | The plugin installs with one command from the local path, and `agent-docs --version` runs in a Claude Code session. | Recorded run |
| A14 | `check` on the first user's `docs/` exits 0 and meets the 2-second budget, or the split is recorded per R4. | CLI timing |

## Risks for M1

- **The skill's island quality without hand briefing.** S1 and S3 briefed agents by hand, and A2 tests the unbriefed case. If the island is weak, iterate on the skill text, not the island.
- **Headless `check` is slow.** If launching Chrome dominates, R4 lets the island run move behind a flag.
- **The YAML path is still untested,** because m0-report has no nested data. A fixture covers parsing, and a real nested visual waits for the first doc that needs one.
- **The hook misses Bash reads.** Only common commands are matched. A miss costs tokens, not correctness, so the list grows from observed misses.

## Results

Run on 2026-10-24, on the first user's branch `m1/agent-docs-dogfood`. `npm test`: 124 of 124 pass. Evidence is in the pre-public archive.

| # | Outcome | Evidence |
|---|---|---|
| A1 | Pass. `ok 1083 words` on m0-report, zero console errors. | `scripts/accept/text-coverage.mjs`; test `A1 text-coverage …` |
| A2 | Pass on the second run. Both islands render at 1280px and 390px. `problems-hit` came from a fresh session with no edits by the lead. | pre-public archive |
| A3 | Pass. Two exports of `system-design.md` and the 16 docs it links to are byte-identical. | test `export output is byte-identical … (A3)` |
| A4 | Pass on the real report. Changing S3 from Proceed to Adjust moved the island from 6 Proceed, 6 Adjust to 5 and 7. | test `A4 a verdict cell edited …` |
| A5 | Pass. | tests `A5: in Chrome the mismatched island shows its badge …`, `check: a pattern mismatch (A5) …` |
| A6 | Pass, with one fixture per case plus imports, schema errors and malformed markers. | `test/islands.test.mjs`, `A6: …` tests |
| A7 | Pass. | test `A7: with JavaScript off …` |
| A8 | Pass. No horizontal scroll at 390px or 1280px in light, toggled dark and system dark, and the toggle restyles both islands. The lead reviewed the screenshots. | pre-public archive |
| A9 | Pass. All 10 inline SVG diagrams restyle on toggle. | pre-public archive |
| A10 | Pass. `ok 17 links` on m0-report. | `scripts/accept/link-walk.mjs`; `A10 …` tests |
| A11 | Pass. The live run in the first user's repo blocked a real `Read` of `system-design.html`. | `test/hook.test.mjs`, pre-public archive |
| A12 | Pass, 18 of 18 (6 cases, 3 runs each). Always-on cost is about 170 tokens. | `evals/`, `a12-context-cost.txt` |
| A13 | Pass. | pre-public archive |
| A14 | Pass. `check` on the first user's `docs/` (34 docs, 2 islands) takes 1.08 to 1.22s warm over 5 runs, so there is no `--islands` split. The first cold run after install took 2.09s, which was all Chrome launch. | CLI timing, this section |

### What differed from the spec

- **The first unbriefed run (R6.2) overflowed at 390px.** The session followed the workflow, but nothing checked phone width. The fix went into the tooling, not the island: `check` now fails when an island's content overflows its box at 390px or 1280px, which enforces the contract's "draws only inside its own box" rule. The skill now says `check` tests both widths. The second run passed.
- **The skill description needed "load it first".** Without that phrase, "write a report as a doc" did not trigger the skill.
- **A local-path plugin install runs from a cached copy.** Edits in the repo don't reach new sessions, and `claude plugin update` reports nothing to do at the same version. Reinstalling (`uninstall`, then `install`) refreshes the copy.
- **The title gets a slug `id`** (R1.2), so `[x](#title)` links land. A `##` with the same text as the title gets `-2`.
- **The first user dropped its hand-made render of m0-report** (user decision, beyond R6.3). Its `m0-report.html` and its `rendered:` field are gone, and its `docs/README.md` row has no html link. agent-docs renders the page instead.
