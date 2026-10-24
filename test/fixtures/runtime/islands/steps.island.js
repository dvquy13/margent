// Test-only YAML-backed island: buttons expand details (height changes), and a JS-computed swatch follows the theme.
export const contract = 1;
export const schema = {
  type: 'object',
  required: ['title', 'steps'],
  properties: {
    title: { type: 'string' },
    steps: {
      type: 'array',
      items: { type: 'object', required: ['label', 'detail'], properties: { label: { type: 'string' }, detail: { type: 'string' } } }
    }
  }
};

export default function render(root, data, kit) {
  const doc = root.ownerDocument;
  const tones = ['go', 'warn', 'stop', 'done', 'neutral'];
  const style = doc.createElement('style');
  style.textContent = `
    .title { font-weight: 600; font-size: var(--font-body); margin-bottom: var(--gap-xs); display: flex; align-items: center; gap: var(--gap-xs); }
    .swatch { display: inline-block; width: 0.75rem; height: 0.75rem; border-radius: var(--radius-sm); }
    .step { all: unset; display: block; box-sizing: border-box; width: 100%; padding: 6px 8px; border-radius: var(--radius-sm); cursor: pointer; }
    .step:hover { background: var(--bg2); }
    .label { display: flex; align-items: center; gap: var(--gap-xs); }
    .pill { font-size: var(--font-xs); border-radius: var(--radius-pill); padding: 1px 8px; border: 1px solid currentColor; }
    .detail { margin: 4px 0 0 0; padding: 6px 10px; border-left: 2px solid var(--border); color: var(--text-muted); }
  `;
  const wrap = doc.createElement('div');
  const title = doc.createElement('div');
  title.className = 'title';
  const swatch = doc.createElement('span');
  swatch.className = 'swatch';
  kit.onTheme((t) => { swatch.style.background = t.accent; });
  swatch.style.background = kit.tokens.accent;
  const titleText = doc.createElement('span');
  titleText.textContent = data.title;
  title.append(swatch, titleText);
  wrap.append(title);

  data.steps.forEach((step, i) => {
    const row = doc.createElement('div');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'step';
    btn.setAttribute('aria-expanded', 'false');
    const label = doc.createElement('span');
    label.className = 'label';
    const name = doc.createElement('span');
    name.innerHTML = kit.md(step.label);
    const pill = doc.createElement('span');
    pill.className = 'pill';
    const tone = tones[i % tones.length];
    pill.style.color = kit.tone(tone);
    pill.textContent = tone;
    label.append(name, pill);
    btn.append(label);
    const detail = doc.createElement('div');
    detail.className = 'detail';
    detail.hidden = true;
    detail.innerHTML = kit.md(step.detail);
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      detail.hidden = !open;
    });
    row.append(btn, detail);
    wrap.append(row);
  });
  root.replaceChildren(style, wrap);
}
