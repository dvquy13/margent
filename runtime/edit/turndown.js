// House turndown (spec R3.5): the only HTML-to-markdown path of the edit runtime. Stock turndown does not write a
// source block back byte for byte, so each rule below exists because the corpus needs it (S2 FINDINGS).
import TurndownService from 'turndown';

// Elements that start a new line of markdown, so a newline next to one is formatting, not a soft break.
export const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL', 'AGENT-ISLAND',
]);

// Escape override. markdown-it reads an intraword "_" as literal, so it is not escaped. "$" is escaped (house style is
// \$). "_" is escaped only at the edges where it could open markup. "[" and "]" are escaped only where a later "](" or
// "][" could close them into a link, so a task-list "[x]" stays bare. Line starts that would make a heading, quote or
// list are escaped too; the mid-line mark keeps these rules off text that starts mid-line.
export function houseEscape(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\$/g, '\\$')
    .replace(/(^|[^A-Za-z0-9])_/g, '$1\\_')
    .replace(/_(?![A-Za-z0-9])/g, '\\_')
    .replace(/\](?=[([])/g, '\\]')
    .replace(/\[(?=[^[\]]*\][([])/g, '\\[')
    .replace(/^(\s*)(#{1,6}\s|[-+>])/gm, '$1\\$2')
    .replace(/^(\s*\d+)\. /gm, '$1\\. ');
}

// Turndown escapes each text node on its own, so a text node after bold ("**a** - b") looks like a line start to the
// rules above, and they would write "\-". Text that starts mid-line gets this mark first, which stops those rules
// matching; stripMarks removes it from the output. A source with this character still fails the gate, never corrupts.
const MID_LINE = '\uE000';
// The text that replaces a thread's notes in the clone (prepareClone). Its rule ignores it.
const THREAD_PLACEHOLDER = 'x';
function stripMarks(markdown) {
  return markdown.replace(new RegExp(MID_LINE, 'g'), '');
}

// A link destination as markdown needs it: parentheses and angle brackets escaped, and <> around a value with a space.
function linkDestination(href) {
  const escaped = href.replace(/([<>()])/g, '\\$1');
  return escaped.includes(' ') ? `<${escaped}>` : escaped;
}

function linkTitle(title) {
  return title ? ` "${title.replace(/"/g, '\\"')}"` : '';
}

// Prepares a clone for turndown. Markdown-it writes a soft break (a newline inside a paragraph) as a bare "\n" in the
// text, and the browser keeps it in the text node. Turndown collapses it to a space, so each soft break is first
// replaced by <br data-soft>, which the br rule maps back to "\n". Then each text node that does not start a line gets
// the MID_LINE mark (see houseEscape). The DOM is not the page's: this runs only on the clone that toMarkdown makes.
export function prepareClone(root) {
  normalizeEdits(root);
  // A thread's notes are not content: its rule writes data-md (R7.1), so its text is never split or marked. The
  // placeholder keeps the span out of turndown's blank check, which would drop it, and out of the flanking-whitespace
  // rule, which would move a note's trailing space outside it.
  for (const thread of root.querySelectorAll('.c-thread')) thread.replaceChildren(THREAD_PLACEHOLDER);
  const inText = (n) => !n.parentElement.closest('pre, code, .c-thread');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const withBreaks = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.data.includes('\n') && inText(n)) withBreaks.push(n);
  }
  for (const text of withBreaks) {
    const pieces = text.data.split('\n');
    const frag = document.createDocumentFragment();
    pieces.forEach((piece, k) => {
      if (k > 0) {
        frag.append(isSoftBreak(text, pieces, k - 1) ? softBreakElement() : '\n');
      }
      if (piece !== '') frag.append(piece);
    });
    text.replaceWith(frag);
  }

  const marking = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const midLine = [];
  for (let n = marking.nextNode(); n; n = marking.nextNode()) {
    // Whitespace-only text has nothing to escape.
    if (inText(n) && /\S/.test(n.data) && !startsLine(n)) midLine.push(n);
  }
  // The mark goes after leading whitespace: turndown moves a space at the edge of <strong> or <em> outside the
  // delimiters only when it is the node's first character, so "**a** <b> b</b>" stays "**a** **b**".
  for (const text of midLine) text.data = text.data.replace(/^\s*/, (ws) => ws + MID_LINE);
}

// Normalization of an edited block (spec R4). Chrome's contenteditable leaves a placeholder <br> at the end of a block it
// has just extended, and writes a typed space at the edge of a text run as U+00A0. The placeholders are removed from the
// clone here, with the break that Enter wrote at the end of a paragraph.
// An unedited gated block has neither (markdown-it never ends a block with a break), so the gate does not move. U+00A0
// becomes a space only in a block being edited (data-editing): a source with a literal U+00A0 that is not edited keeps
// it, and a save of it writes the same bytes.
const BREAK_BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li';
function normalizeEdits(root) {
  // The placeholder that gives the caret a line after a paragraph break (inline.js paragraphBreak) is not content.
  for (const br of root.querySelectorAll('br[data-fill="1"]')) br.remove();
  const blocks = root.matches(BREAK_BLOCKS) ? [root] : [];
  blocks.push(...root.querySelectorAll(BREAK_BLOCKS));
  for (const block of blocks) {
    for (let last = block.lastChild; last && last.nodeName === 'BR' && last.getAttribute('data-soft') !== '1'; last = block.lastChild) {
      last.remove();
    }
  }
  if (root.hasAttribute('data-editing')) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.data.includes('\u00a0')) n.data = n.data.split('\u00a0').join(' ');
    }
  }
}

// True when the text node begins a line of the output: its previous sibling is a block or a break, or, with no previous
// sibling, its parent begins a line (a block, or an inline element that begins one). The clone has no parent above root.
// A highlight writes "{==" before its content, so its first text never begins a line (unless a break precedes it).
function startsLine(text) {
  let node = text;
  for (;;) {
    const prev = node.previousSibling;
    if (prev) {
      if (prev.nodeType === Node.TEXT_NODE) return prev.data.endsWith('\n');
      return prev.nodeName === 'BR' || BLOCK_TAGS.has(prev.nodeName);
    }
    const parent = node.parentNode;
    if (parent && isHighlight(parent)) return false;
    if (!parent || parent.nodeType !== Node.ELEMENT_NODE || BLOCK_TAGS.has(parent.nodeName)) return true;
    node = parent;
  }
}

// A highlight (spec R1.1) is a <mark> with the c-hl class, written as {==content==}.
function isHighlight(el) {
  return el.nodeName === 'MARK' && el.classList.contains('c-hl');
}

// The newline between pieces[k] and pieces[k + 1] is soft when inline content lies on both sides. A side is text, or
// the neighbouring sibling of the text node when the piece is empty. So a newline after a list or before a paragraph
// (block siblings) is formatting, as is a newline in a run of blank lines.
function isSoftBreak(text, pieces, k) {
  const leftInline = pieces[k] !== '' || (k === 0 && isInline(text.previousSibling));
  const rightInline = pieces[k + 1] !== '' || (k + 1 === pieces.length - 1 && isInline(text.nextSibling));
  return leftInline && rightInline;
}

function isInline(node) {
  if (!node) return false;
  if (node.nodeType === Node.TEXT_NODE) return true;
  return node.nodeType === Node.ELEMENT_NODE && !BLOCK_TAGS.has(node.tagName);
}

function softBreakElement() {
  const br = document.createElement('br');
  br.setAttribute('data-soft', '1');
  return br;
}

// Turndown rules for lists (S2 "list rules"). Markers are "- " and "N. " with a 2 or N+2 space continuation. A list item
// with data-gap="1" follows a blank source line, so a loose list keeps its gap (spec R8.1, markListGaps).
function listRules(td) {
  td.addRule('nestedList', {
    filter: ['ul', 'ol'],
    replacement: (content, node) => {
      const sep = node.parentNode.nodeName === 'LI' ? '\n' : '\n\n';
      return sep + content.replace(/^\n+|\n+$/g, '') + sep;
    },
  });
  td.addRule('listItem', {
    filter: 'li',
    replacement: (content, node) => {
      const parent = node.parentNode;
      let prefix;
      if (parent.nodeName === 'OL') {
        const start = parent.getAttribute('start') ? Number(parent.getAttribute('start')) : 1;
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
      } else prefix = '- ';
      const pad = ' '.repeat(prefix.length);
      // A blank line directly before a nested list is dropped (known loss; the corpus has none).
      content = content
        .replace(/\n\n+(?=\d+\. |[-*+] )/g, '\n')
        .replace(/^\n+|\n+$/g, '')
        .split('\n')
        .map((l, i) => (i === 0 || l === '' ? l : pad + l))
        .join('\n');
      const lead = node.getAttribute('data-gap') === '1' && node.previousSibling ? '\n\n' : '';
      return lead + prefix + content + (node.nextSibling ? '\n' : '');
    },
  });
}

// The house turndown service. Stock turndown's behaviour is kept except where a rule below replaces it.
export function createHouseTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  });
  td.escape = houseEscape;

  listRules(td);

  // An ATX heading's text can't start a list, so the line-start "1. " escape (houseEscape) is undone there: a heading
  // like "## 2. Release process" round-trips instead of failing the gate.
  td.addRule('atxHeading', {
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    replacement: (content, node) =>
      `\n\n${'#'.repeat(Number(node.nodeName.charAt(1)))} ${content.replace(/^(\d+)\\\. /, '$1. ')}\n\n`,
  });

  // Strikethrough: stock turndown drops <s>, <del> and <strike>, which GFM strikethrough writes as ~~x~~.
  td.addRule('strike', { filter: ['s', 'del', 'strike'], replacement: (c) => `~~${c}~~` });

  // A soft break is a newline inside inline content (see prepareClone). Hard breaks use the stock rule.
  td.addRule('softBreak', {
    filter: (n) => n.nodeName === 'BR' && n.getAttribute('data-soft') === '1',
    replacement: () => '\n',
  });

  // The paragraph break of an edited paragraph (inline.js, Enter): a blank line in the source, so the saved text becomes
  // two blocks on the next render. Stock turndown would write a hard break here.
  td.addRule('paragraphBreak', {
    filter: (n) => n.nodeName === 'BR' && n.getAttribute('data-para') === '1',
    replacement: () => '\n\n',
  });

  // Comments (spec R7.1, R7.2). A highlight is written back as {==content==}. Its content is empty only when all its text
  // was deleted (blankRule writes nothing for it), which leaves the thread after it as a point comment. A thread is
  // written as the exact source of its notes, so its rendered notes are never emitted.
  td.addRule('highlight', {
    filter: isHighlight,
    replacement: (content) => (content === '' ? '' : `{==${content}==}`),
  });
  td.addRule('thread', {
    filter: (n) => n.nodeName === 'SPAN' && n.classList.contains('c-thread'),
    replacement: (_content, node) => {
      const md = node.getAttribute('data-md');
      if (md === null) throw new Error('margent edit runtime: a comment thread has no data-md, so it cannot be written back');
      return md;
    },
  });

  // A local .md link is rewritten to .html in the page, so its author's target is read from data-md-href (spec R3.5).
  // Inline link style, as the stock rule writes it. This rule is added after the stock one, so it takes precedence.
  td.addRule('link', {
    filter: (n) => n.nodeName === 'A' && n.getAttribute('href') !== null,
    replacement: (content, node) => {
      const href = node.getAttribute('data-md-href') ?? node.getAttribute('href');
      return `[${content}](${linkDestination(href)}${linkTitle(node.getAttribute('title'))})`;
    },
  });

  // <https://x> autolinks: markdown-it renders them as a link whose text is its own target, and stock turndown writes
  // them as [https://x](https://x). Added after the link rule, so it runs first.
  td.addRule('autolink', {
    // The text may carry the MID_LINE mark (prepareClone), which is not part of the link text.
    filter: (n) => n.nodeName === 'A' && n.getAttribute('href') && n.textContent.split(MID_LINE).join('') === n.getAttribute('href'),
    replacement: (_content, node) => `<${node.getAttribute('href')}>`,
  });

  // A local image is rewritten to a path relative to the output file, so its author's src is read from data-md-src.
  td.addRule('image', {
    filter: 'img',
    replacement: (_content, node) => {
      const src = node.getAttribute('data-md-src') ?? node.getAttribute('src') ?? '';
      const alt = td.escape(node.getAttribute('alt') ?? '');
      return `![${alt}](${linkDestination(src)}${linkTitle(node.getAttribute('title'))})`;
    },
  });

  // An h2 that starts with a number shows the number in its own span (shell design R2.6). The source has a space
  // after the number, and the span does not carry it, so the rule writes it back.
  td.addRule('numberedLabel', {
    filter: (n) => n.nodeName === 'SPAN' && n.classList.contains('num'),
    replacement: (content) => `${content} `,
  });

  return td;
}

// The house markdown of one block element. The element is cloned, so the page is not touched. The clone is wrapped in a
// div, because turndown writes the children of its root and not the root itself, so the block's own rule must be inside.
export function blockMarkdown(td, el) {
  const clone = el.cloneNode(true);
  prepareClone(clone);
  return markdownOfPrepared(td, clone);
}

// The markdown of a clone that prepareClone has already prepared (anchor.js puts sentinels in between). The clone is
// wrapped as blockMarkdown wraps it, and the house mark is stripped; no other character is touched.
export function markdownOfPrepared(td, clone) {
  const wrap = document.createElement('div');
  wrap.append(clone);
  return stripMarks(td.turndown(wrap));
}
