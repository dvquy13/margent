---
title: All blocks
status: draft
version: v3
updated: 2026-10-23
---

# All blocks

Every block type the renderer emits, on one page. This first paragraph is the lede: it sits under the title and reads a size larger than body text.

A second paragraph before the first section stays in the hero, at body size, with **bold**, *italic*, `inline code` and a [link to the spec](specs/m1-render-islands.md#r2-house-shell).

- **System success:** the page renders the same bytes twice in a row.
- **Outcome success:** a reader on a phone never scrolls the page sideways.

## Prose and inline marks

A paragraph with **strong text**, *emphasis*, ***both at once***, `inline code`, ~~struck-out text~~, an [external link](https://example.com/docs), a [relative markdown link](other-page.md) and a [link with an anchor](other-page.md#some-heading). Prices keep their escaped dollar: \$3.87 a month.

A long unbroken token must not push the page wider on a phone: `render-cache.example.com:6543/pages?sslmode=require&application_name=margent-fixture` and https://example.com/a/very/long/path/that/keeps/going/without/any/spaces/at/all/index.html.

### A third-level heading

A paragraph under an h3. Sub-headings group with the text they introduce.

#### A fourth-level heading

A paragraph under an h4.

### Example

The first of two headings with the same text, so slugs need a suffix.

### Example

The second one.

## Lists

An unordered list, with nesting:

- First item, short.
- Second item, long enough to wrap onto a second line at phone width so the hanging indent is visible under the marker.
  - Nested item one.
  - Nested item two, with `code`.
    - Third level.
- Third item.

An ordered list that reaches two digits:

1. One
2. Two
3. Three
4. Four
5. Five
6. Six
7. Seven
8. Eight
9. Nine
10. Ten, with a nested list:
    1. Ten point one.
    2. Ten point two.

A loose list, where items hold more than one paragraph:

- **First point.** Its opening paragraph.

  A second paragraph inside the same item.

- **Second point.** Only one paragraph.

## Quote

> A blockquote with one paragraph. It quotes someone, so it reads in italics with a rule on its left.
>
> A second paragraph in the same quote, with **bold** and `code`.

## Code

A fenced block with a language and a line longer than any screen:

```js
// The renderer's entry point. This comment line is deliberately long so that the block has to scroll sideways inside its own box on every screen width.
export function renderDoc(file, source) {
  const { data, body } = frontmatter(source);
  return page({ title: data.title ?? firstHeading(body), main: render(body) });
}
```

A fenced block without a language:

```
plain text
  keeps its indentation
```

## Tables

A narrow table, with column alignment:

| Item | Count | Share |
|:---|---:|---:|
| Tally | 2,500 | 16% |
| Board | 12,698 | 84% |
| **Total** | **15,198** | **100%** |

A wide table that has to scroll inside its own box:

| Island | Rows (small / medium / large) | Source | Access | Limit | Fields | Stability | Verdict |
|---|---|---|---|---|---|---|---|
| Tally | 15–41 / 450–1,080 / up to 19,000 | Inline table in the Markdown | Read at build time, `margent render` | 10,000 rows a page | label, count, share | Stable | M1 island |
| Diagram | 2–6 / 12–40 / up to 400 | Image file in `assets/` | Read at build time, `margent render` | 10 MB a file | path, alt text | Stable | M1 figure, the most used |
| Video embed | about 12,700 / 62,500 / 62,000 | Remote host | Blocked by the page policy | n/a | n/a | n/a | Out of M1 |

## Figures

An inline SVG diagram with an italic caption on the next line:

![Three feedback loops on a time axis: renders within a second to a day, doctor checks on each commit, review threads over months.](assets/feedback-loops.svg)

*Three feedback loops at three speeds. The diagram themes itself from the page tokens, so it follows the dark toggle.*

A raster image stays an image:

![A small raster test image.](assets/raster.jpg)

---

A paragraph after a horizontal rule ends the page.
