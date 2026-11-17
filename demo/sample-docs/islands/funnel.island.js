// funnel: one bar per stage, as a share of the first stage, with the step-to-step conversion beside it.
// Cell patterns this module parses:
//   Users  a whole number, commas allowed ("4,210")

export const contract = 1;

export const schema = {
  type: 'object',
  required: ['rows'],
  properties: {
    rows: {
      type: 'array',
      minItems: 2,
      items: {
        type: 'object',
        required: ['stage', 'users'],
        properties: { stage: { type: 'string' }, users: { type: 'string' } },
      },
    },
  },
  columns: { users: { pattern: /^\d{1,3}(,\d{3})*$/.source } },
};

export default function render(root, data, kit) {
  const rows = data.rows.map((r) => ({ stage: r.stage, n: Number(r.users.replace(/,/g, '')) }));
  const top = rows[0].n;
  root.innerHTML = `
    <style>
      .box { container-type: inline-size; display: grid; gap: var(--gap-sm); }
      .row { display: grid; grid-template-columns: minmax(0, 13rem) 1fr 4.5rem; gap: var(--gap-md); align-items: center; }
      .label { font-size: var(--font-sm); color: var(--text); }
      .track { height: 22px; background: var(--bg2); border-radius: var(--radius-sm); overflow: hidden; }
      .bar { height: 100%; background: var(--accent); border-radius: var(--radius-sm); display: flex; align-items: center; padding-left: var(--gap-xs); }
      .count { font-size: var(--font-xs); color: var(--bg); font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
      .step { font-size: var(--font-sm); color: var(--text-muted); font-variant-numeric: tabular-nums; text-align: right; }
      .step.low { color: var(--amber); font-weight: 600; }
      @container (max-width: 520px) {
        .row { grid-template-columns: 1fr 4rem; }
        .label { grid-column: 1 / -1; }
      }
    </style>
    <div class="box" role="img" aria-label="Users at each stage, as a share of those invited">
      ${rows.map((r, i) => {
        const step = i === 0 ? null : r.n / rows[i - 1].n;
        const low = step !== null && step === Math.min(...rows.slice(1).map((x, j) => x.n / rows[j].n));
        return `<div class="row">
          <div class="label">${kit.md(r.stage)}</div>
          <div class="track"><div class="bar" style="width: ${(100 * r.n) / top}%"><span class="count">${kit.esc(kit.fmt.num(r.n))}</span></div></div>
          <div class="step${low ? ' low' : ''}">${step === null ? '' : kit.esc(kit.fmt.pct(step))}</div>
        </div>`;
      }).join('')}
    </div>`;
}
