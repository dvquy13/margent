# Changelog

## [0.3.1](https://github.com/dvquy13/margent/compare/v0.3.0...v0.3.1) (2026-10-25)


### Features

* a note can hold line breaks: Shift+Enter in the comment box ([c78b60e](https://github.com/dvquy13/margent/commit/c78b60e675d9ecd50095efef4dfedf23f997177e))


### Bug Fixes

* check fails on a link to a missing file or heading ([b165574](https://github.com/dvquy13/margent/commit/b16557436165b17fcb5f3de5aa83fd8f23435c3e))


### Documentation

* agent replies to every comment and only the user resolves (decision 0035) ([f7cf355](https://github.com/dvquy13/margent/commit/f7cf35566307a6cb64a5a8b372acd0355679fb68))
* cut M4 catalog (decision 0034) ([dce3e54](https://github.com/dvquy13/margent/commit/dce3e54f30d87741b41d1b38de014aebc89e1d8e))
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
