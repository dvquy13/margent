// Test-only island for the comments CLI fixtures: any data. The export tests never run it, so it only has to load.
export const contract = 1;

export const schema = {
  type: 'object',
};

export default function render(root) {
  root.textContent = 'island';
}
