// Comment rail (M3 spec R4, decision 0023). Inlined only in pages with threads, at the end of the body, before the edit
// bundle. It builds one card per thread from the DOM. The threads stay in their blocks, because house turndown writes a
// block back from its data-md, so the cards are copies of the notes. The script never moves a thread or edits its text.
// It exposes window.margentComments for the edit runtime.
(function () {
  const threads = [...document.querySelectorAll('span.c-thread[data-c]')];
  // A served page carries this script even with no threads yet, so the first note's draft can sit in the rail. Pages
  // from `open` and `export` include it only when they have threads (R2.5).

  const main = document.querySelector('main');
  const wide = window.matchMedia('(min-width: 1100px)');
  const LINKABLE = ':is(mark.c-hl, span.c-thread, article.c-card)[data-c]';
  const QUOTE_HIGHLIGHT = 'margent-quote'; // the hovered or focused card's phrase
  const QUOTES_HIGHLIGHT = 'margent-quotes'; // every quoted phrase, always shown, like a highlight
  const GAP = 8; // between stacked cards, px

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---- the rail: one card per thread, in document order --------------------------------------------------------------

  const rail = el('aside', 'c-rail');
  rail.id = 'c-rail';
  rail.setAttribute('aria-label', 'Comments');
  const head = el('div', 'c-rail-head');
  const title = el('span', 'c-rail-title');
  const closeBtn = el('button', 'c-close', 'Close');
  closeBtn.type = 'button';
  head.append(title, closeBtn);
  rail.append(head);

  const toggle = el('button', 'c-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'c-rail');
  toggle.setAttribute('aria-expanded', 'false');

  const cards = new Map(); // id -> card
  const anchors = new Map(); // id -> the element the card lines up with
  const quotes = new Map(); // id -> the quoted text, for a block comment that has one

  for (const thread of threads) {
    const id = thread.dataset.c;
    const line = thread.closest('p.c-line');
    const mark = document.querySelector(`mark.c-hl[data-c="${id}"]`);
    let kind;
    let anchor;
    if (line) {
      kind = 'block';
      anchor = document.querySelector(`[data-src="${line.dataset.anchor}"]`);
      if (!anchor) throw new Error(`comment ${id}: no block with data-src "${line.dataset.anchor}" to anchor to`);
    } else if (mark) {
      kind = 'inline';
      anchor = mark;
    } else {
      kind = 'point';
      anchor = thread;
      thread.classList.add('c-point');
    }

    const card = el('article', 'c-card');
    card.dataset.c = id;
    card.dataset.kind = kind;
    card.tabIndex = 0;

    let quote = null;
    if (kind === 'inline') quote = mark.textContent;
    if (kind === 'block') {
      const quoted = thread.querySelector('q.c-quote');
      if (quoted) quote = quoted.textContent;
    }
    if (quote !== null) {
      card.append(el('q', 'c-quote', quote));
      quotes.set(id, quote);
    }
    for (const note of thread.querySelectorAll('.c-note')) {
      const copy = note.cloneNode(true);
      for (const q of copy.querySelectorAll('q.c-quote')) q.remove();
      const p = el('p', 'c-note');
      p.append(...copy.childNodes);
      card.append(p);
    }
    card.append(el('div', 'c-actions'));

    cards.set(id, card);
    anchors.set(id, anchor);
    rail.append(card);
  }

  title.textContent = `Comments · ${cards.size}`;
  toggle.textContent = `Comments · ${cards.size}`;
  main.append(rail);
  document.body.append(toggle);
  // The rail is on while it has cards, and, on a page with none yet, while a draft is open in it.
  const railOn = (on) => document.documentElement.classList.toggle('c-rail-on', on);
  railOn(cards.size > 0);

  // The draft: the edit runtime's note box, placed in the rail like a card (decision 0023). place is { top() } for a
  // new comment (the viewport top of what it is about) or { after: id } for a reply, which sits right under that card.
  // Below 1100px the box stays docked at the bottom of the window, so the selection it is about stays in view.
  let draft = null;
  // place: { after: id } (a reply, under its card), { top() } (a new comment, by its anchor), or { note } (an edit: the
  // box stands in for that note inside its card, at every width, and the note comes back when the box goes).
  function showDraft(box, place) {
    draft = { box, place };
    cardObserver.observe(box); // a message line or a wrap in the box moves the cards under it
    if (place.note !== undefined) {
      place.note.hidden = true;
      place.note.closest('.c-card').classList.add('is-editing');
      box.classList.add('c-inplace');
      place.note.after(box);
    } else if (wide.matches) {
      railOn(true);
      box.classList.add('c-draft');
      rail.append(box);
    } else {
      dockDraft(box);
    }
    relayout();
  }
  function hideDraft() {
    if (draft === null) return;
    cardObserver.unobserve(draft.box);
    if (draft.place.note !== undefined) {
      draft.place.note.hidden = false;
      draft.place.note.closest('.c-card').classList.remove('is-editing');
      draft.box.classList.remove('c-inplace');
    }
    dockDraft(draft.box);
    draft = null;
    railOn(cards.size > 0);
    relayout();
  }
  function dockDraft(box) {
    box.classList.remove('c-draft');
    box.style.top = '';
    document.body.append(box);
  }

  // ---- placement: each card's top is its anchor's top, pushed down when the card above reaches it -------------------

  function relayout() {
    main.style.minHeight = '';
    if (!wide.matches) {
      for (const card of cards.values()) card.style.top = '';
      if (draft !== null && draft.box.parentNode === rail) dockDraft(draft.box);
      return;
    }
    if (draft !== null && draft.place.note === undefined && draft.box.parentNode !== rail) showDraft(draft.box, draft.place);
    // The rail is positioned against main, so anchors are measured from main's top edge. The draft joins the cards in
    // order: right after its thread's card for a reply, else before the first card whose anchor is further down.
    const origin = main.getBoundingClientRect().top;
    const entries = [...cards].map(([id, card]) => ({ id, el: card, wanted: anchors.get(id).getBoundingClientRect().top - origin }));
    if (draft !== null && draft.place.note === undefined) {
      const { place } = draft;
      if (place.after !== undefined) {
        const at = entries.findIndex((e) => e.id === place.after);
        entries.splice(at + 1, 0, { el: draft.box, wanted: -Infinity });
      } else {
        const wanted = place.top() - origin;
        const at = entries.findIndex((e) => e.wanted > wanted);
        entries.splice(at < 0 ? entries.length : at, 0, { el: draft.box, wanted });
      }
    }
    let bottom = -Infinity;
    for (const { el: item, wanted } of entries) {
      const top = Math.max(wanted, bottom + GAP);
      item.style.top = `${top}px`;
      bottom = top + item.getBoundingClientRect().height;
    }
    // Absolute cards do not grow the page, so main is made tall enough to hold the rail above the footer.
    const padBottom = parseFloat(getComputedStyle(main).paddingBottom);
    main.style.minHeight = `${bottom + padBottom}px`;
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      relayout();
    });
  }

  relayout();
  window.addEventListener('resize', schedule);
  wide.addEventListener('change', schedule);
  new ResizeObserver(schedule).observe(main);
  const cardObserver = new ResizeObserver(schedule);
  for (const card of cards.values()) cardObserver.observe(card);
  // An island renders after the page loads, and its height moves the cards below it.
  new MutationObserver((records) => {
    if (records.some((r) => r.target.localName === 'agent-island')) schedule();
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-state'] });
  if (document.fonts) document.fonts.ready.then(schedule);

  // ---- linking: the highlight or point marker, the card and (for a block) the block, marked together -------------------

  // Finds the text in one root (a block) and returns a Range over it, or null. The phrase may run across text nodes
  // (two list items, or text around bold), and whitespace is ignored on both sides: a quote is stored with its whitespace
  // collapsed, and one taken from an island before 2026-10-24 has none at block boundaries ("gate.Spread"). A quote
  // stores ' for each " of the page (quoteOf in runtime/edit/comments.js), so " is read as ' on both sides.
  function findText(root, text) {
    const wanted = text.replace(/\s+/g, '').replaceAll('"', "'");
    if (wanted === '') return null;
    const chars = []; // each non-space character of the root's text, with its text node and offset
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.nodeValue;
      for (let i = 0; i < value.length; i++) if (!/\s/.test(value[i])) chars.push({ node, i, c: value[i].replace('"', "'") });
    }
    const at = chars.map((x) => x.c).join('').indexOf(wanted);
    if (at < 0) return null;
    const first = chars[at];
    const last = chars[at + wanted.length - 1];
    const range = document.createRange();
    range.setStart(first.node, first.i);
    range.setEnd(last.node, last.i + 1);
    return range;
  }

  const isIsland = (el) => el.localName === 'agent-island';
  // Marks a phrase in one island's frame, or clears it with null. Without margentIslands there is no island to mark.
  function markInIsland(el, phrase) {
    if (window.margentIslands) window.margentIslands.mark(el, phrase);
  }

  // Quoted phrases (decision 0023) are marked with the Custom Highlight API, so the DOM never changes: all of them
  // always, in the highlight tint, and the linked card's one in the stronger tint. A phrase that isn't found in one text
  // node of its block is not marked, and its card links to the whole block. Browsers without the API mark blocks only.
  // An island's text is in its frame, which the page cannot search: a phrase quoted from an island is marked inside the
  // frame, on hover or focus, through margentIslands.mark (M5 R6.2). It has no always-on tint.
  const quoteRanges = new Map();
  function markQuotes() {
    if (!('highlights' in CSS)) return;
    quoteRanges.clear();
    for (const [id, quote] of quotes) {
      const anchor = anchors.get(id);
      if (isIsland(anchor)) continue;
      const range = findText(anchor, quote);
      if (range) quoteRanges.set(id, range);
    }
    CSS.highlights.set(QUOTES_HIGHLIGHT, new Highlight(...quoteRanges.values()));
  }
  markQuotes();

  function markQuote(id, on) {
    const anchor = anchors.get(id);
    if (isIsland(anchor)) {
      if (quotes.has(id)) markInIsland(anchor, on ? quotes.get(id) : null);
      return;
    }
    if (!('highlights' in CSS)) return;
    const range = on ? quoteRanges.get(id) : undefined;
    if (range === undefined) {
      CSS.highlights.delete(QUOTE_HIGHLIGHT);
      return;
    }
    const highlight = new Highlight(range);
    highlight.priority = 1; // drawn over the always-on tint
    CSS.highlights.set(QUOTE_HIGHLIGHT, highlight);
  }

  // A click on a marked phrase opens its card, as a click on a highlight does. Only blocks that are not edited in place
  // take it (a quote sits in a table, an island, a figure or code), so it never competes with starting an edit.
  document.addEventListener('click', (e) => {
    if (quoteRanges.size === 0 || !document.caretPositionFromPoint) return;
    const block = e.target.closest && e.target.closest('[data-src]');
    if (!block || block.getAttribute('data-gate') === 'pass') return;
    const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
    if (!pos) return;
    for (const [id, range] of quoteRanges) {
      let hit = false;
      try {
        hit = range.isPointInRange(pos.offsetNode, pos.offset);
      } catch {
        hit = false; // a point in another tree than the range
      }
      if (!hit) continue;
      const card = window.margentComments.reveal(id);
      card.focus();
      card.scrollIntoView({ block: 'nearest' });
      return;
    }
  });

  function setLinked(id, on) {
    const parts = new Set(document.querySelectorAll(`:is(mark.c-hl, span.c-thread, article.c-card)[data-c="${id}"]`));
    const anchor = anchors.get(id);
    if (anchor.matches('[data-src]')) parts.add(anchor);
    for (const part of parts) part.classList.toggle('is-linked', on);
    markQuote(id, on);
  }

  function linkOf(e) {
    return e.target.closest ? e.target.closest(LINKABLE) : null;
  }
  document.addEventListener('pointerover', (e) => {
    const node = linkOf(e);
    if (node) setLinked(node.dataset.c, true);
  });
  document.addEventListener('pointerout', (e) => {
    const node = linkOf(e);
    if (node) setLinked(node.dataset.c, false);
  });
  document.addEventListener('focusin', (e) => {
    const node = linkOf(e);
    if (node) setLinked(node.dataset.c, true);
  });
  document.addEventListener('focusout', (e) => {
    const node = linkOf(e);
    if (node) setLinked(node.dataset.c, false);
  });

  // Keyboard users reach each highlight and point marker with Tab, and each card. The attribute is set here, not in the
  // HTML, so a page without this script has no extra tab stops.
  for (const node of document.querySelectorAll('mark.c-hl[data-c], span.c-thread[data-c]')) node.tabIndex = 0;

  // ---- the drawer, below 1100px -------------------------------------------------------------------------------------

  function isOpen() {
    return rail.classList.contains('is-open');
  }
  function setOpen(on) {
    rail.classList.toggle('is-open', on);
    toggle.setAttribute('aria-expanded', String(on));
  }
  toggle.addEventListener('click', () => {
    setOpen(!isOpen());
    if (isOpen()) closeBtn.focus();
  });
  closeBtn.addEventListener('click', () => {
    setOpen(false);
    toggle.focus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) {
      setOpen(false);
      toggle.focus();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !rail.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
  });

  // A click on a card (below 1100px) closes the drawer and scrolls the anchor into view. The card is marked until the
  // next press or key, so the reader sees which part it was.
  function flash(id) {
    setLinked(id, true);
    const clear = () => {
      setLinked(id, false);
      document.removeEventListener('pointerdown', clear, true);
      document.removeEventListener('keydown', clear, true);
    };
    document.addEventListener('pointerdown', clear, true);
    document.addEventListener('keydown', clear, true);
  }
  for (const [id, card] of cards) {
    card.addEventListener('click', (e) => {
      if (wide.matches || e.target.closest('button')) return;
      card.blur();
      anchors.get(id).scrollIntoView({ block: 'center' });
      setOpen(false);
      flash(id);
    });
  }

  // The hook for the edit runtime. reveal opens the drawer below 1100px, so a card's buttons can be reached.
  window.margentComments = {
    cards,
    relayout,
    reveal(id) {
      if (!wide.matches) setOpen(true);
      return cards.get(id);
    },
    showDraft,
    hideDraft,
    close() {
      setOpen(false);
    },
  };
})();
