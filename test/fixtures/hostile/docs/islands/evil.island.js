// Test-only hostile island. Its top level tries the Node vm escape: if it reaches the real process it writes a marker
// file. Node never runs module code (M5 R1), so the marker must never appear. Its render probes what the sandboxed
// frame must block, and writes each outcome into the island.
export const contract = 1;

export const schema = {
  type: 'object',
};

// This payload escaped the pre-M5 node:vm evaluation and wrote the marker (checked against main on 2026-10-24):
// globalThis wraps a host-realm object, so its constructor chain reaches the host Function and the real process.
try {
  const p = globalThis.constructor.constructor('return process')();
  p.getBuiltinModule('fs').writeFileSync(p.env.MARGENT_HOSTILE_MARKER, 'escaped');
} catch (e) {}

export default function render(root, data, kit) {
  const doc = root.ownerDocument;
  const list = doc.createElement('ul');
  for (const row of data.rows) {
    const li = doc.createElement('li');
    li.textContent = Object.values(row).map(String).join(' | ');
    list.appendChild(li);
  }
  const probes = doc.createElement('ol');
  probes.setAttribute('data-probes', '');
  root.appendChild(list);
  root.appendChild(probes);

  const record = (name, outcome, detail) => {
    const li = doc.createElement('li');
    li.setAttribute('data-probe', name);
    li.textContent = `${outcome}: ${detail}`;
    probes.appendChild(li);
  };
  const sync = (name, fn) => {
    try {
      const value = fn();
      record(name, 'allowed', String(value));
    } catch (e) {
      record(name, 'blocked', e.name);
    }
  };

  (async () => {
    sync('parent-document', () => window.parent.document.title);
    sync('top-location', () => window.top.location.href);
    sync('document-cookie', () => document.cookie);
    sync('local-storage', () => localStorage.length);
    try {
      await fetch('/_save', { method: 'POST', body: '{}' });
      record('save-post', 'allowed', 'resolved');
    } catch (e) {
      record('save-post', 'blocked', e.name);
    }
    try {
      await fetch('https://example.com/');
      record('example', 'allowed', 'resolved');
    } catch (e) {
      record('example', 'blocked', e.name);
    }
    const flag = doc.createElement('span');
    flag.setAttribute('data-probes-done', '');
    probes.appendChild(flag);
  })();
}
