# margent

Renders markdown docs into designed pages with data-driven islands, shipped as an npm CLI (`margent`), skills for any agent (`npx skills add`), and a thin Claude Code plugin.

**Status:** M1–M3 and M5 done; M6 (review feedback, F1–F6) released in 0.7.0; it closes after one real review round on that release (plan `docs/plans/m6-review-feedback.md`). 0.1.0 is the first public release (decision 0031): public repo `dvquy13/margent` with fresh history (the earlier history is the local tag `archive/pre-public`, never pushed), on npm as `margent`, releases through release-please. M4 Catalog is cut (decision 0034).

## Where to look

| Question | Read |
|---|---|
| What is the design? | `docs/design/system-design.md` |
| What is built right now? | `docs/architecture.md` |
| Why was this decided? | `docs/decisions/` (index in its `README.md`) |
| What does milestone N build, and how is it verified? | `docs/specs/` |
| What's the task order and progress? | `docs/plans/` (the open milestone's plan, Tracker at the top; deleted when the milestone closes) |
| Map of all docs with status | `docs/README.md` |

## Docs workflow

- Markdown is the source of truth. Renders are never committed.
- Where docs go and how to write them: `docs/README.md`. Read it before adding, moving or writing a doc.
- After a docs edit, `node dist/cli.js check docs/` must exit 0.
- Distilling a session into docs: use the `project-docs` skill.

## Commands

- `npm test`: builds, then runs the fast tier (about 30s, a target, not a gate) of `node --test`. Browser tests drive the installed Chrome (`channel: 'chrome'`), so there is no Playwright browser download.
- `npm run test:full`: every test, about 6 to 7 minutes, three test files at a time (decision 0030). Run it before merging a branch into `main` and before a release. A test joins it by passing `full` from `test/helpers/tier.mjs`; a new browser test gets `full` unless it is a feature's main path (decision 0027).
- `UPDATE_GOLDEN=1 npm test`: rewrites `test/golden/`. Review the diff before committing.
- `npm run typecheck`: esbuild does not type-check, so the build passes on type errors.

## Build and test gotchas

- Tests import the per-module bundles in `.build/` (`../.build/render/page.js`), never `src/`. Run `npm run build` (or `npm test`) after any `src/` edit, or tests run stale code.
- `dist/cli.js` is built, not committed (`.gitignore`). `npm run build` (or `npm test`) makes it, and `prepack` rebuilds it for `npm pack` and `npm publish`. Run a build before `node dist/cli.js …` after any `src/`, `shell/` or `runtime/` change: those files are bundled into it as `?raw` strings. Checking out a commit from before decision 0024 (when git tracked it) and back deletes it, and `npm link` then links no `margent` bin without saying so: rebuild, then relink.
- `test/scaffold.test.mjs` fails unless `package.json`, `.claude-plugin/plugin.json`, every `x.y.z` in `skills/` and `dist/cli.js --version` carry the same version. Bump them together.
- Pixel comparisons must block the Google Fonts hosts, or the same page differs between runs by up to 383k pixels. Use `scripts/accept/pixel-diff.mjs`.
- Close every `serve` server a test starts, even when the page fails to open (`t.after(() => served.close())` right after `serveCopy`). A leaked one keeps its test file's process alive, so `npm test` hangs with no failure shown. Leftover recursive `fs.watch` watchers in one process also make macOS deliver change events late or drop them.
- Editing tests drive real keyboard and mouse input. Setting `innerHTML` or `textContent` to simulate an edit doesn't test editing.
- Machine load makes the browser tests slow and flaky: several runs at once (parallel worktrees), or macOS background jobs, push the full tier's timing checks (A7, A8/A9 shots) past their limits. Judge a failure by rerunning that file alone (`MARGENT_TIER=full node --test test/{file}.test.mjs` for a full-tier test). A slow fast run needs no rerun.
- Leaked headless Chromes (parent PID 1, `--disable-field-trial-config` in the command line) from interrupted runs slow every later run. Find them with `ps -Ao pid,ppid,command | grep disable-field-trial-config`.
- A mouse drag that starts on link text becomes a link drag in Chrome, so no selection forms. Start a corpus `select` just before the link.
- A test that ends on a 409 must wait for the page's own reload before closing it: the stale path calls `location.reload()`, which the corpus's `margent.reload` stub doesn't cover, and closing mid-reload can hang Chrome and the whole run with no failure shown. Corpus waits are bounded and named (`bounded()` in `test/corpus.test.mjs`).
- macOS has no `timeout` command, so `timeout 300 node …` fails at once with "command not found". Bound a run with node's own limits or a `perl -e 'sleep N'` watchdog. `node --test --test-timeout` limits each whole test file, not each test.
- A served corpus case pins the note author to `Quy` (`author` in the case JSON), so expected files never depend on the machine's `git config user.name`.
- A guest script whose sha256 isn't in the page policy is blocked silently: the island never reports, and `check` says `did not report within 10s`. Every script a page or guest runs goes through `inlineScript` in `src/render/page.ts` (or is listed in its texts), and the guest inserts module text byte for byte.
- Chrome never applies `:hover` through a sandboxed frame. Island hover is the guest's `hover` message, which sets `data-hover`. A test that hovers an island needs a real mouse move into the frame.
- Tests read island content inside the frame (`islandFrame`, `islandFrameByName` in `test/helpers/browser.mjs`), never a `.island-mount` `shadowRoot`.
- `ChromeSession.evaluate` times out after 10s by default (`PAGE_TIMEOUT_MS`). Pass a timeout for a longer call, as `check`'s `report()` does with 20s.

## Releasing

- Commits on `main` use Conventional Commits: `feat:` (minor bump while 0.x), `fix:` (patch), `docs:`, `chore:`, `test:`, `ci:`, `refactor:`. Only `feat`, `fix`, `perf` and `docs` reach `CHANGELOG.md`. release-please reads every commit since the last release, including those inside a merged branch; with a squash merge the PR title is the commit, so give it a type.
- release-please (`.github/workflows/release.yml`) keeps a release PR open. Merging it tags `v{x.y.z}`, creates the GitHub Release, and publishes to npm with provenance through trusted publishing (no npm token). Run `npm run test:full` locally before merging it: CI runs only the fast tier. CI on the release PR, which the workflow's bot opens, waits as `action_required` until it is approved: `gh api -X POST repos/dvquy13/margent/actions/runs/{run id}/approve`, or Approve on the run's page.
- release-please bumps `package.json`, `package-lock.json`, `.claude-plugin/plugin.json` and every version between `x-release-please-start-version` and `x-release-please-end` in `skills/`. A new version string in a skill must sit inside those markers, one per line (the generic updater bumps only the first version on a line); `test/scaffold.test.mjs` enforces both. Tests never pin a literal version: use `VERSION` from `test/helpers/version.mjs`, and goldens store the generator line as `margent {version}`.
- The release PR merges on GitHub, so local `main` falls behind it. Run `git pull --rebase` on `main` right after, or the next local commits split from `origin/main` and release-please never sees them until they are rebased (`git rebase --rebase-merges origin/main` keeps local merge commits). Even then, release-please walks commits newest first by date and stops at the last release, so branch commits dated before that release's merge stay out of the changelog: add them to the release PR's `CHANGELOG.md` by hand.
- Publishing is its own job in `release.yml`. When it fails (the runner's Chrome is slow to start more often than locally), use "Re-run failed jobs": the release-please job's outputs carry over. To publish an existing tag whose publish never ran: `gh workflow run release.yml --ref main -f tag=v{x.y.z}`. A rerun of the whole workflow can't publish, since release-please only reports a release it just created.
- Never push the `archive/pre-public` tag, and never push with `--tags`: it holds private history.

## Plugin and skill

- Test the plugin from the repo with `claude --plugin-dir .` (headless: `claude -p "…" --plugin-dir …`). It loads the repo itself as `margent@inline` and replaces the installed copy for that session, so no reinstall is needed; run `npm run build` first if `src/` changed. A skill or command already used in a session is not reread: after editing one, start a new session. The skills call `margent` from PATH: run `npm link` in the repo once so it points at this checkout's `dist/cli.js`, and `npm run build` after `src/` changes.
- The installed plugin (`margent@margent`, from the directory marketplace `.`) is read in place from this checkout, not from `~/.claude/plugins/cache/margent/`: `claude plugin list` shows `Read from: /Users/dvq/frostmourne/margent`, and every new session on the machine loads the skills of whatever branch is checked out. No reinstall is needed after a change, only a new session. A skill change that lives only on another branch reaches no session until it is merged and `main` is checked out, so an unmerged rule looks shipped but isn't.
- `--allowedTools` takes several values, so a prompt after it is read as a tool name. Put the prompt right after `-p`.
- A headless `claude -p "/margent:docs-serve …"` never exits, because it waits on the server it started in the background. Read the URL from its output, then kill the session and the `cli.js serve` process.
- After editing `skills/margent/SKILL.md`, rerun `claude plugin eval` (cases in `evals/`). Keep "load it first" in the description: without it, "write a report as a doc" does not trigger the skill. The name `margent` says nothing about docs, so the description must name every trigger: without "address review comments", the review case fired 1 time in 3.
- `npx skills add` silently skips a skill whose frontmatter isn't strict YAML (an unquoted `: ` in a description), though Claude Code reads it. `test/scaffold.test.mjs` parses every skill strictly.
- Set `BROWSER=true` for headless runs that reach `margent open`, or each run opens a browser tab.
- The `docs-open`, `docs-serve` and `docs-review` skills are user-invoked (`disable-model-invocation: true`): `/margent:docs-open` through the plugin.

## Rules

- No silent fallbacks. Every error path exits non-zero with `{file}:{line}: {message}` (`RenderError`) and has a fixture proving it is loud.
- IDs like R3.1 or A6 in code and test names refer to the spec of the milestone that added the code: `docs/specs/m1-render-islands.md` for render, islands and the CLI, `docs/specs/m2-serve-edit.md` for `src/serve/` and `runtime/edit/`, and `docs/specs/m6-review-feedback.md` for F1 to F6. Never cite a plan's task IDs (T9) in code: plans are deleted when their milestone closes.
