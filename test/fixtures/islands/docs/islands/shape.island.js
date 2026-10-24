// Test-only table island: any table data. Renders the row count, so a page shows something.
export const contract = 1;

export const schema = {
  type: 'object',
};

export default function render(root, data) {
  root.textContent = `${data.rows.length} rows`;
}
