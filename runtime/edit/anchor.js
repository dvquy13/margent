// Selection anchoring (spec M3 R5.2 to R5.5, decision 0020). A selection in a gated block is snapped to whole inline
// elements, then mapped to the block's markdown by inserting two sentinels in a clone and running house turndown on it.
// The positions are used only when the output, without the sentinels, equals the block's source; otherwise the result
// is a block comment. The live DOM is never mutated: the clone is the only node that changes.
import { BLOCK_TAGS, createHouseTurndown, markdownOfPrepared, prepareClone } from './turndown.js';

// Private-use characters that no house rule writes. U+E000 is the house mid-line mark, which stripMarks removes, so it
// cannot be one of them (turndown.js has a test that neither sentinel appears there).
const SENTINEL_START = '';
const SENTINEL_END = '';

const td = createHouseTurndown();

// Elements that are blocks other than these may not hold an inline selection (R5.4): a selection inside a paragraph,
// a heading or a list item is one inline comment, anything bigger is a block comment.
const CROSS_EXEMPT = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI']);
// Taken whole when a boundary is inside them (R5.2).
const ATOMIC = new Set(['CODE', 'A']);
// Existing comment elements that a new selection may not touch (R5.5).
const COMMENT_SELECTOR = 'mark.c-hl, span.c-thread';
// A heading's number is never highlighted (R5.2).
const HEADING_NUMBER = ':is(h1, h2, h3, h4, h5, h6) > span.num';

// A DOM point: a node and an offset in it, as a Range boundary has.
const indexIn = (node) => Array.prototype.indexOf.call(node.parentNode.childNodes, node);
const before = (node) => ({ node: node.parentNode, offset: indexIn(node) });
const after = (node) => ({ node: node.parentNode, offset: indexIn(node) + 1 });
const elementOf = (node) => (node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode);

// -1, 0 or 1 as a comes before, at, or after b.
function comparePoints(a, b) {
  const x = document.createRange();
  x.setStart(a.node, a.offset);
  x.collapse(true);
  const y = document.createRange();
  y.setStart(b.node, b.offset);
  y.collapse(true);
  return x.compareBoundaryPoints(Range.START_TO_START, y);
}

function makeRange(s, e) {
  const r = document.createRange();
  r.setStart(s.node, s.offset);
  r.setEnd(e.node, e.offset);
  return r;
}

// The outermost code or link that the point is inside, within the block, or null.
function outermostAtomic(p, block) {
  let found = null;
  for (let cur = elementOf(p.node); cur && block.contains(cur); cur = cur.parentNode) {
    if (ATOMIC.has(cur.nodeName)) found = cur;
  }
  return found;
}

// The outermost inline element, from the point up, that lies strictly below the common element C, or null.
function inlineOuter(p, C) {
  let found = null;
  for (let cur = elementOf(p.node); cur && cur !== C && !BLOCK_TAGS.has(cur.nodeName); cur = cur.parentNode) {
    found = cur;
  }
  return found;
}

// The child of C that holds the point: for a start, the node after it; for an end, the node before it.
function childOf(p, C, isStart) {
  if (p.node === C) return isStart ? C.childNodes[p.offset] ?? null : C.childNodes[p.offset - 1] ?? null;
  let cur = p.node;
  while (cur.parentNode !== C) cur = cur.parentNode;
  return cur;
}

const isBlockNode = (node) => node !== null && node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.nodeName);

// Snapping (R5.2). Code and links are taken whole; then each boundary moves outward until both sit in the same inline
// parent; then a heading's number is stepped over. Returns { s, e, C } or { reason: 'cross' }.
function snap(s, e, block) {
  const xs = outermostAtomic(s, block);
  if (xs) s = before(xs);
  const xe = outermostAtomic(e, block);
  if (xe) e = after(xe);
  const C = makeRange(s, e).commonAncestorContainer;
  const common = C.nodeType === Node.ELEMENT_NODE ? C : C.parentNode;
  if (BLOCK_TAGS.has(common.nodeName) && !CROSS_EXEMPT.has(common.nodeName)) return { reason: 'cross' };
  // Different block children of the common element: two paragraphs of a loose item, or an item's text and its nested list.
  const cs = childOf(s, common, true);
  const ce = childOf(e, common, false);
  if (cs !== ce && (isBlockNode(cs) || isBlockNode(ce))) return { reason: 'cross' };
  const Xs = inlineOuter(s, common);
  if (Xs) s = before(Xs);
  const Xe = inlineOuter(e, common);
  if (Xe) e = after(Xe);
  // A start in a number, or at its start, moves to just after it. An end in a number moves to just before it, so the
  // number is never highlighted.
  for (const num of block.querySelectorAll(HEADING_NUMBER)) {
    const numStart = before(num);
    const numEnd = after(num);
    if (comparePoints(s, numStart) >= 0 && comparePoints(s, numEnd) <= 0) s = numEnd;
    if (comparePoints(e, numStart) >= 0 && comparePoints(e, numEnd) <= 0) e = numStart;
  }
  return { s, e };
}

// Writes a sentinel at a point of the clone. A text point splits nothing: the character goes into the text.
function insertSentinel(p, ch) {
  if (p.node.nodeType === Node.TEXT_NODE) {
    const d = p.node.data;
    p.node.data = d.slice(0, p.offset) + ch + d.slice(p.offset);
  } else {
    p.node.insertBefore(document.createTextNode(ch), p.node.childNodes[p.offset] ?? null);
  }
}

// The child-index path from the block down to a node of it, so the same point can be found in the clone.
function pathFrom(block, node) {
  const path = [];
  for (let cur = node; cur !== block; cur = cur.parentNode) {
    if (!cur || !cur.parentNode) throw new Error('anchorSelection: a boundary is not inside the block');
    path.unshift(indexIn(cur));
  }
  return path;
}

// Maps a snapped range to the block's markdown (R5.3). Returns the house markdown with both sentinels, from a clone.
function markdownWithSentinels(block, s, e) {
  const clone = block.cloneNode(true);
  const resolve = (p) => {
    let node = clone;
    for (const i of pathFrom(block, p.node)) node = node.childNodes[i];
    return { node, offset: p.offset };
  };
  const cs = resolve(s);
  const ce = resolve(e);
  // End first: inserting at the end does not change the start's node or offset.
  insertSentinel(ce, SENTINEL_END);
  insertSentinel(cs, SENTINEL_START);
  prepareClone(clone);
  return markdownOfPrepared(td, clone);
}

// Anchors a selection in one top-level block. range: the live selection. block: the block element ([data-src]) that
// holds it. source: the block's markdown source. Returns one of:
//   { kind: 'inline', before, inner, after, snapped }  before + inner + after === source; snapped is a live Range
//   { kind: 'overlap', id }                            the snapped range touches the comment with data-c = id
//   { kind: 'block', reason }                          'ungated', 'code', 'cross', or 'guard' (the mapping was not exact)
// A 'guard' result also carries output, the house markdown with the sentinels, for the walk's report.
export function anchorSelection(range, block, source) {
  if (range.collapsed) throw new Error('anchorSelection: the range is collapsed, so there is no selection to anchor');
  if (block.getAttribute('data-gate') !== 'pass') return { kind: 'block', reason: 'ungated' };
  if (!block.contains(range.startContainer) || !block.contains(range.endContainer)) {
    return { kind: 'block', reason: 'cross' };
  }
  for (const p of [range.startContainer, range.endContainer]) {
    const pre = elementOf(p).closest('pre');
    if (pre && block.contains(pre)) return { kind: 'block', reason: 'code' };
  }
  const start = { node: range.startContainer, offset: range.startOffset };
  const end = { node: range.endContainer, offset: range.endOffset };
  const snapped = snap(start, end, block);
  if (snapped.reason) return { kind: 'block', reason: snapped.reason };
  const { s, e } = snapped;
  if (comparePoints(s, e) >= 0) return { kind: 'block', reason: 'guard' };

  const snappedRange = makeRange(s, e);
  for (const el of block.querySelectorAll(COMMENT_SELECTOR)) {
    if (snappedRange.intersectsNode(el)) return { kind: 'overlap', id: el.getAttribute('data-c') };
  }

  const out = markdownWithSentinels(block, s, e);
  const count = (ch) => out.split(ch).length - 1;
  const i0 = out.indexOf(SENTINEL_START);
  const i1 = out.indexOf(SENTINEL_END);
  const stripped = out.split(SENTINEL_START).join('').split(SENTINEL_END).join('');
  if (count(SENTINEL_START) !== 1 || count(SENTINEL_END) !== 1 || i0 > i1 || stripped !== source) {
    return { kind: 'block', reason: 'guard', output: out };
  }
  return {
    kind: 'inline',
    before: out.slice(0, i0),
    inner: out.slice(i0 + 1, i1),
    after: out.slice(i1 + 1),
    snapped: snappedRange,
  };
}
