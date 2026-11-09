---
title: M9 spec · User theme
status: done
updated: 2026-11-09
---

# M9 spec · User theme

M9 lets a user change how margent looks on their side, with an optional `theme.css`, and how their agent designs islands, with an optional `design.md`, both in `~/.margent/` ([0047](../decisions/0047-user-theme-and-design-guide-in-margent-home.md)). Requirement IDs are U1 to U7, and test names cite them.

M9 is done when every acceptance check below passes and the user reads a doc of this repo through `serve` in a Google font set in their theme, islands included.

## Scope

**In**

1. Where margent looks for the files (U1).
2. The theme in pages (U2) and in island frames (U3).
3. `serve` reloads pages when the theme changes (U4).
4. `margent theme init` (U5).
5. `doctor` reports the theme and the design guide (U6).
6. The skill reads `design.md` (U7).

**Out**

- Project themes. Still deferred, with the order fixed by 0047.
- Fonts from anywhere but Google Fonts. A font installed on the reading machine works by name, as in any CSS, but margent neither checks nor documents it. `serve` sending font files is deferred in [decisions/README.md](../decisions/README.md#deferred).
- Checking that a font named in a token actually loads.
- Diagram text measured with the user's font.

## Requirements

### U1 Home folder

1. The margent home is `$MARGENT_HOME` when set and not empty, else `~/.margent`.
2. margent reads `theme.css` from it. A missing home or missing file means no theme. margent never creates the home, except `theme init` (U5).
3. A `theme.css` that exists but can't be read fails the command with its path and the reason, exit 1.

### U2 Theme in pages

1. With a theme, every page margent makes carries `<style id="margent-user-theme">` holding the file's text byte for byte, right after the house `<style>` in `<head>`: doc pages from `open`, `export` and `check`, `serve`'s doc, index and error pages, and the `doctor` sample.
2. Without a theme, every page is byte-identical to M8.
3. A theme holding `</style` (any case) fails with `{path}:{line}: theme.css must not contain "</style"`, where `line` is that text's line, exit 1.
4. The page policy is unchanged.
5. The theme is read once per command; `serve` reads it on each render.

### U3 Theme in island frames

1. Each island frame's document carries the page's `#margent-user-theme` text in a `<style>` after the Google Fonts link, so `@import` and `@font-face` rules reach islands. The frame policy is unchanged.
2. A page without a theme makes frames byte-identical to M8.
3. A token the theme overrides reaches the island's kit (`kit.tokens`), in light and dark.

### U4 Serve

1. `serve` watches the theme file, including while it doesn't exist. When it is created, changed or deleted, every open page reloads.
2. When a theme is in use at start, `serve` logs `theme: {path}`.

### U5 `margent theme init`

1. Writes `{home}/theme.css`, creating the home, and prints the path.
2. The file starts with a comment that says what the file does, how to remove the comment markers, and how to use a Google font: an `@import` on the first line and the family first in a font token. Fonts from other hosts are blocked.
3. Then the house token blocks with the house selectors (`:root`, the two dark blocks), every declaration commented out. With the comment markers removed, each declaration equals the house value.
4. An existing `theme.css` is never overwritten: `{path} already exists; edit it, or delete it to start again`, exit 1.

### U6 `doctor`

1. A theme line: `ok theme: {path}`, `ok theme: none ({path} not found)`, or `fail theme: {reason}` for U1.3 and U2.3.
2. A design line: `ok design: {path}` or `ok design: none ({path} not found)`.
3. With a theme, the islands check renders the sample with it.

### U7 Skill

1. The `margent` skill's design step reads `{home}/design.md` first when it exists, and follows any file it names. Then a design skill such as `/design-principles`, then `references/design-guide.md`.
2. A `design.md` that exists but can't be read, or names a file that doesn't exist, is reported to the user, not skipped.
3. The skill tells the agent that the user's look lives in `~/.margent/theme.css` and is set with `margent theme init`.

## Acceptance

| # | Check | Covers |
|---|---|---|
| A1 | A doc rendered with a theme carries it after the house style; without one, the goldens are unchanged | U1, U2.1, U2.2 |
| A2 | A theme with `</style` on line 3 fails `export` with `theme.css:3:`; an unreadable theme fails with its path | U1.3, U2.3 |
| A3 | `export` and `open` through the CLI with `MARGENT_HOME` set carry the theme; with `MARGENT_HOME` pointing nowhere they don't | U1, U2.1 |
| A4 | In Chrome, a theme setting `--accent` changes the page's accent and the island's `kit.tokens.accent`, in light and dark; the frame document holds the theme text | U3 |
| A5 | A served page reloads when the theme file is created, changed and deleted | U4 |
| A6 | `theme init` writes the starter, refuses a second run, and the uncommented starter equals the house tokens | U5 |
| A7 | `doctor` prints the theme and design lines, and fails the theme line for a theme holding `</style` | U6 |
| A8 | `claude plugin eval` passes: asked for a Google font, the agent points to `theme.css`; adding a visual, it looks for `design.md` | U7 |
| A9 | The user reads a doc of this repo through `serve` in a Google font from their theme, islands included | all |

## Results

Closed 2026-11-09 on branch `m9-user-theme`.

- **A1 met.** `npm run test:full`: 861 tests, 860 pass, the opt-in `UPDATE_SHOTS` screenshots skip. `npm run typecheck` exits 0. No golden changed. Tests: A1 and U2.2 in `test/user-theme.test.mjs`.
- **A2 met.** A2 and U1.3 in `test/user-theme.test.mjs` (`export` fails with `theme.css:3:`, and with the path of a `chmod 000` theme).
- **A3 met for `export` and `check`.** A3 in `test/user-theme.test.mjs`. `open` goes through the same `renderSet` call with the theme and has no test of its own.
- **A4 met.** `test/user-theme-browser.test.mjs`: page and island `--accent` in light, then dark after the header toggle; the frame head holds the theme text; no theme style without a theme.
- **A5 met.** `test/user-theme-serve.test.mjs`: an SSE client gets `changed` when `theme.css` is created, edited and deleted. The same file covers the theme on the doc and index pages and the error page for a broken theme.
- **A6 met.** A6 in `test/user-theme-cli.test.mjs`, including the starter's declarations compared with `shell/shell.css` block by block.
- **A7 met.** A7 in `test/user-theme-cli.test.mjs`.
- **A8 met.** `claude plugin eval`: `positive-user-font` 3/3 with the plugin and 0/3 without, run before and after its prompt moved to a Google font; `positive-user-design-guide` 5 of 6 with the plugin across two runs, 0 of 3 without; `positive-add-visual` 3/3.
- **A9 met.** The user read this repo's docs through `serve` with their theme and closed the milestone. Chrome's platform-font report (`CSS.getPlatformFontsForNode`) on an exported `design/system-design.md` with `@import` of Be Vietnam Pro, which isn't installed here: page prose and the `milestones` island's text are both drawn in it.

What differed from the spec:

- Fonts are scoped to Google Fonts (the user, 2026-11-09). The spec first had `doctor` ask Chrome which font drew each font token (U6.3), for fonts installed on the reading machine. It was built, then removed with that scope; [0047](../decisions/0047-user-theme-and-design-guide-in-margent-home.md) records why.
- `serve` also reads the theme at start and fails before anything opens when it is broken. A theme that breaks while serving makes each doc the error page; the index shows the message and renders without the theme.
- In an island frame the theme sits before the frame's own style, so a theme rule on `body` can't change the frame's margins or background.
- `margent comments` writes no page, so it doesn't read the theme.
- The design-guide eval grades with an `llm` grader over the run's trace: the agent looks for `~/.margent` with whatever tool it has (often `ls`), which a `tool_used` grader on `Read` missed.
