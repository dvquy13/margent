// rollout: the rollout plan as a track of stages. Each stage shows its audience as a bar scaled to the last stage,
// its gate and its date. Done stages carry a check, the next one the accent, planned ones a dashed outline, and the
// track fills up to the next stage, so how far the rollout has come reads at a glance.
//
// Cell patterns this module parses (anything else renders as plain text):
//   Audience  a whole number, commas allowed ("4,210")
//   Date      YYYY-MM-DD
//   Status    "Done", "Next" or "Planned"

export const contract = 1;

const COLS = ['stage', 'audience', 'gate', 'date', 'status'];

export const schema = {
  type: 'object',
  required: ['rows'],
  properties: {
    rows: {
      type: 'array',
      minItems: 2,
      items: {
        type: 'object',
        required: COLS,
        properties: Object.fromEntries(COLS.map((k) => [k, { type: 'string' }])),
      },
    },
  },
  columns: {
    audience: { pattern: /^\d{1,3}(,\d{3})*$/.source },
    date: { pattern: /^\d{4}-\d{2}-\d{2}$/.source },
    status: { pattern: /^(Done|Next|Planned)$/.source },
  },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GLYPH = { Done: '✓', Next: '', Planned: '' };
const LABEL = { Done: 'Done', Next: 'Next', Planned: 'Planned' };

function day(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : iso;
}

export default function render(root, data, kit) {
  const rows = data.rows.map((r) => ({ ...r, n: Number(r.audience.replace(/,/g, '')) || 0 }));
  const max = Math.max(...rows.map((r) => r.n), 1);
  const done = rows.filter((r) => r.status === 'Done').length;
  const nextAt = rows.findIndex((r) => r.status === 'Next');
  // The track fills to the centre of the next stage, or to the last done one when nothing is next.
  const reach = nextAt >= 0 ? nextAt : Math.max(done - 1, 0);
  const fill = rows.length > 1 ? reach / (rows.length - 1) : 1;
  const next = nextAt >= 0 ? rows[nextAt] : null;
  root.innerHTML = `
    <style>
      .box { container-type: inline-size; }
      .head { display: flex; align-items: baseline; gap: var(--gap-md); margin-bottom: var(--gap-lg); }
      .big { font-size: var(--font-4xl); font-weight: 650; font-variant-numeric: tabular-nums; line-height: 1; }
      .sub { font-size: var(--font-sm); color: var(--text-muted); }
      .sub b { color: var(--text); font-weight: 600; }
      .stages { --n: ${rows.length}; position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: var(--gap-md); }
      .rail { position: absolute; top: 15px; left: calc(50% / var(--n)); right: calc(50% / var(--n)); height: 2px; background: var(--border); }
      .rail i { position: absolute; inset: 0 auto 0 0; width: ${(fill * 100).toFixed(2)}%; background: var(--text); }
      .stage { position: relative; display: grid; justify-items: center; text-align: center; gap: var(--gap-xs); }
      .dot { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-size: var(--font-sm); font-weight: 700;
             background: var(--bg); border: 2px solid var(--border); color: var(--text-muted); position: relative; z-index: 1; }
      .Done .dot { background: var(--text); border-color: var(--text); color: var(--bg); }
      .Next .dot { border-color: var(--accent); background: var(--accent-light); }
      .Next .dot::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
      .Planned .dot { border-style: dashed; }
      .name { font-size: var(--font-md); font-weight: 600; margin-top: var(--gap-xs); }
      .Planned .name { color: var(--text-muted); }
      .tag { font-size: var(--font-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
      .Done .tag { color: var(--green); }
      .Next .tag { color: var(--accent); font-weight: 600; }
      .bar { width: 100%; height: 6px; border-radius: var(--radius-pill); background: var(--bg2); overflow: hidden; margin-top: var(--gap-sm); }
      .bar i { display: block; height: 100%; background: var(--text-muted); border-radius: var(--radius-pill); }
      .Done .bar i { background: var(--text); }
      .Next .bar i { background: var(--accent); }
      .Planned .bar i { background: var(--border); }
      .n { font-size: var(--font-lg); font-weight: 650; font-variant-numeric: tabular-nums; }
      .gate { font-size: var(--font-sm); color: var(--text-muted); line-height: 1.35; }
      .date { font-family: var(--mono); font-size: var(--font-xs); color: var(--text-muted); }
      @container (max-width: 560px) {
        .stages { grid-template-columns: 1fr; gap: var(--gap-lg); }
        .rail { top: 16px; bottom: 16px; left: 15px; right: auto; width: 2px; height: auto; }
        .rail i { inset: 0 0 auto 0; width: auto; height: ${(fill * 100).toFixed(2)}%; }
        .stage { grid-template-columns: 32px 1fr; justify-items: start; text-align: left; column-gap: var(--gap-md); }
        .stage > :not(.dot) { grid-column: 2; }
        .dot { grid-row: 1 / span 6; }
        .name { margin-top: 0; }
      }
    </style>
    <div class="box">
      <div class="head">
        <span class="big">${kit.esc(String(done))}/${kit.esc(String(rows.length))}</span>
        <span class="sub">stages done${next ? ` · next: <b>${kit.md(next.stage)}</b>, ${kit.esc(kit.fmt.num(next.n))} users, once ${kit.md(next.gate.charAt(0).toLowerCase() + next.gate.slice(1))}` : ''}</span>
      </div>
      <div class="stages" role="img" aria-label="Rollout stages, ${done} of ${rows.length} done">
        <div class="rail"><i></i></div>
        ${rows.map((r) => {
          const cls = LABEL[r.status] ? r.status : 'Planned';
          return `<div class="stage ${cls}">
            <div class="dot">${GLYPH[r.status] ?? ''}</div>
            <div class="name">${kit.md(r.stage)}</div>
            <div class="tag">${kit.esc(LABEL[r.status] ?? r.status)}</div>
            <div class="bar"><i style="width: ${((100 * r.n) / max).toFixed(1)}%"></i></div>
            <div class="n">${kit.esc(kit.fmt.num(r.n))}</div>
            <div class="gate">${kit.md(r.gate)}</div>
            <div class="date">${kit.esc(day(r.date))}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}
