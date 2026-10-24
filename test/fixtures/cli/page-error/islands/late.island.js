// Test-only: renders, then throws an uncaught exception from a timer, which is a page error.
export const contract = 1;
export const schema = { type: 'object' };
export default function render(root) {
  root.textContent = 'rendered';
  setTimeout(() => {
    throw new Error('late boom');
  }, 0);
}
