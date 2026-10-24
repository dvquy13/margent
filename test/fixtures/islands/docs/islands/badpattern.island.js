// Test-only: declares a column pattern for a column the table does not have.
export const contract = 1;
export const schema = {
  type: 'object',
  columns: { nope: { pattern: '^x' } },
};
export default function render(root) {
  root.textContent = 'x';
}
