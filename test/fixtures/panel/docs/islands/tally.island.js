// Test-only table island: one verdict per row, with a column pattern on verdict.
export const contract = 1;

export const schema = {
  type: 'object',
  required: ['columns', 'rows', 'attrs'],
  properties: {
    rows: {
      type: 'array',
      minItems: 1,
      items: { type: 'object', required: ['verdict'], properties: { verdict: { type: 'string' } } },
    },
  },
  columns: { verdict: { pattern: /^(Proceed|Adjust|Stop)\b/.source } },
};

export default function render(root, data, kit) {
  root.innerHTML = `<ul>${data.rows.map((r) => `<li>${kit.md(r.verdict)}</li>`).join('')}</ul>`;
}
