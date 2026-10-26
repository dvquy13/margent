// Test-only: renders a fixed sentence, so a quote of it is found (or not) in the island.
export const contract = 1;
export const schema = { type: 'object' };
export default function render(root) {
  root.innerHTML = '<p>Stage alpha ships in June</p>';
}
