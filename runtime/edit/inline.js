// In-place editing of gated prose blocks (spec R4). A block with data-gate="pass" becomes contenteditable on a plain
// press; blur and Cmd+S save it through margent.save, the one save path. The editable DOM is never rewritten (native
// undo works); normalization happens on a clone in turndown.js.

const GATED = '[data-gate="pass"]';

// One entry per block in edit mode (or saving). `snapshot` is the block's innerHTML before editing, for Esc and a 422.
// `note` is the error line shown after the block when a save failed.
const sessions = new Map();

export function initInline(margent) {
  margent.registerDirty(() => [...sessions.values()].some((s) => unsaved(margent, s)));

  // A press on a block that is not being edited makes it editable. The browser then places the caret where the press was,
  // because the element is editable before the press's default action. A link in such a block follows the link instead.
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest(GATED);
    if (!el || sessions.has(el)) return;
    if (e.target.closest('a[href]')) return;
    begin(margent, el);
  });

  // Blur saves. A save that is in flight already left edit mode, so its blur does nothing.
  document.addEventListener('focusout', (e) => {
    const s = sessions.get(e.target);
    if (s && !s.saving) finish(margent, s);
  });

  document.addEventListener('keydown', (e) => {
    const saveKey = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's';
    // Cmd+S never reaches the browser on a served page, edit or not: Chrome's Save Page cancels the live reload stream.
    if (saveKey) e.preventDefault();
    const s = sessions.get(e.target);
    if (!s || s.saving || e.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      revert(margent, s);
    } else if (saveKey) {
      finish(margent, s);
    } else if (e.key === 'Enter' && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey) {
      // A paragraph's Enter writes a blank line (a paragraph break, see turndown.js). A heading's Enter saves. A list's
      // Enter is native: Chrome makes a new item inside the list, which stays inside the block.
      if (s.el.tagName === 'P') {
        e.preventDefault();
        paragraphBreak(s.el);
      } else if (/^H[1-6]$/.test(s.el.tagName)) {
        e.preventDefault();
        finish(margent, s);
      }
    }
  });

  // Typing over a link's whole text (spec R4.7). Chrome then deletes the link and leaves the caret after it, so the keys
  // that follow would land outside the link. The typed text goes in with a zero-width mark after it (MARK), which keeps
  // the caret inside the link. The mark is removed from the markdown (markdownOf); a caret at an untouched link's end is
  // not affected, since this runs only for a selection that covers the link's whole text.
  document.addEventListener('beforeinput', (e) => {
    if (inserting || e.inputType !== 'insertText' || e.data === null) return;
    const s = sessions.get(e.target);
    if (!s || s.saving) return;
    const sel = window.getSelection();
    if (sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const link = start?.closest('a[href]');
    if (!link || !s.el.contains(link) || link.childNodes.length !== 1 || link.firstChild.nodeType !== Node.TEXT_NODE) return;
    if (range.toString() !== link.textContent) return;
    e.preventDefault();
    const text = link.firstChild;
    sel.setBaseAndExtent(text, 0, text, text.length);
    inserting = true;
    try {
      document.execCommand('insertText', false, e.data + MARK);
    } finally {
      inserting = false;
    }
    if (link.textContent !== e.data + MARK) {
      throw new Error(`margent edit runtime: typing over a link left ${JSON.stringify(link.textContent)}, not the typed text`);
    }
    s.mark = true;
    sel.collapse(link.firstChild, e.data.length);
  });

  // Plain text only: the clipboard's HTML never reaches the DOM or turndown. insertText keeps native undo.
  document.addEventListener('paste', (e) => {
    const s = sessions.get(e.target);
    if (!s || s.saving) return;
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
}

// Set while inline.js runs its own insertText, so the beforeinput handler does not handle that call again.
let inserting = false;
const MARK = '\u200b';

// The block's markdown, without the zero-width mark that typing over a link leaves (see beforeinput).
function markdownOf(margent, s) {
  const md = margent.toMarkdown(s.el);
  return s.mark ? md.split(MARK).join('') : md;
}

function begin(margent, el) {
  // Clicking another block ends the one being edited: its blur has already saved it, unless it failed and kept its text.
  for (const other of [...sessions.values()]) {
    if (!other.saving) finish(margent, other);
  }
  const s = { el, range: el.getAttribute('data-src'), snapshot: el.innerHTML, saving: false, note: null, mark: false };
  sessions.set(el, s);
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('data-editing', '');
}

// Leaves edit mode, dropping the block's session and its error line. Sets the attributes back before anything else
// reads them, so the blur that follows finds no session.
function end(s) {
  sessions.delete(s.el);
  s.note?.remove();
  s.el.removeAttribute('contenteditable');
  s.el.removeAttribute('data-editing');
}

// Inserts the paragraph break (see turndown.js) at the caret, through insertHTML so native undo still works. A break at
// the end of a block has no line after it, so the browser would put the caret back before it: the placeholder break
// after it (data-fill, dropped by turndown.js) gives the caret its new line. The caret then moves after the real break.
function paragraphBreak(el) {
  const before = new Set(el.querySelectorAll('br[data-para="1"]'));
  document.execCommand('insertHTML', false, '<br data-para="1"><br data-fill="1">');
  const br = [...el.querySelectorAll('br[data-para="1"]')].find((b) => !before.has(b));
  if (!br) throw new Error('margent edit runtime: the paragraph break was not inserted');
  const range = document.createRange();
  range.setStartAfter(br);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function revert(margent, s) {
  end(s);
  s.el.innerHTML = s.snapshot;
  margent.idle();
}

// Whether the block's text differs from its source: the one check for "unsaved" (dirty) and for "send nothing". An
// unchanged DOM sends nothing even when its source has a literal U+00A0 that the edit normalization would change.
function unsaved(margent, s) {
  return s.el.innerHTML !== s.snapshot && markdownOf(margent, s) !== margent.sourceOf(s.range);
}

async function finish(margent, s) {
  if (!unsaved(margent, s)) {
    end(s);
    margent.idle();
    return;
  }
  const md = markdownOf(margent, s);
  const wasFocused = document.activeElement === s.el;
  s.note?.remove();
  s.note = null;
  s.saving = true;
  s.el.setAttribute('contenteditable', 'false');

  let res;
  try {
    res = await margent.save(s.range, md);
  } catch (err) {
    failed(s, wasFocused, `save failed: ${err.message}`);
    return;
  }
  if (res.status === 200) {
    end(s);
    margent.reload();
  } else if (res.status === 409) {
    end(s);
    margent.stale(s.range, md);
  } else if (res.status === 422) {
    // The side panel takes the text and shows the refusal; the block goes back to the page's version.
    end(s);
    s.el.innerHTML = s.snapshot;
    margent.openPanel(s.range, { text: md, errors: res.body.errors });
  } else {
    failed(s, wasFocused, `save failed (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
  }
}

// A save that failed keeps the block in edit mode with its text, and says so next to the block.
function failed(s, wasFocused, message) {
  s.saving = false;
  s.el.setAttribute('contenteditable', 'true');
  if (wasFocused) s.el.focus();
  const note = document.createElement('div');
  note.className = 'edit-error';
  note.setAttribute('role', 'alert');
  note.textContent = message;
  s.el.after(note);
  s.note = note;
  console.error(`margent edit: ${s.range}: ${message}`);
}
