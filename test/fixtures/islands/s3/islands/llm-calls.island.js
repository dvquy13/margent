// llm-calls: every LLM call as a card, read from the LLM usage table.
// Top: the month's total beside a cost strip of the measured calls. Middle:
// calls grouped by what their cells say: per-item calls ("Every {unit}") drawn
// as a flow in table order, proposed calls ("proposed for M{n}") with dashed
// outlines, then the rest. Bottom: a detail panel with the full row.
//
// Cell patterns this module parses (anything else renders as plain text):
//   What it decides, and when   "{question}? {when}" split at the last "? "
//   Model                       "proposed for M{n}" (any case) becomes a badge
//   Cost                        "\$1.58 (41%)": amount, plus a stated share it cross-checks
//   Evaluated by                "Eval {n}" or "S{n}" as the reference; eval kind from
//                               "Eval {n}" / "No quality eval" / "None yet" / "planned" / "Only indirectly"
// Marker attribute: total (the month's total; stage costs are rounded, so their sum is off by a cent).

export const contract = 1;

const COLS = ['call', 'what_it_decides_and_when', 'model', 'cost_average_month', 'evaluated_by'];

export const schema = {
  type: 'object',
  required: ['columns', 'rows', 'attrs'],
  properties: {
    columns: {
      type: 'array',
      items: { type: 'object', required: ['key', 'label'], properties: { key: { type: 'string' }, label: { type: 'string' } } },
      allOf: COLS.map((k) => ({ contains: { type: 'object', properties: { key: { const: k } }, required: ['key'] } })),
    },
    rows: {
      type: 'array',
      minItems: 1,
      items: { type: 'object', required: COLS, properties: Object.fromEntries(COLS.map((k) => [k, { type: 'string' }])) },
    },
    attrs: {
      type: 'object',
      required: ['total'],
      properties: { total: { type: 'string', pattern: '^\\d+(\\.\\d+)?$' } },
      additionalProperties: false,
    },
  },
  // Column patterns (contract v1, R3.1). Each is the shape the module's parsers read; a cell outside it renders
  // as plain text, so the badge names it. Rows that are not "Every {unit}" or "proposed" are valid, so the patterns
  // only reject wording the parsers would misread.
  columns: {
    what_it_decides_and_when: { pattern: /^(?:[^?]*|.*\?\s+\S.*)$/.source },
    model: { pattern: /^(?!.*[Pp]roposed\b(?! for M\d+\b)).*$/.source },
    cost_average_month: { pattern: /^(?![\\$\d])|^\\?\$\d+(?:\.\d+)?(?:\s*\(\d+(?:\.\d+)?%\))?$/.source },
    evaluated_by: { pattern: /\b(?:Eval \d+|S\d+)\b|[Nn]o quality eval|^[Nn]one\b|\bplanned\b|^[Oo]nly indirectly/.source },
  },
};

// Display config.
const EVAL_KINDS = {
  labeled: 'Has a numbered eval',
  planned: 'Eval planned',
  indirect: 'Only indirectly',
  none: 'No quality eval',
};
const GROUPS = { flow: 'Per item', proposed: 'Proposed', other: 'Other calls' };

const CSS = (kit) => `
.box { container-type: inline-size; font-family: var(--font-ui); color: var(--text); }
code { font-family: var(--mono); font-size: .92em; }
a { color: var(--accent); }
.wrap { display: grid; gap: var(--gap-lg); padding: var(--gap-sm) 0; --gutter: 7.5rem; }

/* total + cost strip */
.hero { display: grid; grid-template-columns: var(--gutter) minmax(0, 1fr); gap: 0 var(--gap-md); align-items: start; }
.total { font-size: var(--font-5xl); font-weight: 650; letter-spacing: -.02em; line-height: 1; font-variant-numeric: tabular-nums; }
.total-sub { font-size: var(--font-xs); color: var(--text-muted); margin-top: var(--gap-xs); text-transform: uppercase; letter-spacing: .06em; }
.strip { display: flex; gap: 3px; padding-top: .6rem; }
.seg { all: unset; cursor: pointer; position: relative; display: grid; gap: var(--gap-xs); min-width: 0; }
.seg .bar { height: 10px; background: var(--text); border-radius: 2px; transition: background-color 120ms; }
.seg .lab { justify-self: start; display: flex; flex-direction: column; gap: 1px; font-size: var(--font-sm); white-space: nowrap; transition: color 120ms; }
.seg.narrow .lab { position: absolute; right: 0; top: calc(10px + var(--gap-xs)); align-items: flex-end; text-align: right; }
.seg .lab b { font-weight: 600; }
.seg .lab span { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.seg .lab .bad { color: ${kit.tone('stop')}; }
.seg:hover .bar, .seg.on .bar { background: var(--accent); }
.seg:hover .lab, .seg:hover .lab span, .seg.on .lab, .seg.on .lab span { color: var(--accent); }
.seg:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

/* groups */
.groups { display: grid; gap: var(--gap-md); }
.group { display: grid; grid-template-columns: var(--gutter) minmax(0, 1fr); gap: 0 var(--gap-md); align-items: center; }
.glabel { font-size: var(--font-xs); text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
.row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--gap-sm); }
.flow { display: flex; align-items: stretch; }
.flow .card { flex: 1 1 0; min-width: 0; }
.link { flex: 0 0 auto; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 0 var(--gap-xs); min-width: 4.25rem; }
.link span { font-size: var(--font-xs); color: var(--text-muted); white-space: nowrap; margin-bottom: 3px; }
.link svg { display: block; width: 100%; height: 8px; overflow: visible; }
.link line, .link path { stroke: var(--text-muted); fill: none; stroke-width: 1.25; }

/* cards */
.card { all: unset; box-sizing: border-box; cursor: pointer; display: flex; flex-direction: column; gap: var(--gap-xs);
  padding: var(--gap-sm); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg);
  transition: border-color 120ms; position: relative; min-width: 0; }
.card.proposed { border-style: dashed; background: transparent; }
.card:hover, .card.on { border-color: var(--accent); }
.card:hover .name, .card.on .name { color: var(--accent); }
.card.on { box-shadow: inset 0 0 0 1px var(--accent); }
.card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.name { font-size: var(--font-base); font-weight: 600; line-height: 1.25; transition: color 120ms; }
.card.proposed .name { padding-right: 2.2rem; }
.decides { font-family: var(--font-prose); font-size: var(--font-sm); line-height: 1.4; }
.when { font-size: var(--font-xs); color: var(--text-muted); line-height: 1.35; }
.model { font-family: var(--mono); font-size: var(--font-xs); line-height: 1.4; overflow-wrap: anywhere; }
.foot { margin-top: auto; padding-top: var(--gap-xs); display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: var(--gap-xs); }
.cost { font-variant-numeric: tabular-nums; font-weight: 650; font-size: var(--font-lg); }
.cost.text { font-weight: 400; font-size: var(--font-xs); color: var(--text-muted); }
.ev { display: inline-flex; align-items: center; gap: 4px; font-size: var(--font-xs); color: var(--text-muted); white-space: nowrap; }
.badge { position: absolute; top: var(--gap-sm); right: var(--gap-sm); font-size: var(--font-xs); font-family: var(--mono);
  border: 1px dashed var(--text-muted); color: var(--text-muted); border-radius: var(--radius-pill); padding: 0 6px; line-height: 1.5; }
.glyph { width: 11px; height: 11px; flex: none; }
.glyph * { stroke: var(--text); stroke-width: 1.4; }
.glyph .solid { fill: var(--text); stroke: none; }

/* legend */
.legend { display: flex; flex-wrap: wrap; gap: var(--gap-xs) var(--gap-md); margin-left: calc(var(--gutter) + var(--gap-md));
  font-size: var(--font-xs); color: var(--text-muted); }
.legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend .dash { width: 18px; height: 11px; border: 1px dashed var(--text-muted); border-radius: 2px; }

/* detail */
.detail { margin: 0 0 0 calc(var(--gutter) + var(--gap-md)); border-top: 2px solid var(--text); padding-top: var(--gap-sm);
  display: grid; grid-template-columns: 8rem minmax(0, 1fr); gap: var(--gap-xs) var(--gap-md); font-size: var(--font-body); line-height: 1.5; }
.detail h4 { grid-column: 1 / -1; margin: 0 0 var(--gap-xs); font-size: var(--font-2xl); font-weight: 650; }
.detail dt { font-size: var(--font-xs); text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); padding-top: 3px; }
.detail dd { margin: 0; }

@container (max-width: 680px) {
  .wrap { --gutter: 0rem; }
  .hero, .group { grid-template-columns: minmax(0, 1fr); gap: var(--gap-sm); }
  .row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .flow { flex-direction: column; }
  .link { flex-direction: row-reverse; justify-content: flex-end; gap: var(--gap-xs); padding: var(--gap-xs) 0; min-height: 2rem; }
  .link span { margin: 0; }
  .link svg { width: 22px; transform: rotate(90deg); }
  .legend, .detail { margin-left: 0; }
  .detail { grid-template-columns: minmax(0, 1fr); }
}
`;

const GLYPHS = {
  labeled: '<circle class="solid" cx="5.5" cy="5.5" r="4.5"/>',
  planned: '<circle cx="5.5" cy="5.5" r="4.5" fill="none" stroke-dasharray="2 1.6"/>',
  indirect: '<circle cx="5.5" cy="5.5" r="4.5" fill="none"/><path class="solid" d="M5.5 1 A4.5 4.5 0 0 0 5.5 10 Z"/>',
  none: '<circle cx="5.5" cy="5.5" r="4.5" fill="none"/>',
};
const glyph = (kind) => (GLYPHS[kind] ? `<svg class="glyph" viewBox="0 0 11 11" aria-hidden="true">${GLYPHS[kind]}</svg>` : '');
const ARROW = '<svg viewBox="0 0 60 8" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="4" x2="58" y2="4"/><path d="M53 1 L58 4 L53 7"/></svg>';

// ---- cell parsing ----

function parseDecides(cell) {
  const m = cell.match(/^(.*\?)\s+(.+)$/);
  return m ? { decides: m[1], when: m[2] } : { decides: cell, when: '' };
}

function parseModel(cell) {
  const m = cell.match(/,?\s*\bproposed for (M\d+)\b/i);
  if (!m) return { model: cell, proposed: null };
  return { model: (cell.slice(0, m.index) + cell.slice(m.index + m[0].length)).trim(), proposed: m[1] };
}

function parseCost(cell) {
  const m = cell.match(/^\\?\$(\d+(?:\.\d+)?)(?:\s*\((\d+(?:\.\d+)?)%\))?$/);
  return m ? { usd: +m[1], stated: m[2] == null ? null : +m[2] } : { usd: null, text: cell };
}

function parseEval(cell) {
  const refs = [...cell.matchAll(/\b(Eval \d+|S\d+)\b/g)].map((m) => m[1]);
  const evalRef = refs.find((r) => r.startsWith('Eval'));
  let kind = null;
  if (evalRef) kind = 'labeled';
  else if (/no quality eval|^none\b/i.test(cell)) kind = 'none';
  else if (/\bplanned\b/i.test(cell)) kind = 'planned';
  else if (/^only indirectly/i.test(cell)) kind = 'indirect';
  return { by: cell, ref: evalRef || refs[0] || '', kind };
}

const plain = (s) => s.replace(/[`*]/g, '').replace(/\\\$/g, '$');

export default function render(root, data, kit) {
  const total = +data.attrs.total;
  const costLabel = data.columns.find((c) => c.key === 'cost_average_month').label;
  const label = (key) => data.columns.find((c) => c.key === key).label;

  const calls = data.rows.map((r, i) => {
    const d = parseDecides(r.what_it_decides_and_when);
    const unit = (d.when.match(/^Every (.+)$/) || [])[1] || null;
    return { i, name: r.call, ...d, unit, ...parseModel(r.model), modelCell: r.model, cost: parseCost(r.cost_average_month),
      costCell: r.cost_average_month, ev: parseEval(r.evaluated_by) };
  });
  for (const c of calls) c.group = c.unit ? 'flow' : c.proposed ? 'proposed' : 'other';
  const measured = calls.filter((c) => c.cost.usd != null);
  for (const c of measured) {
    c.share = c.cost.usd / total;
    c.mismatch = c.cost.stated != null && kit.fmt.pct(c.share) !== c.cost.stated + '%';
  }
  let selected = (measured[0] || calls[0]).i;

  const costHtml = (c) => (c.cost.usd != null
    ? `<span class="cost">${kit.fmt.usd(c.cost.usd)}</span>`
    : `<span class="cost text">${kit.md(c.cost.text)}</span>`);

  const card = (c) => `<button class="card${c.proposed ? ' proposed' : ''}" data-i="${c.i}" aria-label="${kit.esc(plain(c.name))}">
      ${c.proposed ? `<span class="badge" title="proposed for ${kit.esc(c.proposed)}">${kit.esc(c.proposed)}</span>` : ''}
      <span class="name">${kit.md(c.name)}</span>
      <span class="decides">${kit.md(c.decides)}</span>
      ${c.when ? `<span class="when">${kit.md(c.when)}</span>` : ''}
      ${c.model ? `<span class="model">${kit.md(c.model)}</span>` : ''}
      <span class="foot">${costHtml(c)}<span class="ev" title="${kit.esc(EVAL_KINDS[c.ev.kind] || '')}">${glyph(c.ev.kind)}${kit.esc(c.ev.ref || EVAL_KINDS[c.ev.kind] || '')}</span></span>
    </button>`;

  const groupHtml = (g) => {
    const members = calls.filter((c) => c.group === g);
    if (!members.length) return '';
    const body = g === 'flow'
      ? `<div class="flow">${members.map((c) => `<div class="link"><span>${kit.md(c.unit)}</span>${ARROW}</div>${card(c)}`).join('')}</div>`
      : `<div class="row">${members.map(card).join('')}</div>`;
    return `<div class="group"><div class="glabel">${GROUPS[g]}</div>${body}</div>`;
  };

  const strip = measured.map((c, k) => `<button class="seg${k > 0 && c.share < 0.2 ? ' narrow' : ''}" data-i="${c.i}" style="flex:${c.cost.usd} 1 0">
      <span class="bar"></span>
      <span class="lab"><b>${kit.md(c.name)}</b><span>${kit.fmt.usd(c.cost.usd)} · ${kit.fmt.pct(c.share)}${c.mismatch ? ` <span class="bad">table says ${kit.esc(c.cost.stated)}%</span>` : ''}</span></span>
    </button>`).join('');

  const usedKinds = Object.keys(EVAL_KINDS).filter((k) => calls.some((c) => c.ev.kind === k));
  const legend = usedKinds.map((k) => `<span>${glyph(k)}${EVAL_KINDS[k]}</span>`).join('')
    + (calls.some((c) => c.proposed) ? '<span><i class="dash"></i>proposed, milestone in corner</span>' : '');

  root.innerHTML = `<style>${CSS(kit)}</style>
    <div class="box"><div class="wrap">
      <div class="hero">
        <div><div class="total">${kit.fmt.usd(total)}</div><div class="total-sub">${kit.esc(costLabel)}</div></div>
        <div class="strip">${strip}</div>
      </div>
      <div class="groups">${Object.keys(GROUPS).map(groupHtml).join('')}</div>
      <div class="legend">${legend}</div>
      <dl class="detail" aria-live="polite"></dl>
    </div></div>`;

  const detail = root.querySelector('.detail');
  const show = () => {
    const c = calls[selected];
    root.querySelectorAll('[data-i]').forEach((el) => el.classList.toggle('on', +el.dataset.i === selected));
    const next = calls.find((x) => x.group === 'flow' && x.i > c.i);
    const rows = [
      ['Decides', kit.md(c.decides)],
      c.when && ['When', kit.md(c.when)],
      c.unit && next && next.unit && ['Hands on', `${kit.md(c.unit)} → ${kit.md(next.unit)}`],
      [label('model'), kit.md(c.modelCell)],
      [costLabel, kit.md(c.costCell) + (c.share == null ? ''
        : c.cost.stated != null && !c.mismatch ? ` of ${kit.fmt.usd(total)}` : ` · ${kit.fmt.pct(c.share)} of ${kit.fmt.usd(total)}`)],
      [label('evaluated_by'), kit.md(c.ev.by)],
    ].filter(Boolean);
    detail.innerHTML = `<h4>${kit.md(c.name)}</h4>` + rows.map(([k, v]) => `<dt>${kit.esc(k)}</dt><dd>${v}</dd>`).join('');
  };
  root.querySelectorAll('[data-i]').forEach((el) => {
    el.addEventListener('click', () => { selected = +el.dataset.i; show(); });
  });
  show();
}
