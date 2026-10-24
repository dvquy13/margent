// The comment UI (M3 spec R5, R6; plan T8). Runs only in a page that `margent serve` produced. It adds a Comment
// control at a selection inside one top-level block, a comment control on every block, and Reply and Resolve on every
// thread. Each action is one margent.save of one block (decision 0021): the block's new source is built here from its
// markdown with the syntax module, and the save goes through the same path as an edit.
import {
  appendNote,
  NOTE,
  nextId,
  noteSource,
  quotedText,
  replaceNote,
  splitQuote,
  stripThread,
} from '../../src/comments/syntax.ts';

const PENDING = 'margent-pending';
const AUTHOR_MESSAGE =
  'No author is set, so notes cannot be saved. Start margent serve with --author {name}, or set git config user.name {name}, then reload this page.';
const EMPTY_EDIT_MESSAGE = "A note can't be empty. Resolve removes the thread.";

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// The line range as the panel words it: "lines 10–13".
const linesOf = (range) => {
  const [start, end] = range.split('-');
  return `lines ${start}–${end}`;
};

// What a block is, for a label (the same words panel.js uses).
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

// The top-level block (a [data-src] not inside another) that holds a node, or null.
function topBlockOf(node) {
  const from = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  let el = from?.closest('[data-src]') ?? null;
  for (let up = el?.parentElement?.closest('[data-src]'); up; up = el.parentElement?.closest('[data-src]')) el = up;
  return el;
}

// The element that holds a block's controls. panel.js wraps a rule (hr) so it can hold its control.
const slotOf = (el) => (el.tagName === 'HR' ? el.parentElement : el);

// A press on one of our controls must not reach inline.js (which would start editing the block under it) or move the
// caret and blur the block being edited.
function keepPress(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
}

const excerpt = (s) => (s.length > 60 ? `${s.slice(0, 59)}…` : s);

// The page's own selection as a range. A selection inside an island is in its frame, which the page cannot read: it
// comes as the island's selection event instead (islandSel in initComments, M5 R6.1).
function selectionRange() {
  return window.getSelection().getRangeAt(0).cloneRange();
}

// An island selection's rect in page viewport coordinates, where the island is now: it moves when the page scrolls.
function islandRect(sel) {
  const origin = sel.el.getBoundingClientRect();
  const left = origin.left + sel.rect.left;
  const top = origin.top + sel.rect.top;
  return { left, top, width: sel.rect.width, height: sel.rect.height, right: left + sel.rect.width, bottom: top + sel.rect.height };
}

// Where a selection ends on screen: its last line box that has a size. A double or triple click often ends the range at
// an element boundary, where a collapsed range measures as an empty box at (0, 0), so the end is never measured
// collapsed. A selection with no line box at all (only element boundaries) falls back to the block's own box.
function selectionEndRect(range, block) {
  const boxes = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0);
  if (boxes.length > 0) return boxes[boxes.length - 1];
  return block.getBoundingClientRect();
}

// The phrase a block comment from a selection quotes (decision 0023): the selected text, whitespace collapsed and
// trimmed, each " as '. '' when nothing is selected.
function quoteOf(text) {
  return text.replace(/\s+/g, ' ').trim().replaceAll('"', "'");
}

export function initComments(margent) {
  const { state, blocks, sourceOf, toMarkdown, save, anchor } = margent;

  // ---- the note box: one line of text, or one message, at the foot of the page -----------------------------------
  const box = make('section', 'comment-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Comment');
  box.hidden = true;
  const what = make('p', 'comment-what');
  const form = make('form', 'comment-form');
  // A text area, so a long note wraps and stays readable in a narrow rail card. A note is still one line of text (R1.2):
  // Enter saves instead of breaking the line, and a pasted line break becomes a space. It grows with its text up to a
  // limit (edit.css), then scrolls.
  const input = make('textarea', 'comment-input');
  input.rows = 2;
  input.autocomplete = 'off';
  input.spellcheck = true;
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    form.requestSubmit();
  });
  input.addEventListener('input', () => {
    if (/[\r\n]/.test(input.value)) {
      const at = input.selectionStart;
      input.value = input.value.replace(/\r\n?|\n/g, ' ');
      input.setSelectionRange(at, at);
    }
    fitInput();
  });
  function fitInput() {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight + 2}px`; // + the top and bottom border
  }
  input.placeholder = 'Type a note. Enter saves, Esc cancels.';
  input.setAttribute('aria-label', 'Note text');
  const cancelBtn = make('button', 'comment-cancel', 'Cancel');
  cancelBtn.type = 'button';
  const saveBtn = make('button', 'comment-save', 'Save');
  saveBtn.type = 'submit';
  form.append(input, cancelBtn, saveBtn);
  const msg = make('p', 'comment-msg');
  msg.setAttribute('role', 'alert');
  msg.hidden = true;
  const msgText = make('span');
  const msgAction = make('button', 'comment-action');
  msgAction.type = 'button';
  msgAction.hidden = true;
  msg.append(msgText, msgAction);
  box.append(what, form, msg);
  document.body.append(box);

  // The Comment control at a selection. It is shown only while the note box is closed.
  const tool = make('button', 'comment-tool', 'Comment');
  tool.type = 'button';
  tool.hidden = true;
  tool.addEventListener('mousedown', keepPress);
  tool.addEventListener('click', onTool);
  document.body.append(tool);

  // job: the open note or message. { what, msg, error, form, range, id, build, preview, action, place, prefill, original }.
  // build(note) returns the block's new source. place says where the rail shows the box (showDraft): { top() } or
  // { after: id }; without one the box docks at the bottom of the window. A message-only job (form false) is a refusal or
  // a failed save. prefill is the text the box starts with (an edit); original is that text trimmed, so an edit that
  // leaves it unchanged closes without a save.
  let job = null;
  let busy = false;
  let opener = null;
  let dragging = false;
  let actionRun = null;
  // The text selected inside an island, as its frame reported it: { el, text, rect } with rect relative to the island.
  // The page's selection cannot see into the frame, so this stands in for it (M5 R6.1). null when there is none.
  let islandSel = null;
  // The island whose phrase is marked for the open note, so clear can unmark it. null when none is.
  let markedIsland = null;

  // Unsaved note text is unsaved page text, so a reload waits for it (R5.7).
  margent.registerDirty(() => job !== null && job.form && input.value.trim() !== '');

  function setMsg(text, { error = false, action = null } = {}) {
    msgText.textContent = text ?? '';
    msg.hidden = !text;
    msg.classList.toggle('comment-msg--error', error && Boolean(text));
    actionRun = action ? action.run : null;
    msgAction.hidden = !action;
    msgAction.textContent = action ? action.label : '';
  }

  function setBusy(on) {
    busy = on;
    input.disabled = on;
    saveBtn.disabled = on;
    cancelBtn.disabled = on;
  }

  // Closes the box and drops its state: the text, the pending highlight and the busy flag. Focus is not moved.
  function clear() {
    job = null;
    setBusy(false);
    input.value = '';
    input.style.height = '';
    box.hidden = true;
    setMsg(null);
    CSS.highlights.delete(PENDING);
    if (markedIsland !== null) {
      window.margentIslands.mark(markedIsland, null);
      markedIsland = null;
    }
    railHook().hideDraft();
  }

  function open(next) {
    const from = document.activeElement;
    clear();
    opener = from instanceof HTMLElement && from !== document.body ? from : null;
    job = next;
    what.textContent = next.what ?? '';
    what.hidden = !next.what;
    form.hidden = !next.form;
    input.hidden = !next.form;
    saveBtn.hidden = !next.form;
    cancelBtn.textContent = next.form ? 'Cancel' : 'Close';
    if (next.preview) CSS.highlights.set(PENDING, new Highlight(next.preview));
    if (next.islandPreview) {
      // The island's frame draws the phrase, as the page's pending highlight would (R6.2, the same mark a hover uses).
      window.margentIslands.mark(next.islandPreview.el, next.islandPreview.phrase);
      markedIsland = next.islandPreview.el;
    }
    const parts = [next.msg, next.form && state.author === null ? AUTHOR_MESSAGE : null].filter(Boolean);
    setMsg(parts.length ? parts.join(' ') : null, {
      error: next.error || (next.form && state.author === null),
      action: next.action ?? null,
    });
    box.hidden = false;
    if (next.prefill !== undefined) {
      input.value = next.prefill;
      input.setSelectionRange(input.value.length, input.value.length);
      fitInput(); // measures the text, so the box is shown first
    }
    if (next.place) railHook().showDraft(box, next.place);
    if (next.form) input.focus({ preventScroll: Boolean(next.place) });
    else cancelBtn.focus();
    update();
  }

  // Closes the box as a cancel: focus returns to what opened it, and a reload held for the note's text can run.
  function dismiss() {
    const target = opener;
    opener = null;
    clear();
    if (target && target.isConnected) target.focus();
    margent.idle();
    update();
  }

  // A refusal or a failed save, shown in the box with no form.
  function notify(text, error = true) {
    open({ what: '', form: false, msg: text, error });
  }

  // The reason an action cannot start now, or null. A note being written, the side panel and an edit with unsaved
  // changes each hold text that a block save would drop.
  function blockedReason() {
    if (job !== null && job.form && input.value.trim() !== '') return 'Send or cancel the note you are writing first.';
    if (document.querySelector('.edit-panel:not([hidden])')) return 'Save or cancel the open side panel first.';
    for (const el of document.querySelectorAll('[data-editing]')) {
      const range = el.getAttribute('data-src');
      if (toMarkdown(el) !== sourceOf(range)) {
        return `Save or cancel the edit of ${linesOf(range)} first (Cmd+S saves, Esc reverts).`;
      }
    }
    return null;
  }

  // Saves one block and handles the answer the way inline.js and panel.js do: 200 reloads, 409 goes to the stale path,
  // 422 opens the panel with the errors. A failure stays in the box, so the text is not lost.
  async function send(range, text) {
    if (job !== null && job.form) setBusy(true);
    let res;
    try {
      res = await save(range, text);
    } catch (err) {
      failed(`Save failed: ${err.message}. Your note is still here.`);
      return;
    }
    if (res.status === 200) {
      clear();
      margent.reload();
    } else if (res.status === 409) {
      clear();
      margent.stale(range, text);
    } else if (res.status === 422) {
      clear();
      const errors = Array.isArray(res.body?.errors) ? res.body.errors : [`HTTP 422: ${JSON.stringify(res.body)}`];
      margent.openPanel(range, { text, errors });
    } else {
      failed(`Save failed (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
    }
  }

  function failed(message) {
    if (job !== null && job.form) {
      setBusy(false);
      setMsg(message, { error: true });
    } else {
      notify(message);
    }
  }

  // Submit: Enter in the box. An empty note sends nothing.
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (job === null || !job.form || busy) return;
    const text = input.value.trim();
    if (job.original !== undefined) {
      if (text === job.original) return dismiss(); // unchanged: close without a save
      if (text === '') return setMsg(EMPTY_EDIT_MESSAGE, { error: true });
    }
    if (text === '') return;
    if (state.author === null) {
      setMsg(AUTHOR_MESSAGE, { error: true });
      return;
    }
    let body;
    try {
      body = job.build({ id: job.id ?? nextId(state.source), author: state.author, text });
    } catch (err) {
      setMsg(err.message, { error: true });
      return;
    }
    send(job.range, body);
  });

  cancelBtn.addEventListener('click', () => {
    if (!busy) dismiss();
  });
  msgAction.addEventListener('click', () => actionRun?.());

  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !busy) {
      e.preventDefault();
      dismiss();
    }
  });
  // Leaving the box with no text closes it. Text that was typed stays until it is sent or cancelled.
  box.addEventListener('focusout', (e) => {
    if (job === null || !job.form || busy || box.contains(e.relatedTarget) || input.value.trim() !== '') return;
    dismiss();
  });

  // ---- the Comment control at a selection (R5.1, R5.2) -----------------------------------------------------------

  // The top-level block a selection is inside, when both its ends are in it and it can take a comment. A selection in an
  // island is the island's own (islandSel), since the page's selection does not reach into its frame.
  function selectedBlock() {
    if (islandSel !== null) return blockThatTakesComment(islandSel.el);
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.toString() === '') return null;
    const el = topBlockOf(sel.anchorNode);
    if (!el || el !== topBlockOf(sel.focusNode)) return null;
    return blockThatTakesComment(el);
  }

  function blockThatTakesComment(el) {
    if (blocks.get(el.getAttribute('data-src')) !== el) return null;
    if (el.classList.contains('c-line')) return null;
    return el;
  }

  // Places the Comment control under the selection's end. It is hidden while a note is open, while the mouse is down
  // (a drag), and when the selection is not inside one block.
  function update() {
    const el = job === null && !dragging ? selectedBlock() : null;
    if (el === null) {
      tool.hidden = true;
      return;
    }
    const rect = islandSel !== null ? islandRect(islandSel) : selectionEndRect(selectionRange(), el);
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      tool.hidden = true;
      return;
    }
    tool.hidden = false;
    const x = Math.min(Math.max(rect.right, 8), window.innerWidth - tool.offsetWidth - 8);
    const y = Math.min(rect.bottom + 6, window.innerHeight - tool.offsetHeight - 8);
    tool.style.left = `${x}px`;
    tool.style.top = `${y}px`;
  }

  // The block comment range: the block's own lines, or the last block comment line after it that is anchored to it, so
  // a second block comment goes after the first (R5.4).
  function blockCreateRange(el) {
    const range = el.getAttribute('data-src');
    let last = range;
    for (let next = slotOf(el).nextElementSibling; next?.classList.contains('c-line'); next = next.nextElementSibling) {
      if (next.getAttribute('data-anchor') !== range) break;
      last = next.getAttribute('data-src');
    }
    return last;
  }

  // quote: the selected phrase, or '' for an unquoted block comment. The first note then starts with the quote, and
  // quotedText refuses a quote it cannot store, which the box shows when the note is sent. The box names only what the
  // reader picked: the phrase, or the block in plain words. How it is stored is not their concern.
  // The draft lines up with the selected phrase when there is one, else with the block.
  function openBlockComment(el, quote = '') {
    const range = blockCreateRange(el);
    // A quote from an island's selection: its rect is the frame's report, and the phrase is marked in the frame.
    const inFrame = quote && islandSel !== null && islandSel.el === el ? islandSel : null;
    const picked = quote && !inFrame ? selectionRange() : null;
    const top = () => {
      if (inFrame) return islandRect(inFrame).top;
      const box = picked ? selectionEndRect(picked, el) : null;
      return (box && box.height > 0 ? picked.getBoundingClientRect() : el.getBoundingClientRect()).top;
    };
    const kind = el.tagName === 'AGENT-ISLAND' ? 'island' : kindOf(el);
    open({
      what: quote ? `Comment on “${excerpt(quote)}”` : `Comment on the ${kind}`,
      place: { top },
      preview: picked ?? undefined, // the selected phrase stays marked while the note is typed, as for an inline comment
      islandPreview: inFrame ? { el, phrase: quote } : undefined,
      form: true,
      range,
      build: (n) => `${sourceOf(range)}\n\n${noteSource(quote ? { ...n, text: quotedText(quote, n.text) } : n)}`,
    });
  }

  function onTool() {
    const reason = blockedReason();
    if (reason) return notify(reason);
    const el = selectedBlock();
    if (el === null) return;
    // An island is never gated, so its selection is always a block comment on the island, quoting the text it selected.
    if (islandSel !== null) return openBlockComment(el, quoteOf(islandSel.text));
    const res = anchor(selectionRange(), el);
    const blockRange = el.getAttribute('data-src');
    if (res.kind === 'overlap') return notifyOverlap(res.id);
    if (res.kind === 'inline') {
      open({
        what: `Comment on “${excerpt(res.snapped.toString())}”`,
        form: true,
        range: blockRange,
        preview: res.snapped,
        place: { top: () => res.snapped.getBoundingClientRect().top },
        build: (n) => `${res.before}{==${res.inner}==}${noteSource(n)}${res.after}`,
      });
      return;
    }
    openBlockComment(el, quoteOf(window.getSelection().toString()));
  }

  // The selection touches a thread that already marks text (R5.5). The message points to that thread's Reply.
  function notifyOverlap(id) {
    const thread = threadOf(id);
    const action = thread
      ? {
          label: `Reply to ${id}`,
          run: () => {
            const reply = revealCard(id).querySelector('.comment-reply');
            clear();
            margent.idle();
            reply.scrollIntoView({ block: 'center' });
            reply.focus();
          },
        }
      : null;
    open({ what: '', form: false, error: true, msg: `This selection touches comment ${id}. Reply to that thread instead.`, action, place: { after: id } });
  }

  // ---- the block comment control on every block (R5.4) -----------------------------------------------------------

  function onBlockButton(el) {
    const reason = blockedReason();
    if (reason) return notify(reason);
    openBlockComment(el);
  }

  // Every block but a comment line gets the control, placed to the left of its edit control. The edit control stays the
  // block's last child (the edit corpus reads it there). An editable block has no edit control, so its control goes
  // first: as a last child it would take a caret placed at the end of the text, and Enter there would miss the text.
  // The label is empty text (::before in the CSS), so a control inside an editable block is not part of its markdown,
  // and the gate and the save never read it.
  for (const [range, el] of blocks) {
    if (el.classList.contains('c-line')) continue;
    const slot = slotOf(el);
    slot.classList.add('edit-block');
    const commentBtn = make('button', 'comment-control');
    commentBtn.type = 'button';
    commentBtn.setAttribute('aria-label', `Comment on ${kindOf(el)}, ${linesOf(range)}`);
    commentBtn.addEventListener('mousedown', keepPress);
    commentBtn.addEventListener('click', () => onBlockButton(el));
    slot.insertBefore(commentBtn, slot.querySelector(':scope > .edit-control'));
  }

  // ---- Reply and Resolve on every thread (R6), on the thread's card in the rail (decision 0023) ------------------------

  function threadOf(id) {
    return document.querySelector(`span.c-thread[data-c="${id}"]`);
  }

  // The rail's hook. Below 1100px the card is in the drawer, which reveal opens. A page with threads has the rail, so a
  // missing hook is a broken page, not a case to skip.
  function railHook() {
    const hook = window.margentComments;
    if (!hook) throw new Error('the comment rail is missing: runtime/comments.js must run before the edit runtime');
    return hook;
  }

  function revealCard(id) {
    const card = railHook().reveal(id);
    if (!card) throw new Error(`comment ${id} has no card in the rail`);
    return card;
  }

  function onReply(id) {
    const reason = blockedReason();
    if (reason) return notify(reason);
    const range = topBlockOf(threadOf(id)).getAttribute('data-src');
    railHook().close();
    open({
      what: 'Reply',
      form: true,
      range,
      id,
      place: { after: id },
      build: (n) => appendNote(sourceOf(range), id, n),
    });
  }

  // Edit opens the owner's note for changes. The box starts with the note's body (the quote and author stay as they are,
  // replaceNote keeps them), and index is the note's place among the thread's notes in source order.
  function onEdit(id, index, body) {
    const reason = blockedReason();
    if (reason) return notify(reason);
    const range = topBlockOf(threadOf(id)).getAttribute('data-src');
    railHook().close();
    open({
      what: 'Edit',
      form: true,
      range,
      id,
      place: { after: id },
      prefill: body,
      original: body.trim(),
      build: (n) => replaceNote(sourceOf(range), id, index, n.text),
    });
  }

  // The owner's notes get an Edit control, right after the note in its card; a thread that is one owner's note gets it in
  // the card's action row instead, next to Reply and Resolve. A note is the owner's when its author is state.author exactly. The thread's data-md holds the exact source of its notes, in source order, so index and the
  // body come from it; the card's p.c-note elements must match them one for one.
  function addEditControls(id, card) {
    if (state.author === null) return;
    const thread = threadOf(id);
    const notes = [...thread.dataset.md.matchAll(NOTE)].map((m) => m.groups);
    const cardNotes = card.querySelectorAll(':scope > .c-note');
    if (cardNotes.length !== notes.length) {
      throw new Error(`comment ${id}: the rail shows ${cardNotes.length} notes but its source has ${notes.length}`);
    }
    notes.forEach((note, index) => {
      if (note.author !== state.author) return;
      // The first note of a block comment line starts with its quote, which is not part of the body.
      const quoted = index === 0 && thread.querySelector('q.c-quote') !== null;
      const body = quoted ? splitQuote(note.text).body : note.text;
      const button = make('button', 'comment-edit', 'Edit');
      button.type = 'button';
      button.addEventListener('mousedown', keepPress);
      button.addEventListener('click', () => onEdit(id, index, body));
      if (notes.length === 1) card.querySelector('.comment-actions').append(button);
      else cardNotes[index].after(button);
    });
  }

  // Resolve saves at once. An inline thread loses its notes and markers; a block comment line goes whole, so its text is
  // empty and the splice drops the line and the blank line beside it.
  function onResolve(id) {
    const reason = blockedReason();
    if (reason) return notify(reason);
    const el = topBlockOf(threadOf(id));
    const range = el.getAttribute('data-src');
    let text;
    try {
      text = el.classList.contains('c-line') ? '' : stripThread(sourceOf(range), id);
    } catch (err) {
      notify(err.message);
      return;
    }
    send(range, text);
  }

  if (document.querySelector('span.c-thread')) {
    for (const [id, card] of railHook().cards) {
      const actions = make('span', 'comment-actions');
      const reply = make('button', 'comment-reply', 'Reply');
      reply.type = 'button';
      const resolve = make('button', 'comment-resolve', 'Resolve');
      resolve.type = 'button';
      reply.addEventListener('mousedown', keepPress);
      resolve.addEventListener('mousedown', keepPress);
      reply.addEventListener('click', () => onReply(id));
      resolve.addEventListener('click', () => onResolve(id));
      actions.append(reply, resolve);
      card.querySelector('.c-actions').append(actions);
      addEditControls(id, card);
    }
  }

  // ---- when the controls follow the selection --------------------------------------------------------------------

  // The guest reports a selection inside an island (M5 R6.1). An empty one clears it, as an empty page selection does.
  document.addEventListener('margent:island-selection', (e) => {
    const { text, rect } = e.detail;
    if (!text) {
      islandSel = null;
    } else {
      if (!rect) throw new Error(`island ${e.target.getAttribute('name')}: its selection has text but no rect`);
      const origin = e.target.getBoundingClientRect();
      islandSel = {
        el: e.target,
        text,
        rect: { left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height },
      };
    }
    update();
  });
  // A page selection replaces an island's. The page selection changes when the reader selects page text, not in a frame.
  document.addEventListener('selectionchange', () => {
    if (window.getSelection().toString() !== '') islandSel = null;
    update();
  });
  // A press on our own controls is not a drag: hiding the Comment control on its press would cancel its click.
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest?.('.comment-tool, .comment-box')) return;
    islandSel = null; // a press on the page is outside any island's frame (a press in a frame never reaches the page)
    dragging = true;
    update();
  });
  document.addEventListener('pointerup', () => {
    dragging = false;
    update();
  });
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
}
