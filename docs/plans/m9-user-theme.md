---
title: Plan · M9 User theme
status: draft
updated: 2026-11-09
---

# Plan · M9 User theme

Task order for [the M9 spec](../specs/m9-user-theme.md), on branch `m9-user-theme`. Decision [0047](../decisions/0047-user-theme-and-design-guide-in-margent-home.md). Delete this plan when M9 closes, once its contracts are in `architecture.md`.

## Tracker

- [x] T1 Home folder, theme in rendered pages, test isolation (U1, U2; A1 to A3)
- [x] T2 Theme in island frames (U3; A4)
- [x] T3 `serve`: index and error pages, reload on theme change (U2.1, U4; A5)
- [x] T4 `margent theme init` and `doctor` lines (U5, U6; A6, A7)
- [x] T5 Skill reads `design.md`, eval case (U7; A8). Font case 3/3; design-guide case 5 of 6 across two runs, 0 without the plugin
- [x] T6 Docs: architecture, system design, README, CLAUDE.md; full tier green (861/863 on the first run; the one failure, an F3 keyboard test, passed alone under load)
- [ ] T7 The user reads a doc in OPPO Sans 4.0 (A9). Probed 2026-11-09: page prose and the `milestones` island text both drawn in OPPO Sans 4.0; waiting on the user's look

## Tasks

**T1.** `src/user/home.ts`: `margentHome()` and `readUserTheme()` returning `{ file, css }` or null, with the U1.3 and U2.3 errors as `RenderError`. `renderDoc` takes an optional `theme` and adds `<style id="margent-user-theme">` after the house style; renders stay pure, and the CLI reads the theme once and passes it through `renderSet`, `renderOne` and `exportText`. `package.json` test scripts set `MARGENT_HOME` to a path that doesn't exist.

**T2.** `runtime/host.js` `srcdocFor` copies `#margent-user-theme` into the frame after the fonts link. Browser test in the fast tier (a feature's main path).

**T3.** `startServer` takes the theme path, reads it on each render, passes it to `indexPage` and `errorPage`, and watches it with `watchFile` like `self`, scheduling every open page as an "other" change.

**T4.** `theme init` builds the starter from `shell/shell.css` at run time. `doctor` gains the theme and design lines, and the font check through CDP `CSS.getPlatformFontsForNode` on three probe elements.

**T5.** Step 3 of `skills/margent/SKILL.md` and the first line of `references/design-guide.md`. One eval case.

**T6.** Distill into `architecture.md` (Shell slots, Island DOM, Serve), `system-design.md` (Shell, "your taste"), `README.md` (a Customize section, the commands table), `docs/decisions/README.md` (0047, deferred list), CLAUDE.md (status, `MARGENT_HOME` for direct test reruns).
