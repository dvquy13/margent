// Test-only: a link that may be opened, one that must not be (a javascript: URL), and a plain paragraph.
export const contract = 1;
export const schema = { type: 'object' };

export default function render(root) {
  root.innerHTML = '<p><a href="https://example.com/doc">Open the doc</a></p>' +
    '<p><a href="javascript:window.__ran = true">Run script</a></p>';
}
