// Test-only: a 600px grid. It fits a desktop box and spills out of a phone box.
export const contract = 1;
export const schema = { type: 'object' };
export default function render(root) {
  const cells = Array.from({ length: 8 }, (_, i) => '<div>cell ' + i + '</div>').join('');
  root.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,150px);width:600px">' + cells + '</div>';
}
