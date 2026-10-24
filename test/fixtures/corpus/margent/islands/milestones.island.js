// milestones: a build-order track read from the Build order table.
// Each milestone is a card on a line. Done cards carry a solid rule, the next one an accent rule,
// the rest a dashed muted rule, so progress reads at a glance.
//
// Cell patterns this module parses (anything else renders as plain text):
//   Milestone  "M{n} {name}"
//   Status     "Done", "Next" or "Planned"

export const contract = 1;

const COLS = ['milestone', 'status', 'what_it_adds', 'done_when'];

export const schema = {
  type: 'object',
  required: ['rows'],
  properties: {
    rows: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: COLS,
        properties: Object.fromEntries(COLS.map((k) => [k, { type: 'string' }])),
      },
    },
  },
  columns: {
    milestone: { pattern: /^M\d+\s+.+$/.source },
    status: { pattern: /^(Done|Next|Planned)$/.source },
  },
};

const CSS = `
.box { container-type: inline-size; font-family: var(--font-ui); color: var(--text); }
.track { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--gap-md); padding: var(--gap-sm) 0; }
.ms { border-top: 3px solid var(--text); padding-top: var(--gap-sm); min-width: 0; }
.ms.next { border-top-color: var(--accent); }
.ms.planned { border-top: 3px dashed var(--text-muted); }
.mk { font-family: var(--mono); font-size: var(--font-sm); color: var(--text-muted); }
.ms.next .mk { color: var(--accent); }
.name { font-size: var(--font-lg); font-weight: 600; line-height: 1.3; margin: 2px 0 var(--gap-xs); }
.adds { font-family: var(--font-prose); font-size: var(--font-md); line-height: 1.5; margin: 0 0 var(--gap-xs); }
.done { font-family: var(--font-prose); font-size: var(--font-md); color: var(--text-muted); line-height: 1.5; margin: 0; }
.done b { color: var(--text); font-family: var(--font-ui); font-weight: 500; }
code { font-family: var(--mono); font-size: .92em; }
a { color: var(--accent); }
@container (max-width: 640px) {
  .track { grid-template-columns: 1fr; gap: var(--gap-md); }
}
`;

const STATUS = { Done: 'done', Next: 'next', Planned: 'planned' };

export default function render(root, data, kit) {
  const cards = data.rows.map((r) => {
    const [id, ...rest] = r.milestone.trim().split(/\s+/);
    const cls = STATUS[r.status];
    return `<div class="ms ${cls}">
      <div class="mk">${kit.esc(id)} · ${kit.esc(cls)}</div>
      <div class="name">${kit.md(rest.join(' '))}</div>
      <p class="adds">${kit.md(r.what_it_adds)}</p>
      <p class="done"><b>Done when</b> ${kit.md(r.done_when)}</p>
    </div>`;
  }).join('');

  root.innerHTML = `<style>${CSS}</style>
    <div class="box"><div class="track">${cards}</div></div>`;
}
