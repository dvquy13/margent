---
title: M9 spec · User theme
status: draft
updated: 2026-11-09
---

# M9 spec · User theme

M9 lets a user change how margent looks on their side, with an optional `theme.css`, and how their agent designs islands, with an optional `design.md`, both in `~/.margent/` ([0047](../decisions/0047-user-theme-and-design-guide-in-margent-home.md)). Requirement IDs are U1 to U7, and test names cite them.

M9 is done when every acceptance check below passes and the user reads a doc of this repo in OPPO Sans 4.0 through `serve`, islands included.

## Scope

**In**

1. Where margent looks for the files (U1).
2. The theme in pages (U2) and in island frames (U3).
3. `serve` reloads pages when the theme changes (U4).
4. `margent theme init` (U5).
5. `doctor` reports the theme, the design guide and the fonts Chrome used (U6).
6. The skill reads `design.md` (U7).

**Out**

- Project themes. Still deferred, with the order fixed by 0047.
- `serve` sending font files. Deferred in [decisions/README.md](../decisions/README.md#deferred).
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
2. The file starts with a comment that says what the file does, that installed fonts are named in a token, that web fonts load only from Google Fonts (`@import`), and that `margent doctor` shows the fonts Chrome used.
3. Then the house token blocks with the house selectors (`:root`, the two dark blocks), every declaration commented out. With the comment markers removed, each declaration equals the house value.
4. An existing `theme.css` is never overwritten: `{path} already exists; edit it, or delete it to start again`, exit 1.

### U6 `doctor`

1. A theme line: `ok theme: {path}`, `ok theme: none ({path} not found)`, or `fail theme: {reason}` for U1.3 and U2.3.
2. A design line: `ok design: {path}` or `ok design: none ({path} not found)`.
3. With a theme, the sample page renders with it. For each of `--font-ui`, `--font-prose` and `--mono`, doctor asks Chrome which font it drew text in that token with: `ok font-prose: OPPO Sans 4.0`, or, when it is not the token's first family, `warn font-prose: 'OPPO Sans' is not available to this machine's Chrome, so text falls back to Helvetica. Install the font, or @import it from Google Fonts in theme.css`. A warning doesn't change the exit code.

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
| A7 | `doctor` prints the theme and design lines, and `warn font-prose` for a family that isn't installed | U6 |
| A8 | `claude plugin eval` passes, with a case where a user `design.md` is read | U7 |
| A9 | The user reads a doc of this repo through `serve` in OPPO Sans 4.0, islands included | all |
