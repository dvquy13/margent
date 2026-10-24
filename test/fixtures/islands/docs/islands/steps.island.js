// Test-only YAML island: a sequence of steps, each with an id.
export const contract = 1;

export const schema = {
  type: 'array',
  minItems: 1,
  items: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
};

export default function render(root, data) {
  root.textContent = data.map((s) => s.id).join(' ');
}
