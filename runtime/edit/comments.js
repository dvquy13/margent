// The comment UI (M3 spec R5, R6; plan T8). Runs only in a page that `margent serve` produced. It adds a Comment
// control at a selection inside one top-level block, a comment control on every block, and Reply, Resolve and Edit on
// the thread's card. A new comment is a draft card; a reply is a field at the foot of its thread's card; an owner's edit
// replaces its note's text with the field. Every save is one margent.save of one block (decision 0021): the block's new
// source is built here from its markdown with the syntax module.
import {
  appendNote,
  fieldFromNote,
  NOTE,
  nextId,
  noteFromField,
  noteLines,
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
// focus out of a field being typed in.
function keepPress(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
}

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

// The phrase a block comment from a selection quotes (decision 0023), stored by MargentQuote.store (runtime/quote.js, loaded
// before the edit bundle): the selected text, whitespace collapsed and trimmed, each " as '. '' when nothing is selected.
function quoteOf(text) {
  return window.MargentQuote.store(text);
}

// The field: a quiet textarea in the card's type. Its lines are saved as one note line joined by `<br>` (decision 0037),
// and it grows with its text up to about eight lines, then scrolls (edit.css).
// A field that is not rendered (detached, or in a hidden draft) measures 0, so it keeps its natural one-line height
// until it is shown; every caller that shows a field fits it then.
function fitField(field) {
  field.style.height = '';
  if (field.getClientRects().length === 0) return;
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`; // + the borders
}

// A composer: the field, its message line, and the row of Cancel and Save under it. The caller places body.
function makeCompose(placeholder) {
  const field = make('textarea', 'comment-input');
  field.rows = 1;
  field.autocomplete = 'off';
  field.spellcheck = true;
  field.placeholder = placeholder;
  field.setAttribute('aria-label', placeholder || 'Note text');
  field.addEventListener('input', () => fitField(field));
  const view = msgView();
  const cancel = make('button', 'comment-cancel', 'Cancel');
  cancel.type = 'button';
  const save = make('button', 'comment-save', 'Save');
  save.type = 'button';
  save.addEventListener('mousedown', keepPress);
  cancel.addEventListener('mousedown', keepPress);
  const row = make('div', 'comment-row');
  row.append(cancel, save);
  const body = make('div', 'comment-compose');
  body.append(field, view.el, row);
  return { field, view, save, cancel, body };
}

// One message line under a field: UI type, an error in red, and an optional action link.
function msgView() {
  const el = make('p', 'comment-msg');
  el.setAttribute('role', 'alert');
  el.hidden = true;
  const text = make('span');
  const action = make('button', 'comment-action');
  action.type = 'button';
  action.hidden = true;
  el.append(text, action);
  const view = {
    el,
    run: null,
    set(message, { error = false, action: act = null } = {}) {
      text.textContent = message ?? '';
      el.hidden = !message;
      el.classList.toggle('comment-msg--error', error && Boolean(message));
      view.run = act ? act.run : null;
      action.hidden = !act;
      action.textContent = act ? act.label : '';
    },
  };
  action.addEventListener('click', () => view.run?.());
  return view;
}

export function initComments(margent) {
  const { state, blocks, sourceOf, toMarkdown, save, anchor } = margent;

  // ---- the new-comment card: a draft that looks like the card it becomes -----------------------------------------
  // A quote (when there is one), the author's header, the field, the message line and Cancel · Save.
  const box = make('article', 'comment-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Comment');
  box.hidden = true;
  const boxQuote = make('q', 'c-quote');
  boxQuote.hidden = true;
  const boxHead = make('div', 'c-note-head');
  const boxAuthor = make('b', 'c-author');
  boxHead.append(boxAuthor);
  const boxC = makeCompose('Add a comment');
  box.append(boxQuote, boxHead, boxC.body);
  document.body.append(box);

  // The Comment control at a selection. It is shown only while nothing is being typed.
  const tool = make('button', 'comment-tool', 'Comment');
  tool.type = 'button';
  tool.hidden = true;
  tool.addEventListener('mousedown', keepPress);
  tool.addEventListener('click', onTool);
  document.body.append(tool);

  // A draft is one open composer: boxD (the new-comment card, one object for the page, filled by showBox), replyD (a
  // field at the foot of a thread's card) or editD (an owner's note being edited). Each is { kind, active, busy, form,
  // editor, view, save, cancel, container, range, id, build, restore, close(restore) }. busy disables it while its save
  // is in flight. restore is what takes focus on a cancel.
  const boxD = {
    kind: 'box',
    active: false,
    busy: false,
    form: false,
    editor: boxC.field,
    view: boxC.view,
    save: boxC.save,
    cancel: boxC.cancel,
    container: box,
    range: null,
    id: undefined,
    build: null,
    restore: null,
    close: (restore) => closeBox(restore),
  };
  let replyD = null;
  let editD = null;
  let dragging = false;
  // The text selected inside an island, as its frame reported it: { el, text, rect } with rect relative to the island.
  // The page's selection cannot see into the frame, so this stands in for it (M5 R6.1). null when there is none.
  let islandSel = null;
  // The island whose phrase is marked for the open draft, so clear can unmark it. null when none is.
  let markedIsland = null;

  const hasText = (d) => d.active && d.editor.value.trim() !== '';

  // Unsaved text is unsaved page text, so a reload waits for it (R5.7). An edit counts only when its text changed.
  margent.registerDirty(
    () =>
      hasText(boxD) ||
      (replyD !== null && hasText(replyD)) ||
      (editD !== null && noteFromField(editD.editor.value) !== editD.original),
  );

  function setDraftBusy(d, on) {
    d.busy = on;
    d.editor.disabled = on;
    d.save.disabled = on;
    d.cancel.disabled = on;
  }

  // Closes the new-comment card and drops its state: the text, the pending highlight and the island mark. The rail
  // puts the card back at the foot of the page. Focus moves back to what opened it only when restore is true.
  function closeBox(restore) {
    const target = boxD.restore;
    boxD.active = false;
    boxD.restore = null;
    boxD.build = null;
    setDraftBusy(boxD, false);
    boxC.field.value = '';
    fitField(boxC.field);
    boxC.view.set(null);
    box.hidden = true;
    CSS.highlights.delete(PENDING);
    if (markedIsland !== null) {
      window.margentIslands.mark(markedIsland, null);
      markedIsland = null;
    }
    railHook().hideDraft();
    if (restore && target?.isConnected) target.focus();
  }

  // Opens the new-comment card. form false is a message only (a refusal or a failed save), with a Close link.
  function showBox(next) {
    const from = document.activeElement;
    closeBox(false);
    boxD.restore = from instanceof HTMLElement && from !== document.body ? from : null;
    boxD.active = true;
    boxD.form = next.form;
    boxD.range = next.range ?? null;
    boxD.id = next.id;
    boxD.build = next.build ?? null;
    boxQuote.textContent = next.quote ?? '';
    boxQuote.hidden = !next.quote;
    boxHead.hidden = !next.form;
    boxAuthor.textContent = state.author ?? '';
    boxC.field.hidden = !next.form;
    boxC.save.hidden = !next.form;
    boxC.cancel.textContent = next.form ? 'Cancel' : 'Close';
    if (next.preview) CSS.highlights.set(PENDING, new Highlight(next.preview));
    if (next.islandPreview) {
      // The island's frame draws the phrase, as the page's pending highlight would (R6.2, the same mark a hover uses).
      // Only the selected match, when the note names one (decision 0041).
      window.margentIslands.mark(next.islandPreview.el, next.islandPreview.phrase, next.islandPreview.occurrence);
      markedIsland = next.islandPreview.el;
    }
    const parts = [next.msg, next.form && state.author === null ? AUTHOR_MESSAGE : null].filter(Boolean);
    boxC.view.set(parts.length ? parts.join(' ') : null, {
      error: next.error || (next.form && state.author === null),
      action: next.action ?? null,
    });
    box.hidden = false;
    if (next.place) railHook().showDraft(box, next.place);
    fitField(boxC.field);
    if (next.form) boxC.field.focus({ preventScroll: Boolean(next.place) });
    else boxC.cancel.focus();
    update();
  }

  // A refusal or a failed save. While a draft holds text, the message goes on that draft, so its text is not lost.
  function notify(text, error = true) {
    const drafting = [boxD, replyD, editD].find((d) => d !== null && hasText(d));
    if (drafting) {
      drafting.view.set(text, { error });
      return;
    }
    showBox({ form: false, msg: text, error });
  }

  // The reason an action cannot start now, or null. A note being written or edited, the side panel and an edit with
  // unsaved changes each hold text that a block save would drop.
  function blockedReason() {
    if (hasText(boxD) || (replyD !== null && hasText(replyD))) return 'Send or cancel the note you are writing first.';
    if (editD !== null) return 'Save or cancel the note you are editing first (Enter saves, Esc cancels).';
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
  // 422 opens the panel with the errors. A failure goes to job.fail, which keeps the text where it is. job is
  // { fail(message), finish() }; finish runs before the page moves on.
  async function send(range, text, job) {
    let res;
    try {
      res = await save(range, text);
    } catch (err) {
      job.fail(`Save failed: ${err.message}. Your note is still here.`);
      return;
    }
    if (res.status === 200) {
      job.finish();
      margent.reload();
    } else if (res.status === 409) {
      job.finish();
      margent.stale(range, text);
    } else if (res.status === 422) {
      job.finish();
      const errors = Array.isArray(res.body?.errors) ? res.body.errors : [`HTTP 422: ${JSON.stringify(res.body)}`];
      margent.openPanel(range, { text, errors });
    } else {
      job.fail(`Save failed (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
    }
  }

  // The job for a draft: a failure keeps its text and shows the message; a finish closes it.
  const draftJob = (d) => ({
    fail: (message) => {
      setDraftBusy(d, false);
      d.view.set(message, { error: true });
    },
    finish: () => d.close(false),
  });

  // Enter saves. An empty new comment or reply sends nothing; an edit that is empty is refused and keeps its field; an
  // unchanged edit closes without a save. A note without an author says so. The text is in the note's stored form, one
  // line with `<br>` (decision 0037), so an edit's original is compared in that form too.
  function submit(d) {
    if (!d.active || d.busy) return;
    const text = noteFromField(d.editor.value);
    const empty = noteLines(text).join('').trim() === '';
    if (d.kind === 'edit') {
      if (text === d.original) return d.close(true);
      if (empty) return d.view.set(EMPTY_EDIT_MESSAGE, { error: true });
    } else if (empty) {
      return;
    }
    if (state.author === null) {
      d.view.set(AUTHOR_MESSAGE, { error: true });
      return;
    }
    let body;
    try {
      body = d.build({ id: d.id ?? nextId(state.source), author: state.author, text });
    } catch (err) {
      d.view.set(err.message, { error: true });
      return;
    }
    setDraftBusy(d, true);
    send(d.range, body, draftJob(d));
  }

  // Esc and Cancel close a draft and put focus back where it was (an edit puts its note's text back).
  function cancel(d) {
    if (!d.active || d.busy) return;
    d.close(true);
    margent.idle();
    update();
  }

  function attachDraft(d) {
    d.editor.addEventListener('keydown', (e) => {
      // Shift+Enter, and Enter while composing, keep the field's own newline (decision 0037).
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      submit(d);
    });
    d.container.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !d.active) return;
      e.preventDefault();
      e.stopPropagation();
      cancel(d);
    });
    d.save.addEventListener('click', () => submit(d));
    d.cancel.addEventListener('click', () => cancel(d));
    // A new comment or a reply left empty closes when the focus leaves it, as the note box did. Typed text stays until it
    // is sent or cancelled. An edit stays open until it is saved or cancelled.
    d.container.addEventListener('focusout', (e) => {
      if (!d.active || !d.form || d.kind === 'edit' || d.busy) return;
      if (d.container.contains(e.relatedTarget) || d.editor.value.trim() !== '') return;
      d.close(false);
      margent.idle();
      update();
    });
  }
  attachDraft(boxD);

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

  // Places the Comment control under the selection's end. It is hidden while a draft is open, while the mouse is down
  // (a drag), and when the selection is not inside one block.
  function update() {
    const drafting = boxD.active || replyD !== null || editD !== null;
    const el = !drafting && !dragging ? selectedBlock() : null;
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
  // quotedText refuses a quote it cannot store, which the card shows when the note is sent.
  // The draft lines up with the selected phrase when there is one, else with the block.
  function openBlockComment(el, quote = '') {
    const range = blockCreateRange(el);
    // A quote from an island's selection: its rect is the frame's report, and the phrase is marked in the frame.
    const inFrame = quote && islandSel !== null && islandSel.el === el ? islandSel : null;
    const picked = quote && !inFrame ? selectionRange() : null;
    // Which match of the quote the selection is (decision 0041). The quote names it only when the block repeats the
    // phrase; a selection that reaches no match (n 0) writes no #n, and the quote then marks every match.
    let at = null;
    if (inFrame) at = { n: inFrame.occurrence, count: inFrame.count };
    else if (picked) at = window.MargentQuote.occurrence(el, quote, picked);
    const occurrence = at !== null && at.count > 1 && at.n > 0 ? at.n : undefined;
    const top = () => {
      if (inFrame) return islandRect(inFrame).top;
      const box = picked ? selectionEndRect(picked, el) : null;
      return (box && box.height > 0 ? picked.getBoundingClientRect() : el.getBoundingClientRect()).top;
    };
    showBox({
      form: true,
      quote: quote || undefined,
      place: { top },
      preview: picked ?? undefined, // the selected phrase stays marked while the note is typed, as for an inline comment
      islandPreview: inFrame ? { el, phrase: quote, occurrence } : undefined,
      range,
      build: (n) => `${sourceOf(range)}\n\n${noteSource(quote ? { ...n, text: quotedText(quote, n.text, occurrence) } : n)}`,
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
      showBox({
        form: true,
        quote: res.snapped.toString(),
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
            closeBox(false);
            margent.idle();
            reply.scrollIntoView({ block: 'center' });
            reply.focus();
          },
        }
      : null;
    showBox({ form: false, error: true, msg: `This selection touches comment ${id}. Reply to that thread instead.`, action, place: { after: id } });
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

  // ---- Reply, Resolve and Edit on the thread's card (R6), in the rail (decision 0023) ------------------------------

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

  // Reply appends the author's header and a field ("Reply") after the thread's last note. The footer hides while the
  // reply is typed, and comes back when it closes.
  function onReply(id) {
    const reason = blockedReason();
    if (reason) return notify(reason);
    if (replyD !== null) replyD.close(false);
    const range = topBlockOf(threadOf(id)).getAttribute('data-src');
    const card = revealCard(id);
    const footer = card.querySelector('.c-actions');
    const reply = card.querySelector('.comment-reply');
    const wrap = make('div', 'c-note');
    const head = make('div', 'c-note-head');
    head.append(make('b', 'c-author', state.author ?? ''));
    const c = makeCompose('Reply');
    wrap.append(head, c.body);
    footer.before(wrap);
    footer.hidden = true;
    const d = {
      kind: 'reply',
      active: true,
      busy: false,
      form: true,
      editor: c.field,
      view: c.view,
      save: c.save,
      cancel: c.cancel,
      container: wrap,
      range,
      id,
      build: (n) => appendNote(sourceOf(range), id, n),
      restore: reply,
    };
    d.close = (restore) => {
      d.active = false;
      d.busy = false;
      wrap.remove();
      footer.hidden = false;
      if (replyD === d) replyD = null;
      if (restore) reply.focus();
    };
    if (state.author === null) c.view.set(AUTHOR_MESSAGE, { error: true });
    attachDraft(d);
    replyD = d;
    c.field.focus();
  }

  // Edit replaces the note's text with the field, prefilled with the note's body (the quote and author stay as they
  // are, replaceNote keeps them). index is the note's place among the thread's notes in source order.
  function beginEdit(info) {
    const reason = blockedReason();
    if (reason) return notify(reason);
    if (replyD !== null) replyD.close(false);
    const { id, index, body, range, note, text, button } = info;
    const c = makeCompose('Edit note');
    c.field.value = fieldFromNote(body);
    const d = {
      kind: 'edit',
      active: true,
      busy: false,
      form: true,
      editor: c.field,
      view: c.view,
      save: c.save,
      cancel: c.cancel,
      container: note,
      range,
      id,
      build: (n) => replaceNote(sourceOf(range), id, index, n.text),
      restore: button,
      // In the stored form the field gives back, so a note written with `<br/>` and left unchanged sends no save.
      original: noteFromField(fieldFromNote(body)),
    };
    d.close = (restore) => {
      d.active = false;
      d.busy = false;
      c.body.replaceWith(text);
      button.hidden = false;
      if (editD === d) editD = null;
      if (restore) button.focus();
    };
    text.replaceWith(c.body);
    button.hidden = true;
    editD = d;
    attachDraft(d);
    fitField(c.field); // a detached field measures 0, so it is sized once it is in the card
    c.field.focus();
    c.field.setSelectionRange(c.field.value.length, c.field.value.length);
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
    send(range, text, { fail: (message) => notify(message), finish: () => {} });
  }

  // The owner's notes get an Edit link in their header row. A note is the owner's when its author is state.author
  // exactly. The thread's data-md holds the exact source of its notes, in source order, so index and the body come from
  // it; the card's note lines must match them one for one.
  function markOwnNotes(id, card) {
    if (state.author === null) return;
    const thread = threadOf(id);
    const notes = [...thread.dataset.md.matchAll(NOTE)].map((m) => m.groups);
    const cardNotes = card.querySelectorAll(':scope > .c-note');
    if (cardNotes.length !== notes.length) {
      throw new Error(`comment ${id}: the rail shows ${cardNotes.length} notes but its source has ${notes.length}`);
    }
    const range = topBlockOf(thread).getAttribute('data-src');
    notes.forEach((note, index) => {
      if (note.author !== state.author) return;
      // The first note of a block comment line starts with its quote, which is not part of the body.
      const quoted = index === 0 && thread.querySelector('q.c-quote') !== null;
      const body = quoted ? splitQuote(note.text).body : note.text;
      const line = cardNotes[index];
      const text = line.querySelector(':scope > .c-text');
      const button = make('button', 'comment-edit', 'Edit');
      button.type = 'button';
      line.dataset.own = '';
      line.querySelector('.c-note-head').append(button);
      button.addEventListener('click', () => beginEdit({ id, index, body, range, note: line, text, button }));
    });
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
      markOwnNotes(id, card);
    }
  }

  // ---- when the controls follow the selection --------------------------------------------------------------------

  // The guest reports a selection inside an island (M5 R6.1). An empty one clears it, as an empty page selection does.
  document.addEventListener('margent:island-selection', (e) => {
    const { text, rect, occurrence, count } = e.detail;
    if (!text) {
      islandSel = null;
    } else {
      if (!rect) throw new Error(`island ${e.target.getAttribute('name')}: its selection has text but no rect`);
      const origin = e.target.getBoundingClientRect();
      islandSel = {
        el: e.target,
        text,
        rect: { left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height },
        occurrence,
        count,
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
