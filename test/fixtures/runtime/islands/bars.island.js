// Test-only table-backed island. Data comes from the markdown table; totals and shares are computed here.
export const contract = 1;
export const schema = {
  type: 'object',
  required: ['columns', 'rows', 'attrs'],
  properties: {
    columns: {
      type: 'array',
      items: { type: 'object', required: ['key', 'label'], properties: { key: { type: 'string' }, label: { type: 'string' } } }
    },
    rows: { type: 'array', items: { type: 'object', required: ['item', 'count'], properties: { item: { type: 'string' }, count: { type: 'string' } } } },
    attrs: { type: 'object' }
  }
};

export default function render(root, data, kit) {
  const doc = root.ownerDocument;
  const count = (row) => Number(String(row.count).replace(/,/g, ''));
  const total = data.rows.reduce((sum, row) => sum + count(row), 0);
  const max = Math.max(...data.rows.map(count));
  const unit = data.attrs.unit ?? '';
  const label = (key) => data.columns.find((c) => c.key === key)?.label ?? key;

  const style = doc.createElement('style');
  style.textContent = `
    .head { font-size: var(--font-sm); color: var(--text-muted); margin-bottom: var(--gap-xs); }
    .row { all: unset; position: relative; display: grid; grid-template-columns: 8rem minmax(0, 1fr) 6rem;
      gap: var(--gap-sm); align-items: center; width: 100%; padding: 6px 8px; border-radius: var(--radius-sm); cursor: pointer; }
    .row:hover { background: var(--bg2); }
    .row[aria-pressed="true"] { background: var(--accent-light); }
    .row:focus-visible { outline: 2px solid var(--accent); }
    .track { height: 10px; background: var(--bg3); border-radius: var(--radius-pill); overflow: hidden; }
    .fill { height: 100%; background: var(--accent); }
    .row[aria-pressed="true"] .fill { background: var(--amber); }
    .val { position: relative; text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }
    .tip { display: none; position: absolute; left: 100%; top: 50%; transform: translateY(-50%); margin-left: 8px;
      white-space: nowrap; background: var(--text); color: var(--bg); font-size: var(--font-sm); padding: 4px 8px; border-radius: var(--radius-sm); }
    .row:hover .tip { display: block; }
    .item { color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `;
  const wrap = doc.createElement('div');
  const head = doc.createElement('div');
  head.className = 'head';
  head.textContent = `${label('count')}${unit ? ` (${unit})` : ''} · total ${kit.fmt.num(total)}`;
  wrap.append(head);

  for (const row of data.rows) {
    const share = total ? count(row) / total : 0;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'row';
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    });
    const item = doc.createElement('span');
    item.className = 'item';
    item.innerHTML = kit.md(row.item);
    const track = doc.createElement('span');
    track.className = 'track';
    const fill = doc.createElement('span');
    fill.className = 'fill';
    fill.style.display = 'block';
    fill.style.width = `${max ? (count(row) / max) * 100 : 0}%`;
    track.append(fill);
    const val = doc.createElement('span');
    val.className = 'val';
    val.textContent = `${kit.fmt.num(count(row))}`;
    const tip = doc.createElement('span');
    tip.className = 'tip';
    tip.innerHTML = `${kit.md(row.note)} · ${kit.fmt.pct(share)} of total`;
    val.append(tip);
    btn.append(item, track, val);
    wrap.append(btn);
  }
  root.replaceChildren(style, wrap);
}
