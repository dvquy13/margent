---
title: The onboarding demo is built from real captures
status: accepted
updated: 2026-11-17
---

# 0049 The onboarding demo is built from real captures

## Context

- A new user reported on 2026-11-17 that she didn't know how to open the HTML margent makes. The README's only walkthrough was for agents, `margent open` prints a page path in the cache, and nothing told a person that `margent serve docs` is how to browse, comment and edit.
- The user asked for a demo video. Their qrec project has one made in Remotion, where the whole UI is redrawn in React (about 4,300 lines of scenes and components). That copy drifts from the product as soon as the UI changes.
- Headless Chrome's screencast (`Page.startScreencast`) sends frames at 1x CSS pixels whatever the device scale factor, and has no cursor.

## Decision

- The text gap is fixed first: the README opens with a Quick start for people (`margent serve docs`, then what to do in the page), and the `margent` skill tells the user, after `margent open`, that the page is open in their browser and that `margent serve` browses every doc.
- The video lives in `demo/`, outside the npm package. `demo/capture.mjs` serves a copy of `demo/sample-docs/` with the real `margent serve` (`dist/cli.js`), drives installed Chrome with real mouse and keyboard input, and records each clip as screencast frames plus a log of mouse events and the `.md` before and after each save. A Remotion project in the same folder plays the frames back at 1:1 in a 1280×720 video, under a drawn browser bar, with a drawn cursor, captions, a terminal scene and the real `.md` diff.
- The video is silent with captions: README videos autoplay muted.
- The rendered mp4 is not committed. It is attached on GitHub and linked from the README.

## Consequences

- After a UI change, `npm run build`, then `npm run capture` and `npm run render` in `demo/` remake the video from the product itself. Only the "How it works" explainer, the terminal scenes, captions and cards are drawn, and they read their text from the capture: the `.md` source, the `margent comments` output, and the sizes of the `.md` and of the page `export` writes from it.
- The page is shown 1:1, so the video can't zoom into it without blurring text.
- The capture needs the network (the page loads Google Fonts) and the installed Chrome, as the browser tests do.
- npmjs.com strips `<video>`, so the README also carries a plain link to the video.

## Alternatives considered

- **Redraw the UI in Remotion, as qrec does.** The most polish, but every UI change means editing a copy of the UI by hand.
- **Record the screen by hand** (QuickTime or Screen Studio). Fastest for one take, and the video goes stale with no way to remake it.
- **Playwright's `recordVideo`.** Low-bitrate VP8 that softens text, and it needs Playwright's own ffmpeg download.
- **VHS for the terminal part.** It needs ffmpeg and ttyd installed for a scene of one command and one output line, which Remotion draws from the real output instead.
