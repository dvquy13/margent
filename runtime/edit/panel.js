// Side panel and edit controls (spec R5). Every block that is not editable in place (data-gate other than "pass") gets
// an edit control, and so does the header meta line when the source opens with frontmatter. A control opens the panel on
// the block's lines. While the panel is open its text is unsaved, so it is the page's dirty state (spec R7.3).
// Sets margent.openPanel(range, { text, errors, notice }).

const EVENT_PANEL = 'margent:panel';
const RANGE = /^(\d+)-(\d+)$/;

function parseRange(range) {
  const m = RANGE.exec(range);
  if (!m) throw new Error(`margent edit runtime: bad range ${JSON.stringify(range)}`);
  return { start: Number(m[1]), end: Number(m[2]) };
}

// The line range of the frontmatter, 1 to its closing ---. The renderer rejects a frontmatter that never closes.
function frontmatterRange(source) {
  const lines = source.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines[0].trimEnd() !== '---') return null;
  const close = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
  if (close === -1) throw new Error('margent edit runtime: the frontmatter has no closing --- line');
  return `1-${close + 1}`;
}

// What a block is, for its control's label.
function kindOf(el) {
  if (el.tagName === 'AGENT-ISLAND') return `island ${el.getAttribute('name')}`;
  if (el.querySelector('table')) return 'table';
  if (el.tagName === 'PRE') return 'code block';
  if (el.tagName === 'FIGURE') return 'figure';
  if (el.tagName === 'BLOCKQUOTE') return 'blockquote';
  if (el.tagName === 'HR') return 'rule';
  if (el.tagName === 'UL' || el.tagName === 'OL') return 'list';
  if (el.tagName === 'P') return 'paragraph';
  if (/^H[1-6]$/.test(el.tagName)) return 'heading';
  return 'block';
}

function makeControl(range, kind, onOpen) {
  const { start, end } = parseRange(range);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'edit-control';
  btn.textContent = 'Edit';
  btn.setAttribute('aria-label', `Edit ${kind}, lines ${start}–${end}`);
  btn.addEventListener('click', () => onOpen(btn));
  return btn;
}

function buildPanel() {
  const panel = document.createElement('section');
  panel.className = 'edit-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'edit-panel-title');
  panel.innerHTML = `
<h2 class="edit-panel-title" id="edit-panel-title"></h2>
<p class="edit-panel-notice" role="status" hidden></p>
<div class="edit-panel-errors" role="alert" hidden><ul></ul></div>
<label class="edit-panel-label" for="edit-panel-text">Markdown</label>
<textarea class="edit-panel-text" id="edit-panel-text" spellcheck="false" wrap="off"></textarea>
<div class="edit-panel-actions">
  <span class="edit-panel-status" role="status"></span>
  <button type="button" class="edit-panel-cancel">Cancel</button>
  <button type="button" class="edit-panel-save">Save</button>
</div>`;
  return panel;
}

export function initPanel(margent) {
  const { state, blocks, sourceOf, registerDirty } = margent;
  const panel = buildPanel();
  document.body.append(panel);
  const title = panel.querySelector('.edit-panel-title');
  const notice = panel.querySelector('.edit-panel-notice');
  const errors = panel.querySelector('.edit-panel-errors');
  const errorList = errors.querySelector('ul');
  const text = panel.querySelector('.edit-panel-text');
  const status = panel.querySelector('.edit-panel-status');
  const cancelBtn = panel.querySelector('.edit-panel-cancel');
  const saveBtn = panel.querySelector('.edit-panel-save');

  let open = false;
  let saving = false;
  let current = null; // the range the panel is open on
  let loaded = ''; // the text the panel opened with, to tell whether the user changed it
  let opener = null; // the control to focus on close

  const notify = () => document.dispatchEvent(new CustomEvent(EVENT_PANEL, { detail: { open } }));

  function setNotice(message) {
    notice.textContent = message ?? '';
    notice.hidden = !message;
  }

  function setErrors(messages) {
    errorList.replaceChildren(
      ...messages.map((m) => {
        const li = document.createElement('li');
        const code = document.createElement('code');
        code.textContent = m;
        li.append(code);
        return li;
      })
    );
    errors.hidden = messages.length === 0;
  }

  function setBusy(busy) {
    saving = busy;
    saveBtn.disabled = busy;
    cancelBtn.disabled = busy;
    status.textContent = busy ? 'Saving…' : '';
  }

  // Opens the panel on `range`. Text the user has typed is never replaced: a second block waits until the first is
  // saved or cancelled, and says so in the panel.
  function show(range, { text: initial, errors: messages = [], notice: note } = {}, returnTo = null) {
    const source = sourceOf(range); // throws for a range outside the file
    if (open && text.value !== loaded) {
      setNotice(`Save or cancel the open edit of lines ${parseRange(current).start}–${parseRange(current).end} first.`);
      text.focus();
      return;
    }
    const { start, end } = parseRange(range);
    mark(current, false);
    current = range;
    mark(range, true);
    loaded = initial ?? source;
    text.value = loaded;
    title.textContent = `Lines ${start}–${end}`;
    setErrors(messages);
    setNotice(note);
    setBusy(false);
    const active = document.activeElement;
    opener = returnTo ?? (active instanceof HTMLElement && active !== document.body ? active : null);
    panel.hidden = false;
    open = true;
    notify();
    text.focus();
  }

  // The block the panel edits carries data-panel-open, so the page shows which block the text belongs to. Frontmatter
  // has no block element.
  function mark(range, on) {
    const el = range === null ? undefined : blocks.get(range);
    if (el) el.toggleAttribute('data-panel-open', on);
  }

  function close({ restoreFocus }) {
    panel.hidden = true;
    open = false;
    mark(current, false);
    current = null;
    setErrors([]);
    setNotice(null);
    setBusy(false);
    notify();
    if (restoreFocus && opener && opener.isConnected) opener.focus();
    opener = null;
  }

  function cancel() {
    if (saving) return;
    close({ restoreFocus: true });
    margent.idle();
  }

  // Save follows R5.4 and R7.4: 200 closes and reloads, 422 shows the errors and keeps the text, 409 hands the text to
  // the reload path. Any other answer, or a failed request, is shown in the panel.
  async function submit() {
    if (!open || saving) return;
    const range = current;
    const body = text.value;
    setErrors([]);
    setBusy(true);
    let res;
    try {
      res = await margent.save(range, body);
    } catch (err) {
      setBusy(false);
      setErrors([`Save failed: ${err.message}. Your text is still here.`]);
      return;
    }
    if (res.status === 200) {
      close({ restoreFocus: false });
      margent.reload();
      return;
    }
    setBusy(false);
    if (res.status === 409) {
      margent.stale(range, body);
      return;
    }
    const reply = res.body;
    const messages =
      reply && Array.isArray(reply.errors)
        ? reply.errors
        : [`Save failed with HTTP ${res.status}${reply && reply.error ? `: ${reply.error}` : ''}. Your text is still here.`];
    setErrors(messages);
  }

  saveBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', cancel);
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      submit();
    }
  });

  registerDirty(() => open);
  margent.openPanel = (range, opts = {}) => show(range, opts);

  // Controls. Each block gets one as its last child, so it sits at the block's top right and takes no layout space.
  // A rule (hr) cannot hold children, so it is wrapped in a block that holds the control.
  for (const [range, el] of blocks) {
    if (el.getAttribute('data-gate') === 'pass') continue;
    const control = makeControl(range, kindOf(el), (btn) => show(range, {}, btn));
    if (el.tagName === 'HR') {
      const wrap = document.createElement('div');
      wrap.className = 'edit-block';
      el.before(wrap);
      wrap.append(el, control);
    } else {
      el.classList.add('edit-block');
      el.append(control);
    }
  }

  // Frontmatter opens from the header's meta line, which is always visible.
  const fm = frontmatterRange(state.source);
  if (fm) {
    const meta = document.querySelector('header.top .top-meta');
    if (!meta) throw new Error('margent edit runtime: the page header has no .top-meta line for the frontmatter control');
    const control = makeControl(fm, 'frontmatter', (btn) => show(fm, {}, btn));
    control.classList.add('edit-control--header');
    meta.after(control);
  }
}
