// Test-only: a schema keyword the runtime does not implement (not).
export const contract = 1;
export const schema = { type: 'object', not: { required: ['rows'] } };
export default function render(root) {
  root.textContent = 'x';
}
