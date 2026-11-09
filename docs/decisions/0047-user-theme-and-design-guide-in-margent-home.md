---
title: A user theme and design guide in ~/.margent
status: accepted
updated: 2026-11-09
---

# 0047 A user theme and design guide in ~/.margent

## Context

- Every page uses the house tokens in `shell/shell.css`. A user can't change the fonts or colors they read in, short of editing margent.
- The user wanted to read docs in OPPO Sans 4.0, a font installed on their machine. The page policy allows web fonts only from Google Fonts (`font-src https://fonts.gstatic.com`), which looked like a blocker, especially with `serve` running on a remote server.
- A probe on 2026-11-09 loaded an exported page in Chrome with margent's policy and asked Chrome which font it drew with:
  - `--font-prose: 'OPPO Sans 4.0'` drew OPPO Sans. An installed font is not fetched, so the policy never applies to it.
  - `@font-face { src: local('OPPO Sans 4.0') }` fell back to Helvetica: Chrome did not match that name in `local()`.
  - `@font-face { src: url(file:///…) }` was blocked by `font-src`.
  - A font file served from the page's own server drew OPPO Sans, but only after adding `'self'` to `font-src`.
- The browser draws the text, so the fonts that count are the ones on the machine running the browser, not the one running margent.
- A Google font works under the existing policy. `@import` of Be Vietnam Pro (not installed) in the page's CSS drew both the page text and an island's text in it, once the import also reached the island frame.
- Serving a font that isn't on Google Fonts to a browser that lacks it needs more machinery (below), and OPPO Sans's terms forbid other download channels. The user put fonts outside Google Fonts out of scope on 2026-11-09.
- Islands run in sandboxed frames (opaque origin). A frame copies only the page's Google Fonts link, and takes the token values through the kit. A `@font-face` or `@import` added to the page alone never reaches an island.
- How an agent designs an island is the author's choice and lands in committed files. How a page looks is the reader's choice and lands nowhere.

## Decision

- margent reads two optional files from `~/.margent/`, or from `$MARGENT_HOME` when it is set:
  - **`theme.css`**: CSS that margent adds to every page it makes (`open`, `export`, `check`, every `serve` page, the `doctor` sample) after the house styles, and to every island frame. It overrides tokens on the house selectors (`:root`, and the two dark-mode blocks), so pages, islands and diagrams change together in both themes. Other selectors reach the page shell only.
  - **`design.md`**: the user's design guide for islands. The `margent` skill reads it before designing an island, ahead of any design skill and the bundled `design-guide.md`. It may hold the rules or name another file to read, such as a design skill's `SKILL.md`.
- There is no config file. Fonts are tokens, so they need no setting of their own.
- `margent theme init` writes a starter `theme.css` that lists every house token, commented out, under the house selectors.
- Fonts come from Google Fonts: an `@import` on the first line of `theme.css`, and the family named first in a font token. The page policy is unchanged. A font installed on the reading machine also works by name, as in any CSS, but margent neither documents nor checks it.
- When project themes land (deferred), the order is house, then project, then user, so the reader's own preference wins.

## Consequences

- The same `.md` renders differently on two machines when their users have different themes. Renders are never committed ([0015](0015-renders-are-never-committed.md)), so nothing shared changes, except a page `export`ed and sent on, which carries the sender's theme.
- `check` measures islands with the user's fonts. A wide font can fail the 390px overflow check on one machine and pass on another. That is the honest result for what the user reads.
- pele measures diagram text with the house font's metrics (`FONT_UI` in `src/render/diagrams.ts`), so a much wider user font can crowd diagram labels.
- A misspelled family falls back to the next one in its token without an error, and margent doesn't catch it. A `doctor` check that asked Chrome which font drew each token (`CSS.getPlatformFontsForNode`) was built for installed fonts and removed with them: about 100 lines and a second Chrome launch, for an error the page itself shows.
- Tests must never read the developer's own `~/.margent`. `npm test` and `npm run test:full` set `MARGENT_HOME` to a folder that doesn't exist, and a test that needs a theme sets its own.
- `design.md` shapes committed islands, so two authors with different guides make islands in different styles in one repo. A project guide, if one is added, should win inside its repo.

## Alternatives considered

- **`~/.margent/config.yaml` with font, author and Chrome-path keys.** Font keys duplicate the tokens, and the other keys already have a working home (`git config user.name`, `MARGENT_CHROME`). Moving them buys nothing.
- **`serve` sends font files from `~/.margent/fonts/`.** It would let a browser without the font installed draw it. Island frames have an opaque origin, so their font requests carry no session cookie and need CORS: `serve` would need an unauthenticated font route. OPPO Sans's terms also forbid offering it through other download channels. Deferred in [README.md](README.md#deferred).
- **Embedding the font in each page as a `data:` URI.** OPPO Sans 4.0 is 22.7 MB, about 30 MB per page in base64, and its license forbids subsetting it.
