# Changelog

## 0.1.0 (2026-10-25)

### Features

* Render markdown docs into designed pages, with a table of contents, theme toggle and inline SVG diagrams.
* Data-driven islands (charts, boards and other visuals) whose data stays in the markdown, with schema and column patterns.
* `margent check` runs every island headless at 390px and 1280px and reports failures.
* `margent open` previews a doc in the browser; `margent export` writes HTML or clean markdown (`--md`, `--clean`).
* `margent serve` serves docs with in-page editing that saves back to the markdown source.
* Review comments written in the page are saved into the `.md`; `margent comments` lists open threads.
* Islands run in sandboxed frames, and every page carries a hash-based script policy. Node never runs island code.
* `margent doctor` checks the environment and reports what is missing.
* Skills for any agent (`npx skills add`) and a Claude Code plugin with `docs-open`, `docs-serve` and `docs-review` commands.
* Folder walks skip gitignored files, and YAML errors point at the offending line.
