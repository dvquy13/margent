# Changelog

## [0.7.0](https://github.com/dvquy13/margent/compare/v0.6.0...v0.7.0) (2026-10-27)


### Features

* a comment on a repeated phrase marks only the match that was selected ([659473d](https://github.com/dvquy13/margent/commit/659473de8446673140d9374566cd07c003967b37))
* a quoted block comment may name its occurrence, "phrase" #n ([64ecf32](https://github.com/dvquy13/margent/commit/64ecf32dc5ef54290019ae4d0a82276a50670691))
* Cmd+Option+M (Ctrl+Alt+M) comments on the selection, in the page and in islands ([ca31590](https://github.com/dvquy13/margent/commit/ca315903be8b60237492553ae7e9b4812fd11410))
* rail cards show their thread ID, the rail widens to 380px, and long threads fold ([4ba1ff8](https://github.com/dvquy13/margent/commit/4ba1ff8fe600c9375e1c305571a5063d1222e3a6))


### Bug Fixes

* links stay visible inside a comment highlight ([fc4a136](https://github.com/dvquy13/margent/commit/fc4a136cc45d4caf545df4a9fd9a634ee88a98a0))
* skills tell agents never to cite a thread ID in the doc's text ([9131686](https://github.com/dvquy13/margent/commit/9131686c517cf4acf4f51c4f5e3f7a8b2450d0d2))
* the serve index shows each doc's path under its title ([4664d92](https://github.com/dvquy13/margent/commit/4664d92b8558f5feb16bd6612fd190400dbf7921))


### Documentation

* decision 0041, a quoted phrase names its occurrence when it repeats ([961e55f](https://github.com/dvquy13/margent/commit/961e55f658cd052877b11ca6808decf6fb0084a3))
* M6 Phase 1 done ([6e3da3d](https://github.com/dvquy13/margent/commit/6e3da3d8e89ae90ef76faaaf6fb04f8dc2f5a75f))
* M6 spec with F1 to F6, Phase 3 done, IDs rule in CLAUDE.md ([41a5ed1](https://github.com/dvquy13/margent/commit/41a5ed117d1b25305f9674fe2039f2a210c81704))
* plan M6 from review feedback at work ([b1e6b51](https://github.com/dvquy13/margent/commit/b1e6b51ed3410e5c8fa2934d4cff912e7d239b0b))

## [0.6.0](https://github.com/dvquy13/margent/compare/v0.5.0...v0.6.0) (2026-10-27)


### Features

* margent init and teardown write a margent block into the nearest AGENTS.md or CLAUDE.md ([8347faa](https://github.com/dvquy13/margent/commit/8347faa5dba1f3a6681464ffe3f38be5c77db323))

## [0.5.0](https://github.com/dvquy13/margent/compare/v0.4.0...v0.5.0) (2026-10-26)


### Features

* check fails on a quoted phrase not found in its block, and block comments show without hover ([0a0479e](https://github.com/dvquy13/margent/commit/0a0479e46d19338f00c63718dfd11715fd9d2193))

## [0.4.0](https://github.com/dvquy13/margent/compare/v0.3.1...v0.4.0) (2026-10-26)


### Features

* serve says when margent changed on disk and needs a restart ([8dccb7b](https://github.com/dvquy13/margent/commit/8dccb7bfa1b3e2ab37654e7212f4ec0bfb37a193))

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
