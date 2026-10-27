# margent

margent renders markdown docs into designed pages. Data-driven visuals ("islands", such as charts and boards) keep their data in the markdown, so the source stays the single copy. Review comments written in the page are saved back into the `.md`. Agents write the markdown; people read and review the rendered page.

## Install

Each skill calls the CLI and falls back to `npx -y margent@{version}` when `margent` isn't installed.

CLI:

```sh
npm i -g margent
```

No install: `npx -y margent {command}`.

Skills for any agent (Claude Code, Codex, Cursor, Copilot, Gemini CLI, OpenCode and more):

```sh
npx skills add dvquy13/margent
```

Claude Code plugin:

```
/plugin marketplace add dvquy13/margent
/plugin install margent
```

## For agents

When someone tells you "Install github.com/dvquy13/margent", do this:

1. Install the CLI:

   ```sh
   npm i -g margent
   ```

   Or skip the install and run `npx -y margent` in place of `margent` below.

2. Install the skills for the agent you are, with `{agent}` set to its name (for example `claude-code` or `codex`):

   ```sh
   npx skills add dvquy13/margent -g -y --agent {agent}
   ```

   In Claude Code, use the plugin instead: `/plugin marketplace add dvquy13/margent`, then `/plugin install margent`.

3. Check the machine, and report every `fail` line to the user:

   ```sh
   margent doctor
   ```

4. Show the user a doc:

   ```sh
   margent open README.md
   ```

## Commands

| Command | What it does |
|---|---|
| `margent open {file}` | Renders the file and every doc it links to, opens the browser, and prints the page path. |
| `margent check {path}` | Renders in memory, checks every local link and heading anchor, and runs every island headless at phone and desktop widths. Prints one `file:line: message` per problem and exits 1 on any. |
| `margent comments {path}` | Lists the review comment threads in the docs that `check` walks. |
| `margent export {path} --out {dir} [--md] [--clean]` | Writes standalone pages (or markdown with `--md`) without opening the browser. `--clean` strips review comments. A folder exports every `.md` under it. |
| `margent serve {docs root} [--port {n}] [--no-open] [--author {name}]` | Serves the folder locally, reloads pages when a `.md` changes, and lets the reader edit blocks and leave comments. Runs until interrupted. |
| `margent init {path}` | Writes a short margent block into the nearest `AGENTS.md` or `CLAUDE.md` above `{path}`, up to the git root (creating `AGENTS.md` at the root when there is none), so agents without the skill keep comment markup and run `check`. Running it again only updates the block. |
| `margent teardown {path}` | Removes that block from the nearest `AGENTS.md` or `CLAUDE.md` above `{path}` that holds one, and deletes a file it leaves empty. A monorepo's root block stays for the other packages. |
| `margent doctor` | Checks Node, Chrome, the browser opener and the cache, and runs a sample island in its frame. Exit 1 on any failure. |
| `margent --version` | Prints the version. |

A folder `{path}` covers every `.md` under it except `node_modules`, dot-folders and files git ignores.

Comments you leave in `serve` are signed with `--author {name}`, else your `git config user.name`, else your OS user name.

## Skills

- `margent`: loaded by the agent when it writes or edits a doc. Sets the doc format and the check-then-open workflow, runs `margent init` before the first doc it touches in a repository, and runs `margent teardown` when you ask to remove margent from a project.
- `docs-open`: render a doc and open it in the browser.
- `docs-serve`: serve a docs folder so the user can review and edit pages.
- `docs-review`: address the review comments in a doc or folder.

The three `docs-*` skills are invoked by the user (`/docs-open` and so on, or `/margent:docs-open` through the plugin).

## Requirements

- Node 22 or later.
- Google Chrome, for `check`, which runs islands headless. `open` and `serve` use your default browser. margent looks for Chrome at `/Applications/Google Chrome.app` and on `PATH`. Set `MARGENT_CHROME` to the browser binary to use another one. A bad path fails the command; it doesn't fall back to another browser.

## Trust

- Islands are JavaScript modules in the docs tree (`islands/*.island.js`). Each one runs in its own sandboxed frame, with no network and no access to the page, your cookies or `serve`'s save endpoint.
- Node never runs island code.
- Every page carries a script policy, so a `<script>`, an inline event handler or a `<form>` written in the markdown doesn't run.
- `serve` binds to 127.0.0.1, requires a session token, and never serves dotfiles.

An island can still freeze its tab with an endless loop. Closing the tab ends it.

## License

MIT. See [LICENSE](LICENSE).
