// milestone-depth: milestones as a rail of stations, read from the milestones table.
// Above the rail, a stack per milestone holds one bar per scope item shipped so
// far: earlier items light, its own items dark, so the stacks rise as depth
// accumulates. Below the rail: the new scope, then the done-when gate.
// Hovering a scope item lights its bar in every milestone that carries it.
//
// Cell patterns this module parses (anything else renders as plain text):
//   Scope      first sentence is a comma list of items; later sentences are a note
//   Done when  "{number} {word}" spans are set large, unless the cell already has **bold**

export const contract = 1;

const COLS = ['m', 'scope', 'done_when'];

export const schema = {
  type: 'object',
  required: ['columns', 'rows'],
  properties: {
    columns: {
      type: 'array',
      items: { type: 'object', required: ['key', 'label'], properties: { key: { type: 'string' }, label: { type: 'string' } } },
      allOf: COLS.map((k) => ({ contains: { type: 'object', properties: { key: { const: k } }, required: ['key'] } })),
    },
    rows: {
      type: 'array',
      minItems: 1,
      items: { type: 'object', required: COLS, properties: Object.fromEntries(COLS.map((k) => [k, { type: 'string', minLength: 1 }])) },
    },
    attrs: { type: 'object', maxProperties: 0 },
  },
  // The scope cell's first sentence is a comma list; each item becomes one bar (R3.1).
  columns: {
    scope: { pattern: /,\s/.source },
  },
};

const CSS = `
.box { container-type: inline-size; font-family: var(--font-ui); color: var(--text); --bar: 8px; --bar-gap: 3px; }
code { font-family: var(--mono); font-size: .92em; }
a { color: var(--accent); }
.grid { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); column-gap: var(--gap-md); padding: var(--gap-sm) 0; }

/* depth stacks */
.stack { align-self: end; display: flex; flex-direction: column; gap: var(--bar-gap); padding-bottom: var(--gap-sm); }
.added { font-size: var(--font-xs); color: var(--text-muted); font-variant-numeric: tabular-nums; margin-bottom: 2px; }
.cell { height: var(--bar); border-radius: 2px; background: var(--bg3); transition: background-color 120ms; }
.cell.own { background: var(--text); }
.cell.hot { background: var(--accent); }
.cell.from-sep { margin-top: 3px; }

/* rail: the line runs into the column gap, except after the last station */
.rail { position: relative; display: flex; align-items: center; gap: var(--gap-xs); padding: var(--gap-xs) 0; }
.rail::before { content: ""; position: absolute; left: 0; right: calc(-1 * var(--gap-md)); top: 50%; height: 2px; background: var(--text); }
.rail.last::before { right: 0; }
.dot { position: relative; width: 12px; height: 12px; border-radius: 50%; background: var(--bg); border: 2px solid var(--text); flex: none; }
.mid { position: relative; background: var(--bg); padding-right: var(--gap-xs); font-size: var(--font-4xl); font-weight: 700; letter-spacing: -.01em; line-height: 1; transition: color 120ms; }
.col-hot .mid { color: var(--accent); }
.col-hot .dot { border-color: var(--accent); }

/* scope */
.scope { padding: var(--gap-sm) 0 var(--gap-md); display: grid; gap: var(--gap-xs); align-content: start; min-width: 0; }
.scope ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--gap-xs); }
.scope li { display: grid; grid-template-columns: 10px minmax(0, 1fr); gap: var(--gap-xs); align-items: baseline; font-size: var(--font-md); line-height: 1.35; transition: color 120ms; }
.scope li::before { content: ""; width: 10px; height: var(--bar); border-radius: 2px; background: var(--text); transform: translateY(-1px); transition: background-color 120ms; }
.scope li.hot { color: var(--accent); }
.scope li.hot::before { background: var(--accent); }
.note { margin: var(--gap-xs) 0 0; font-size: var(--font-xs); color: var(--text-muted); font-style: italic; line-height: 1.4; }

/* gates */
.gate { border-top: 2px solid var(--text); padding-top: var(--gap-sm); align-self: stretch; min-width: 0; }
.gate-label { font-size: var(--font-xs); text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); margin-bottom: var(--gap-xs); display: flex; align-items: center; gap: 5px; }
.gate-label svg { width: 10px; height: 10px; }
.gate-label svg path { stroke: var(--text-muted); fill: none; stroke-width: 1.5; }
.gate p { margin: 0; font-family: var(--font-prose); font-size: var(--font-body); line-height: 1.5; }
.gate strong { font-family: var(--font-ui); font-weight: 700; font-size: var(--font-lg); }

@container (max-width: 620px) {
  .grid { grid-template-columns: minmax(0, 1fr); }
  .grid > * { grid-column: 1 !important; grid-row: auto !important; }
  .stack { flex-direction: row; flex-wrap: wrap; align-items: center; padding: var(--gap-md) 0 var(--gap-xs); }
  .cell { width: 14px; }
  .cell.from-sep { margin: 0 0 0 4px; }
  .added { width: 100%; }
  .rail::before { right: 0; }
  .gate { margin-bottom: var(--gap-md); }
}
`;

const FLAG = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 9.5 V1 H8 L6.5 3 L8 5 H2"/></svg>';

function parseScope(cell) {
  const m = cell.match(/^(.*?)\.(?:\s+(.*))?$/);
  const [list, note] = m ? [m[1], m[2] || ''] : [cell, ''];
  return { items: list.split(/,\s+/).filter(Boolean), note };
}

const emphasize = (cell) => (cell.includes('**') ? cell : cell.replace(/\b(\d+ [a-z][a-z-]*)/g, '**$1**'));
const plain = (s) => s.replace(/[`*]/g, '').replace(/\\\$/g, '$');

export default function render(root, data, kit) {
  const ms = data.rows.map((r) => ({ id: r.m, ...parseScope(r.scope), done: r.done_when }));
  const n = ms.length;
  const doneLabel = kit.esc(data.columns.find((c) => c.key === 'done_when').label);
  const parts = [];

  ms.forEach((m, i) => {
    const place = (row) => `style="grid-column:${i + 1};grid-row:${row}"`;
    // stack, top to bottom: own items, then each earlier milestone's items (oldest lowest)
    const cells = [];
    for (let p = i; p >= 0; p--) {
      const src = ms[p];
      for (let k = src.items.length - 1; k >= 0; k--) {
        const cls = p === i ? ' own' : k === src.items.length - 1 ? ' from-sep' : '';
        cells.push(`<div class="cell${cls}" data-key="${p}:${k}" title="${kit.esc(src.id)} · ${kit.esc(plain(src.items[k]))}"></div>`);
      }
    }
    parts.push(`<div class="stack" data-col="${i}" ${place(1)}><div class="added">+${m.items.length}</div>${cells.join('')}</div>`);
    parts.push(`<div class="rail${i === n - 1 ? ' last' : ''}" data-col="${i}" ${place(2)}><span class="dot"></span><span class="mid">${kit.md(m.id)}</span></div>`);
    const items = m.items.map((s, k) => `<li data-key="${i}:${k}">${kit.md(s)}</li>`).join('');
    parts.push(`<div class="scope" data-col="${i}" ${place(3)}><ul>${items}</ul>${m.note ? `<p class="note">${kit.md(m.note)}</p>` : ''}</div>`);
    parts.push(`<div class="gate" data-col="${i}" ${place(4)}><div class="gate-label">${FLAG}${doneLabel}</div><p>${kit.md(emphasize(m.done))}</p></div>`);
  });

  root.innerHTML = `<style>${CSS}</style><div class="box"><div class="grid" style="--n:${Math.max(n, 1)}">${parts.join('')}</div></div>`;

  const all = (sel) => root.querySelectorAll(sel);
  const light = (key) => {
    all('[data-key]').forEach((el) => el.classList.toggle('hot', key != null && el.dataset.key === key));
    const origin = key == null ? null : key.split(':')[0];
    all('.rail').forEach((el) => el.classList.toggle('col-hot', el.dataset.col === origin));
  };
  all('[data-key]').forEach((el) => {
    el.addEventListener('mouseenter', () => light(el.dataset.key));
    el.addEventListener('mouseleave', () => light(null));
  });
}
