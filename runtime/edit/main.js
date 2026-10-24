// Entry of the edit runtime (spec R3 to R7). Built into .build/runtime/edit.js by scripts/build.mjs. It runs only in a
// page that `margent serve` produced, which inlines the state element this reads.
import { blockMarkdown, createHouseTurndown } from './turndown.js';
import { runGate } from './gate.js';
import { initInline } from './inline.js';
import { initPanel } from './panel.js';
import { initReload } from './reload.js';
import { anchorSelection } from './anchor.js';
import { initComments } from './comments.js';

const stateEl = document.getElementById('margent-state');
if (!stateEl) {
  throw new Error('margent edit runtime: #margent-state is missing. Only `margent serve` pages carry the runtime.');
}
const state = JSON.parse(stateEl.textContent);

// Every element with a data-src range is a block. A data-src element inside another one is part of that block.
const blocks = new Map();
for (const el of document.querySelectorAll('[data-src]')) {
  if (el.parentElement && el.parentElement.closest('[data-src]')) continue;
  const range = el.getAttribute('data-src');
  if (blocks.has(range)) throw new Error(`margent edit runtime: two blocks have the range ${range}`);
  blocks.set(range, el);
}

// The source lines start..end (1-based, inclusive), frontmatter included. A CRLF file's \r is not part of a line.
const lines = state.source.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));

function parseRange(range) {
  const m = /^(\d+)-(\d+)$/.exec(range);
  if (!m) throw new Error(`margent edit runtime: bad range ${JSON.stringify(range)}`);
  const start = Number(m[1]);
  const end = Number(m[2]);
  if (start < 1 || end > lines.length || start > end) {
    throw new Error(`margent edit runtime: range ${range} is outside the ${lines.length} lines of the source`);
  }
  return { start, end };
}

function sourceOf(range) {
  const { start, end } = parseRange(range);
  return lines.slice(start - 1, end).join('\n');
}

const td = createHouseTurndown();

// The house turndown of an element (turndown.js blockMarkdown).
function toMarkdown(el) {
  return blockMarkdown(td, el);
}

const gate = runGate({ blocks, sourceOf, toMarkdown });

// Saves one block. The body is the spec's (R6.1): range as [start, end], and the hash the page was rendered from.
// A network failure throws; a 409 or 422 comes back as the status with the server's body.
async function save(range, text) {
  const { start, end } = parseRange(range);
  const res = await fetch('/_save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: state.path, range: [start, end], hash: state.hash, text }),
  });
  return { status: res.status, body: await res.json() };
}

// Each registered predicate reports unsaved text for its own part of the page (blocks, the panel).
const dirtyChecks = [];
function registerDirty(fn) {
  if (typeof fn !== 'function') throw new Error('margent edit runtime: registerDirty needs a function');
  dirtyChecks.push(fn);
}
function dirty() {
  return dirtyChecks.some((fn) => fn());
}

// The anchor of a selection in a block (anchor.js). The block's source is read from its data-src range.
function anchor(range, blockEl) {
  return anchorSelection(range, blockEl, sourceOf(blockEl.getAttribute('data-src')));
}

const margent = { state, gate, blocks, sourceOf, toMarkdown, save, dirty, registerDirty, anchor };
window.margent = margent;
// The panel and reload come first: inline editing hands 409s and 422s to them (openPanel, stale).
initPanel(margent);
initReload(margent);
initInline(margent);
initComments(margent);
