// Test-only island whose render throws, to exercise the error box (R3.7).
export const contract = 1;
export const schema = { type: 'object', properties: { title: { type: 'string' } } };

export default function render() {
  throw new Error('boom from the throws fixture island');
}
