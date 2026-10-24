// Test-only: a module with an import, which contract v1 forbids.
import { helper } from './helper.js';

export const contract = 1;
export const schema = { type: 'object' };
export default function render(root) {
  root.textContent = helper();
}
