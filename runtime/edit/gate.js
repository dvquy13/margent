// The round-trip gate (spec R3.3, R3.4). A candidate block is editable in place when house turndown of its own DOM writes
// its source lines back byte for byte. Every other block edits in the side panel. A block comment line (.c-line, M3
// R1.4) is never editable in place: it edits only through the comment controls and the panel.

// Block types the gate judges. Every other type is a panel block, whatever its source.
const CANDIDATES = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol']);

function show(line) {
  return line === undefined ? '(no line)' : JSON.stringify(line);
}

// The reason for a failing block: its first differing line, by file line number so it can be found in the source.
function firstDifference(range, expected, got) {
  const start = Number(range.split('-')[0]);
  const want = expected.split('\n');
  const have = got.split('\n');
  const n = Math.max(want.length, have.length);
  for (let i = 0; i < n; i++) {
    if (want[i] !== have[i]) {
      return `line ${start + i}: expected ${show(want[i])} got ${show(have[i])}`;
    }
  }
  throw new Error(`gate: ${range} differs from its source, but no line differs`);
}

// blocks: Map from range string to element, in document order. Returns one entry per block, in that order, and sets
// data-gate="pass" or "fail" on each candidate element.
export function runGate({ blocks, sourceOf, toMarkdown }) {
  const gate = [];
  for (const [range, el] of blocks) {
    const type = el.tagName.toLowerCase();
    if (el.classList.contains('c-line')) {
      gate.push({ range, type, pass: false, reason: 'comment' });
      continue;
    }
    if (!CANDIDATES.has(type)) {
      gate.push({ range, type, pass: false, reason: 'panel' });
      continue;
    }
    const expected = sourceOf(range);
    const got = toMarkdown(el);
    const pass = got === expected;
    el.setAttribute('data-gate', pass ? 'pass' : 'fail');
    gate.push({ range, type, pass, reason: pass ? null : firstDifference(range, expected, got) });
  }
  return gate;
}
