// Test-only: a module that throws while it loads.
export const contract = 1;
export const schema = { type: 'object' };
throw new Error('boom at load');
export default function render(root) {
  root.textContent = 'x';
}
