// Test-only table island with a column pattern on count, so a cell can break it (M5 R3.3).
export const contract = 1;
export const schema = {
  type: 'object',
  required: ['columns', 'rows', 'attrs'],
  properties: {
    columns: { type: 'array' },
    rows: { type: 'array', items: { type: 'object', required: ['item', 'count'], properties: { item: { type: 'string' }, count: { type: 'string' } } } },
    attrs: { type: 'object' }
  },
  columns: { count: { pattern: '^\\d+$' } }
};

export default function render(root, data, kit) {
  root.innerHTML = '<ul>' + data.rows.map((r) => '<li>' + kit.esc(r.item) + ' ' + kit.esc(r.count) + '</li>').join('') + '</ul>';
}
