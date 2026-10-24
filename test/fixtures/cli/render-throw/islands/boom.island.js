// Test-only: passes its load and schema checks, then throws while it renders.
export const contract = 1;
export const schema = { type: 'object' };
export default function render() {
  throw new Error('boom at render');
}
