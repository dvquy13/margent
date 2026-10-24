// milestone-status: a status board read from the milestone table in the handbook.
// Top: a tally per verdict kind (kinds nobody got show as a grey zero). Below: one row per milestone,
// with one chip per comma-separated verdict part, coloured by its kind.
//
// Cell patterns this module parses (a cell that does not match still shows, as a plain grey chip):
//   Milestone  "{id} {name}", for example "M1 Render and islands"
//   Verdict    comma list of parts, each starting with a kind: Proceed, Adjust, Decided or Stop

export const contract = 1;

const COLS = ['milestone', 'outcome', 'verdict'];
const PART = '(?:Proceed|Adjust|Decided|Stop)\\b[^,]*';
const VERDICT_PATTERN = `^${PART}(?:,\\s*${PART})*$`;

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
      items: {
        type: 'object',
        required: COLS,
        properties: Object.fromEntries(COLS.map((k) => [k, { type: 'string' }])),
      },
    },
    attrs: { type: 'object', maxProperties: 0 },
  },
  // Column patterns: the milestone is "M{n} {name}", and every comma part of the verdict starts with a kind.
  columns: {
    milestone: { pattern: '^M\\d+\\s+\\S' },
    verdict: { pattern: VERDICT_PATTERN },
  },
};

// Display config: every verdict kind the board knows, in tally order, and the tone each one draws in.
const KINDS = [
  { kind: 'Proceed', tone: 'go' },
  { kind: 'Adjust', tone: 'warn' },
  { kind: 'Decided', tone: 'done' },
  { kind: 'Stop', tone: 'stop' },
];
const TONE = Object.fromEntries(KINDS.map((k) => [k.kind, k.tone]));

const CSS = `
.box { container-type: inline-size; font-family: var(--font-ui); color: var(--text); }
.tally { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--gap-sm); }
.cell { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: var(--gap-sm); }
.cell .n { display: block; font-size: var(--font-2xl); font-weight: 650; font-variant-numeric: tabular-nums; }
.cell .lbl { font-size: var(--font-sm); color: var(--text-muted); }
.cell.zero .n { color: var(--text-muted); }
.row { display: grid; grid-template-columns: 4.5em 1fr; gap: var(--gap-sm); padding: var(--gap-sm) 0; border-top: 1px solid var(--border); }
.id { font-family: var(--mono); color: var(--accent); }
.name { font-weight: 600; }
.outcome { color: var(--text-muted); font-size: var(--font-sm); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.chip { font-size: var(--font-sm); border: 1px solid var(--tone, var(--border)); color: var(--tone, var(--text-muted)); border-radius: var(--radius-pill); padding: 2px 10px; }
.chip.plain { border-color: var(--border); color: var(--text-muted); }
a { color: var(--accent); }
@container (max-width: 480px) {
  .tally { grid-template-columns: repeat(2, 1fr); }
  .row { grid-template-columns: 1fr; }
}
`;

function splitMilestone(cell) {
  const m = /^(\S+)\s+([\s\S]*)$/.exec(cell);
  return m ? { id: m[1], name: m[2] } : { id: '', name: cell };
}

function parseVerdict(cell) {
  return cell.split(',').map((part) => {
    const m = /^\s*(Proceed|Adjust|Decided|Stop)\b/.exec(part);
    return { text: part.trim(), kind: m ? m[1] : null };
  });
}

export default function render(root, data, kit) {
  const rows = data.rows.map((r) => ({
    ...splitMilestone(r.milestone),
    outcome: r.outcome,
    parts: parseVerdict(r.verdict),
  }));

  const tally = KINDS.map(({ kind }) => ({
    kind,
    n: rows.reduce((s, r) => s + r.parts.filter((p) => p.kind === kind).length, 0),
  }));

  root.innerHTML = `
    <style>${CSS}</style>
    <div class="box">
      <div class="tally" role="list" aria-label="Verdicts across milestones">
        ${tally.map((t) => `
          <div class="cell${t.n === 0 ? ' zero' : ''}" role="listitem" style="--tone: ${kit.tone(TONE[t.kind])}">
            <span class="n">${kit.esc(kit.fmt.num(t.n))}</span>
            <span class="lbl">${kit.esc(t.kind)}</span>
          </div>`).join('')}
      </div>
      ${rows.map((r) => `
        <div class="row">
          <div class="id">${kit.esc(r.id)}</div>
          <div>
            <div class="name">${kit.md(r.name)}</div>
            <div class="outcome">${kit.md(r.outcome)}</div>
            <div class="chips">
              ${r.parts.map((p) => p.kind
                ? `<span class="chip" style="--tone: ${kit.tone(TONE[p.kind])}">${kit.md(p.text)}</span>`
                : `<span class="chip plain">${kit.md(p.text)}</span>`).join('')}
            </div>
          </div>
        </div>`).join('')}
    </div>`;
}
