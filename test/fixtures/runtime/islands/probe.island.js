// Test-only: tries to reach the page, the cookies and the network from inside the frame, and records each outcome
// in its own DOM. Every outcome must be "blocked" (M5 R3, A2).
export const contract = 1;
export const schema = { type: 'object' };

function outcome(fn) {
  try {
    const value = fn();
    return value === undefined ? 'ok' : 'reached: ' + String(value).slice(0, 40);
  } catch (e) {
    return 'blocked: ' + e.name;
  }
}

export default function render(root) {
  const out = document.createElement('pre');
  out.setAttribute('data-probe', '');
  out.textContent = [
    'parent.document: ' + outcome(() => parent.document.title),
    'top.location: ' + outcome(() => top.location.href),
    'cookie: ' + outcome(() => document.cookie || 'empty'),
    'localStorage: ' + outcome(() => localStorage.length),
  ].join('\n');
  root.appendChild(out);
  fetch('https://example.com/probe').then(
    () => { out.textContent += '\nfetch: reached'; },
    (e) => { out.textContent += '\nfetch: blocked: ' + e.name; }
  );
}
