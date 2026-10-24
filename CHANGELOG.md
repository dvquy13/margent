# Changelog

## [0.1.1](https://github.com/dvquy13/margent/compare/margent-v0.1.0...margent-v0.1.1) (2026-10-24)


### Bug Fixes

* a release bumps every version pin ([23e47b0](https://github.com/dvquy13/margent/commit/23e47b0f346c1c984433b18e58b7cf090ee1683c))
* **serve:** live reload keeps working after a save on Linux ([39805a7](https://github.com/dvquy13/margent/commit/39805a7c88b6a2ec8efd1b7b4ac12e12c42bf8bb))

## 0.1.0 (2026-10-25)

### Features

* Render markdown docs into designed pages with `margent render`.
* Data-driven islands (charts, boards and other visuals) whose data stays in the markdown, with schema and column patterns.
* `margent check` runs every island headless at 390px and 1280px and reports failures.
* `margent open` previews a doc in the browser; `margent export` writes HTML or clean markdown (`--md`, `--clean`).
* `margent serve` serves docs with in-page editing that saves back to the markdown source.
* Review comments written in the page are saved into the `.md`; `margent comments` lists open threads.
* Islands run in sandboxed frames, and every page carries a hash-based script policy. Node never runs island code.
* `margent doctor` checks the environment and reports what is missing.
* Skills for any agent (`npx skills add`) and a Claude Code plugin with `docs-open`, `docs-serve` and `docs-review` commands.
* Folder walks skip gitignored files, and YAML errors point at the offending line.
