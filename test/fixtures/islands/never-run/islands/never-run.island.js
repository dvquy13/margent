// Test-only: its top level throws. Node never runs module code (M5 R1), so rendering must not reach this line.
export const contract = 1;
export const schema = { type: 'object' };
throw new Error('executed');
export default function render(root) {
  root.textContent = 'x';
}
