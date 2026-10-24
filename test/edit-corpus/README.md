# Edit corpus

The M2 definition of done (spec R10, acceptance A1; decision 0018). Each case edits a copy of a margent doc in installed
Chrome with real mouse and keyboard input, then checks the file.

- `docs/`: margent-written docs, with their `islands/` and the `assets/` they use.
  - `handbook.md` is a generic margent maintainer handbook that holds every block kind: headings, lists, tables, a
    figure, fenced code, blockquotes and an island table (`islands/milestone-status.island.js`). Most cases edit it.
  - `extra-kinds.md` holds the block kinds the handbook lacks: a raw HTML block, a YAML-backed island (`islands/steps.island.js`,
    from the runtime fixtures), a nested list and a paragraph the gate rejects.
  - `quoted.md` holds a quoted block comment line (M3 T15) to reply on. `reviewed.md` holds comments that already
    have a reply, for the review cases.
  - `node dist/cli.js check test/edit-corpus/docs` must exit 0.
- `cases/{doc-slug}/{nn}-{slug}.json`: `{ "doc": "{path under docs/}", "steps": [...] }`.
- `cases/{doc-slug}/{nn}-{slug}.expected.md`: the whole expected file, written by hand from the original. Never produced by
  running the case.
- `steps.mjs`: the step runner. `review.mjs`: prints every case and its diff from the original, for review.
- `../corpus.test.mjs`: one test per case.

## Checks

Each case serves a fresh copy of `docs/`. After its steps, the file must equal the expected file byte for byte. A case
whose expected file equals the original must send no `/_save` in 300 ms. Otherwise the save must answer 200, and no
line outside the edited range may change: the lines before the range and the lines after it are the original's. The one
exception is a deletion between two blank lines, where the splice removes one blank line (spec R6.4, splice rules).

## Step vocabulary

Text in the steps is searched in the page's visible text, islands excluded. It must occur once, or the step names which
occurrence with `nth` (1-based, in document order). A text is found with a DOM Range, and only its coordinates are used.
The DOM is never changed by a step.

| Step | Meaning |
|---|---|
| `{"click": {"text": "...", "at": "start" \| "end" \| "middle", "nth": 1}}` | Mouse click at that point of the text. `start` is just inside the first character, `end` just inside the last. |
| `{"select": {"text": "...", "nth": 1, "island": true}}` | Mouse drag from the first character to the last. With `"island": true` the text is searched in each island's frame, where an island draws its text, and the drag runs with the mouse in the page (default false: islands are skipped). |
| `{"type": "..."}` | Keyboard typing. A `\n` in a panel is Enter. |
| `{"press": "Meta+B"}` | A key press. `Meta` is Cmd on macOS, Ctrl elsewhere. |
| `{"paste": {"html": "...", "text": "..."}}` | A real `paste` event on the focused element, with both types. |
| `{"blur": true}` | Mouse click on blank page space outside every block. |
| `{"panel": {"text": "..."}}` | Hover the block that contains the text, click its edit control. |
| `{"panel": {"range": "13-23"}}` | As above, the block by its range. Used for figures, islands and fenced code, which hold no text the test can find. |
| `{"panel": "frontmatter"}` | Click the frontmatter's edit control in the header. |
| `{"panelSelectAll": true}` | Cmd+A in the panel's text area. |
| `{"control": {"label": "Comment", "near": "text", "nth": 1}}` | Clicks a comment control with a real mouse click. With no `near` and no `range`, `Comment` is the control at the selection. With `near` (a text in the block) or `range` (the block's lines, as in `"13-23"`), it is that block's control: `Comment` (the block comment), or `"label": "Reply"` or `"Resolve"` on the card in the rail of each thread in that block (decision 0023). Below 1100px the rail is a drawer, and the step opens it first. `nth` picks among the block's controls with that label. The block is hovered first, and a gated block (`data-gate="pass"`) is focused by a click in its text first, because its control shows only while it holds focus. |
| `{"write": {"append": "text"}}` | Appends text to the served file on disk, as another editor would. The next save is then stale. |
| `{"wait": "save"}` | A marker. The runner waits for the save itself, after the steps. |

A `select` or `click` text may span blocks' text nodes, such as the line break between two list items, written as `\n` in the text. A text that is visible more than once (a table of contents repeats headings) needs `nth`.

Case options, in the JSON next to `steps`:

- `"author"`: the author the server is started with. Default `"Quy"`. `null` starts it with no author (no user name in git's config and no global config), so a note is refused.
- `"expect"`: `"stale"` when the save must answer 409 because the file changed on disk. The expected file then holds that change, and the range check is skipped. `"no-save"` when nothing may be sent, and the expected file must equal the original.

Most in-place cases end with `blur`. A panel case selects all the text, types the block's new source and presses Cmd+S.
