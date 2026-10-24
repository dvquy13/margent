// spike-verdicts: a verdict board read from the M0 verdicts table.
// Top: a tally per verdict kind (kinds nobody got show as a grey zero), each a
// filter. Below: one row per table row, question -> verdict pills -> what changed.
// A "what changed" sentence with two or more "$N label" amounts, one labelled
// "cap", is drawn as a gauge against that cap.
//
// Cell patterns this module parses (anything else renders as plain text):
//   Spike    "{id} {name}", id "S4" or a range "S8–S10" (counts as 3 spikes)
//   Verdict  comma list of "[number word] {Kind}[s] [qualifier]", Kind in KINDS
//   Changed  sentences; amounts "\$3.87 average"

export const contract = 1;

const COLS = ['spike', 'question', 'verdict', 'what_it_changed'];

// One verdict part: optional count ("three"), a verdict kind, an optional qualifier. Parts are comma-separated.
const VERDICT_PART = '(?:(?:\\d+|[a-z]+)\\s+)?(?:[Pp]roceed|[Aa]djust|[Dd]ecided|[Ss]top)s?\\b[^,]*';
const VERDICT_PATTERN = `^${VERDICT_PART}(?:,\\s*${VERDICT_PART})*$`;

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
  // Column patterns (R3.1). Spike: "S4" or a range "S8–S10", then the name. Verdict: comma-separated parts, each
  // with an optional count and a verdict kind (the kinds in KINDS above). Other cells are read as plain text.
  columns: {
    spike: { pattern: /^S\d+(?:\s*[\u2013-]\s*S?\d+)?\s+.+$/.source },
    verdict: { pattern: VERDICT_PATTERN },
  },
};

// Display config: every verdict kind the board knows, in tally order.
const KINDS = {
  proceed: { label: 'Proceed', tone: 'go' },
  adjust: { label: 'Adjust', tone: 'warn' },
  decided: { label: 'Decided', tone: 'done' },
  stop: { label: 'Stop', tone: 'stop' },
};
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const CSS = (kit) => `
.box { container-type: inline-size; font-family: var(--font-ui); color: var(--text); }
code { font-family: var(--mono); font-size: .92em; }
a { color: var(--accent); }
.wrap { display: grid; gap: var(--gap-lg); padding: var(--gap-sm) 0; --cols: 4.5rem minmax(0, 1.15fr) 10.5rem minmax(0, 1.25fr); }

/* tally: every item has the same box, so the numbers share one baseline */
.tally { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gap-sm) var(--gap-lg); }
.t { all: unset; display: grid; justify-items: start; padding-bottom: 4px; border-bottom: 2px solid transparent; }
button.t { cursor: pointer; transition: color 120ms, border-color 120ms; }
.big { font-size: var(--font-5xl); font-weight: 650; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.cap { font-size: var(--font-xs); line-height: 1rem; height: 1rem; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted);
  margin-top: var(--gap-xs); display: flex; align-items: center; gap: 5px; white-space: nowrap; }
.sub { text-transform: none; letter-spacing: 0; }
button.t:hover, button.t:hover .cap { color: var(--accent); }
.t.on { border-bottom-color: var(--accent); }
.t.zero .big { color: var(--text-muted); font-weight: 400; }
button.t:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.sep { width: 1px; align-self: stretch; background: var(--border); }

/* dots */
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex: none; }
${Object.values(KINDS).map((k) => `.tone-${k.tone} { background: ${kit.tone(k.tone)}; }`).join('\n')}
.tone-neutral { background: ${kit.tone('neutral')}; }

/* board */
.row { display: grid; grid-template-columns: var(--cols); gap: var(--gap-sm) var(--gap-md); padding: var(--gap-sm) 0;
  border-top: 1px solid var(--border); transition: opacity 150ms; }
.row.head { border-top: 0; padding-top: 0; font-size: var(--font-xs); text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); }
.row.head > *:first-child { grid-column: 1 / 3; }
.row.dim { opacity: .22; }
.id { font-family: var(--mono); font-size: var(--font-sm); font-weight: 600; padding-top: 2px; white-space: nowrap; }
.name { font-size: var(--font-base); font-weight: 600; line-height: 1.3; }
.q { font-family: var(--font-prose); font-size: var(--font-md); color: var(--text-muted); line-height: 1.45; margin-top: 3px; }
.verdict { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; padding-top: 1px; }
.pill { display: inline-flex; align-items: center; gap: 6px; font-size: var(--font-sm); font-weight: 600; border: 1px solid var(--border);
  border-radius: var(--radius-pill); padding: 2px 9px 2px 7px; white-space: nowrap; }
.pill .what { font-weight: 400; color: var(--text-muted); }
.pill .n { display: inline-flex; align-items: center; gap: 3px; font-weight: 400; color: var(--text-muted); }
.pill .n .dot { width: 6px; height: 6px; }
.change { font-family: var(--font-prose); font-size: var(--font-body); line-height: 1.5; display: grid; gap: var(--gap-xs); align-content: start; min-width: 0; }
.change ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.change li { position: relative; padding-left: 14px; }
.change li::before { content: ""; position: absolute; left: 0; top: .62em; width: 6px; height: 1.5px; background: var(--text-muted); }
.change li:only-child { padding-left: 0; }
.change li:only-child::before { display: none; }

/* gauge: label positions are clamped so nothing leaves the box */
.gauge { position: relative; height: 3.4rem; margin: 0 2px; font-family: var(--font-ui); }
.track { position: absolute; left: 0; right: 0; top: 1.55rem; height: 8px; border-radius: 2px;
  background: repeating-linear-gradient(90deg, var(--bg3) 0 4px, transparent 4px 7px); }
.fill { position: absolute; top: 0; bottom: 0; border-radius: 2px; background: var(--text); }
.fill.f1 { opacity: .3; }
.tick { position: absolute; top: 1.3rem; width: 1.5px; height: calc(8px + .5rem); background: var(--text); }
.tick.limit { width: 2px; }
.glab { position: absolute; transform: translateX(-100%); padding-right: 5px; font-size: var(--font-xs); color: var(--text-muted); white-space: nowrap; }
.glab b { color: var(--text); font-size: var(--font-sm); font-variant-numeric: tabular-nums; }
.glab.up { top: 0; }
.glab.down { top: 2.25rem; }

@container (max-width: 640px) {
  .wrap { --cols: 3.5rem minmax(0, 1fr); }
  .row.head { display: none; }
  .verdict { grid-column: 2; flex-direction: row; flex-wrap: wrap; }
  .change { grid-column: 2; }
  .sep { display: none; }
}
`;

// ---- cell parsing ----

function parseSpike(cell) {
  const m = cell.match(/^(S(\d+)(?:\s*[–-]\s*S?(\d+))?)\s+(.+)$/);
  if (!m) return { id: '', name: cell, n: 1 };
  const n = m[3] ? Math.max(1, +m[3] - +m[2] + 1) : 1;
  return { id: m[1], name: m[4], n };
}

function parseVerdict(cell) {
  return cell.split(/,\s*/).filter(Boolean).map((part) => {
    const m = part.match(/^(?:(\d+|[a-z]+)\s+)?([A-Za-z]+?)s?(?:\s+(.*))?$/);
    const word = m && m[1] && m[1].toLowerCase();
    const kind = m && KINDS[m[2].toLowerCase()] ? m[2].toLowerCase() : null;
    const count = word == null ? 1 : (WORDS[word] || +word || null);
    if (!kind || !count) return { kind: null, raw: part, count: 1 };
    return { kind, count, what: m[3] || '' };
  });
}

const sentences = (cell) => cell.split(/(?<=[.!?])\s+(?=[A-Z0-9`*\\$])/).filter(Boolean);

// "\$3.87 average, \$5.88 peak, under the \$10 cap." -> gauge, else null
function parseGauge(sentence) {
  const amounts = [...sentence.matchAll(/\\?\$(\d+(?:\.\d+)?)\s+([a-z][a-z-]*)/g)].map((m) => ({ value: +m[1], label: m[2] }));
  const limit = amounts.find((a) => a.label === 'cap');
  const marks = amounts.filter((a) => a !== limit);
  if (!limit || marks.length < 1 || amounts.length < 2) return null;
  return { marks: marks.sort((a, b) => a.value - b.value), limit, text: sentence };
}

const money = (kit, v) => (Number.isInteger(v) ? '$' + v : kit.fmt.usd(v));

function gaugeHtml(g, kit) {
  const max = Math.max(g.limit.value, ...g.marks.map((m) => m.value));
  const pct = (v) => Math.max(0, Math.min(100, (v / max) * 100));
  let prev = 0;
  const fills = g.marks.map((m, i) => {
    const html = `<div class="fill${i ? ' f1' : ''}" style="left:${pct(prev)}%;width:${pct(m.value) - pct(prev)}%"></div>`;
    prev = m.value;
    return html;
  }).join('');
  // labels hang left of their tick; keep at least 5rem from the left edge so they stay inside
  const labels = g.marks.map((m, i) => `<div class="tick" style="left:${pct(m.value)}%"></div>
    <div class="glab ${i % 2 ? 'down' : 'up'}" style="left:max(5rem, ${pct(m.value)}%)"><b>${money(kit, m.value)}</b> ${kit.esc(m.label)}</div>`).join('');
  const limit = `<div class="tick limit" style="left:calc(${pct(g.limit.value)}% - 2px)"></div>
    <div class="glab down" style="left:${pct(g.limit.value)}%"><b>${money(kit, g.limit.value)}</b> ${kit.esc(g.limit.label)}</div>`;
  return `<div class="gauge" role="img" aria-label="${kit.esc(g.text.replace(/\\\$/g, '$'))}"><div class="track">${fills}</div>${labels}${limit}</div>`;
}

export default function render(root, data, kit) {
  const spikes = data.rows.map((r) => ({
    ...parseSpike(r.spike),
    question: r.question,
    verdict: parseVerdict(r.verdict),
    changed: sentences(r.what_it_changed),
  }));
  const has = (s, k) => s.verdict.some((v) => v.kind === k);
  const total = spikes.reduce((a, s) => a + s.n, 0);
  let filter = null;

  const tally = Object.entries(KINDS).map(([k, def]) => {
    const n = spikes.filter((s) => has(s, k)).reduce((a, s) => a + s.n, 0);
    const each = spikes.reduce((a, s) => a + s.n * s.verdict.filter((v) => v.kind === k).reduce((b, v) => b + v.count, 0), 0);
    return `<button class="t${n ? '' : ' zero'}" data-kind="${k}" aria-pressed="false">
      <span class="big">${kit.fmt.num(n)}</span>
      <span class="cap"><i class="dot tone-${def.tone}"></i>${kit.esc(def.label)}${each > n ? ` <span class="sub">· ${kit.fmt.num(each)} in all</span>` : ''}</span>
    </button>`;
  }).join('');

  const pill = (v) => {
    if (!v.kind) return `<span class="pill"><i class="dot tone-neutral"></i>${kit.md(v.raw)}</span>`;
    const def = KINDS[v.kind];
    const count = v.count > 1
      ? `<span class="n" aria-label="${v.count}">${('<i class="dot tone-' + def.tone + '"></i>').repeat(v.count)}×${v.count}</span>` : '';
    return `<span class="pill"><i class="dot tone-${def.tone}"></i>${kit.esc(def.label)}${v.what ? ` <span class="what">${kit.md(v.what)}</span>` : ''}${count}</span>`;
  };

  const change = (list) => {
    const gauges = list.map(parseGauge);
    const rest = list.filter((_, i) => !gauges[i]);
    return gauges.filter(Boolean).map((g) => gaugeHtml(g, kit)).join('')
      + (rest.length ? `<ul>${rest.map((c) => `<li>${kit.md(c)}</li>`).join('')}</ul>` : '');
  };

  const label = (key) => kit.esc((data.columns.find((c) => c.key === key) || { label: key }).label);
  const rows = spikes.map((s, i) => `<div class="row" data-i="${i}">
      <div class="id">${kit.esc(s.id)}</div>
      <div><div class="name">${kit.md(s.name)}</div><div class="q">${kit.md(s.question)}</div></div>
      <div class="verdict">${s.verdict.map(pill).join('')}</div>
      <div class="change">${change(s.changed)}</div>
    </div>`).join('');

  root.innerHTML = `<style>${CSS(kit)}</style>
    <div class="box"><div class="wrap">
      <div class="tally">
        <div class="t"><span class="big">${kit.fmt.num(total)}</span><span class="cap">Spikes</span></div>
        <span class="sep"></span>
        ${tally}
      </div>
      <div class="board">
        <div class="row head"><div>${label('spike')} and ${label('question').toLowerCase()}</div><div>${label('verdict')}</div><div>${label('what_it_changed')}</div></div>
        ${rows}
      </div>
    </div></div>`;

  const apply = () => {
    root.querySelectorAll('button.t').forEach((b) => {
      const on = b.dataset.kind === filter;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    root.querySelectorAll('.row[data-i]').forEach((r) => {
      r.classList.toggle('dim', filter != null && !has(spikes[+r.dataset.i], filter));
    });
  };
  root.querySelectorAll('button.t').forEach((b) => b.addEventListener('click', () => {
    filter = filter === b.dataset.kind ? null : b.dataset.kind;
    apply();
  }));
}
