# Changelog

## [0.3.1](https://github.com/dvquy13/margent/compare/v0.3.0...v0.3.1) (2026-10-25)


### Documentation

* the margent skill says when a doc gets a diagram ([11b0d57](https://github.com/dvquy13/margent/commit/11b0d57a8aabb7862843f55c2ec6970ed6ca7256))

## [0.3.0](https://github.com/dvquy13/margent/compare/v0.2.0...v0.3.0) (2026-10-24)


### Features

* link the header title to the doc index under serve ([#4](https://github.com/dvquy13/margent/issues/4)) ([cbd3d87](https://github.com/dvquy13/margent/commit/cbd3d8753345971b6d2b06fba37ca803cf123744))

## [0.2.0](https://github.com/dvquy13/margent/compare/v0.1.0...v0.2.0) (2026-10-24)


### Features

* **comments:** edit your own notes from the page ([0078700](https://github.com/dvquy13/margent/commit/0078700dac634640ca0b02605b4f2b1282cbb6f5))
* **comments:** type comments, replies and edits inside the card ([96d937e](https://github.com/dvquy13/margent/commit/96d937ec35a97afe18b7ae5e447b580d14cb5e43))
* **serve:** sign notes with the OS user name when git has none ([08970f7](https://github.com/dvquy13/margent/commit/08970f772a21449ecbecbb16357ca631cb31d62d))


### Bug Fixes

* **comments:** a quoted phrase with " in the page matches its stored ' quote ([f1ee18d](https://github.com/dvquy13/margent/commit/f1ee18d7abfe9621cc324d4d4320337e39516c63))

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
