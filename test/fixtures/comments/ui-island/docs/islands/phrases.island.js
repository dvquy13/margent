// Test-only island for the comment UI: one line of text per entry, so a test can drag over text drawn inside an island.
export const contract = 1;

export const schema = {
  type: 'object',
  required: ['lines'],
  properties: { lines: { type: 'array', items: { type: 'string' } } },
};

export default function render(root, data) {
  for (const line of data.lines) {
    const p = root.ownerDocument.createElement('p');
    p.textContent = line;
    root.append(p);
  }
}
