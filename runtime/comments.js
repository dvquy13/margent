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
  const occurrences = new Map(); // id -> the match the quote names (`"phrase" #n`, decision 0041), when it names one

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
    let occurrence;
    if (kind === 'inline') quote = mark.textContent;
    if (kind === 'block') {
      const quoted = thread.querySelector('q.c-quote');
      if (quoted) {
        quote = quoted.textContent;
        if ('occurrence' in quoted.dataset) occurrence = Number(quoted.dataset.occurrence);
      }
    }
    if (quote !== null) {
      card.append(el('q', 'c-quote', quote));
      quotes.set(id, quote);
      if (occurrence !== undefined) occurrences.set(id, occurrence);
    }
    // A note is a header row (its author; the edit runtime adds Edit to an owner's) and its text below it.
    for (const note of thread.querySelectorAll('.c-note')) {
      const copy = note.cloneNode(true);
      for (const q of copy.querySelectorAll('q.c-quote')) q.remove();
      const author = copy.querySelector('.c-author');
      if (author === null) throw new Error(`comment ${id}: a note has no author element`);
      author.remove();
      const head = el('div', 'c-note-head');
      head.append(author);
      // The text keeps its breaks (decision 0037), so it is built from the nodes left, not from textContent. The spaces
      // the markup puts at either end go, and a text node that empties goes with them.
      const text = el('div', 'c-text');
      text.append(...copy.childNodes);
      for (let n = text.firstChild; n?.nodeType === Node.TEXT_NODE; n = text.firstChild) {
        n.data = n.data.trimStart();
        if (n.data !== '') break;
        n.remove();
      }
      for (let n = text.lastChild; n?.nodeType === Node.TEXT_NODE; n = text.lastChild) {
        n.data = n.data.trimEnd();
        if (n.data !== '') break;
        n.remove();
      }
      const p = el('p', 'c-note');
      p.append(head, text);
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

  // The draft: the edit runtime's new-comment card, placed in the rail like a card (decision 0023). place is { top() }
  // for a new comment (the viewport top of what it is about), or { after: id } for a message about a thread, which sits
  // right under that card. Below 1100px the card stays docked at the bottom of the window, so the selection it is about
  // stays in view.
  let draft = null;
  function showDraft(box, place) {
    draft = { box, place };
    cardObserver.observe(box); // a message line or a wrap in the box moves the cards under it
    if (wide.matches) {
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

  const isIsland = (el) => el.localName === 'agent-island';
  // Marks a phrase in one island's frame, or clears it with a null phrase. occurrence picks one match (null: all of them).
  // Without margentIslands there is no island to mark.
  function markInIsland(el, phrase, occurrence) {
    if (window.margentIslands) window.margentIslands.mark(el, phrase, occurrence ?? null);
  }

  // Quoted phrases (decision 0023) are marked with the Custom Highlight API, so the DOM never changes: all of their
  // matches always, in the highlight tint, and the linked card's ones in the stronger tint. The ranges come from
  // MargentQuote.find (runtime/quote.js), whether or not the API exists, since the miss state needs them. A phrase that
  // isn't found in its block is not marked, its card links to the whole block, and the card says so (markMissing).
  // Browsers without the API mark blocks only. An island's text is in its frame, which the page cannot search: a phrase
  // quoted from an island is marked inside the frame, on hover or focus, through margentIslands.mark (M5 R6.2). It has
  // no always-on tint, and its miss state comes from margentIslands.find in quoteReport.
  // A block comment with no quote is about its whole block (decision 0039). A prose block is marked like a phrase, all
  // of its text; a table, code, a figure or an island would be one large tint, so it takes c-commented, a light bar.
  // A quote that names its match (decision 0041) marks only that one. A quote that occurs more than once, and names none,
  // marks every match, and its card says how many places it matches.
  const PROSE = ':is(p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote)';
  const markRanges = new Map(); // id -> the Range[] its card marks: its quote's matches, or its prose block's text
  const counts = new Map(); // id -> how many matches its quote has in its block (page blocks only)
  function markQuotes() {
    markRanges.clear();
    for (const [id, card] of cards) {
      if (card.dataset.kind !== 'block') continue;
      const anchor = anchors.get(id);
      if (quotes.has(id)) {
        if (isIsland(anchor)) continue;
        const matches = MargentQuote.find(anchor, quotes.get(id));
        counts.set(id, matches.length);
        const occurrence = occurrences.get(id);
        if (occurrence === undefined) {
          if (matches.length > 0) markRanges.set(id, matches);
          if (matches.length > 1) quoteNote(id, `matches ${matches.length} places`);
        } else if (matches[occurrence - 1] !== undefined) {
          markRanges.set(id, [matches[occurrence - 1]]);
        }
      } else if (anchor.matches(PROSE) && 'highlights' in CSS) {
        const range = document.createRange();
        range.selectNodeContents(anchor);
        markRanges.set(id, [range]);
      } else {
        anchor.classList.add('c-commented');
      }
    }
    if ('highlights' in CSS) CSS.highlights.set(QUOTES_HIGHLIGHT, new Highlight(...[...markRanges.values()].flat()));
  }
  markQuotes();

  // A label under a card's quote (the class is c-quote-note). Applied once per card.
  function quoteNote(id, text) {
    const q = cards.get(id).querySelector(':scope > q.c-quote');
    if (q.nextElementSibling?.classList.contains('c-quote-note')) return;
    q.after(el('span', 'c-quote-note', text));
  }
  // A quote the page cannot find: its card's quote is muted and a label under it says so. Applied once per card.
  function markMissing(id) {
    const q = cards.get(id).querySelector(':scope > q.c-quote');
    if (q.classList.contains('c-quote-missing')) return;
    q.classList.add('c-quote-missing');
    quoteNote(id, 'not found in the page');
  }
  // An inline thread's text is its highlight, so only a block comment's quote can be missing.
  for (const id of quotes.keys()) {
    if (cards.get(id).dataset.kind === 'block' && !isIsland(anchors.get(id)) && !markRanges.has(id)) markMissing(id);
  }

  function markQuote(id, on) {
    const anchor = anchors.get(id);
    if (isIsland(anchor)) {
      if (quotes.has(id)) markInIsland(anchor, on ? quotes.get(id) : null, occurrences.get(id));
      return;
    }
    if (!('highlights' in CSS)) return;
    const ranges = on ? markRanges.get(id) : undefined;
    if (ranges === undefined) {
      CSS.highlights.delete(QUOTE_HIGHLIGHT);
      return;
    }
    const highlight = new Highlight(...ranges);
    highlight.priority = 1; // drawn over the always-on tint
    CSS.highlights.set(QUOTE_HIGHLIGHT, highlight);
  }

  // A click on a marked phrase opens its card, as a click on a highlight does. Only blocks that are not edited in place
  // take it (a quote sits in a table, an island, a figure or code), so it never competes with starting an edit.
  document.addEventListener('click', (e) => {
    if (markRanges.size === 0 || !document.caretPositionFromPoint) return;
    const block = e.target.closest && e.target.closest('[data-src]');
    if (!block || block.getAttribute('data-gate') === 'pass') return;
    const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
    if (!pos) return;
    for (const [id, ranges] of markRanges) {
      const hit = ranges.some((range) => {
        try {
          return range.isPointInRange(pos.offsetNode, pos.offset);
        } catch {
          return false; // a point in another tree than the range
        }
      });
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
      // A press in a button or the field of a draft is not a click on the card (below 1100px it would close the drawer).
      if (wide.matches || e.target.closest('button, textarea')) return;
      card.blur();
      anchors.get(id).scrollIntoView({ block: 'center' });
      setOpen(false);
      flash(id);
    });
  }

  // Every quoted block comment, in document order: { id, count }. count is how many matches the phrase has in its block
  // (page blocks from counts, islands from margentIslands.find), or null for an island that has not rendered. A quote is
  // missing (its card is marked, and the card says "not found in the page") when count is 0 or the occurrence it names is
  // past the last match. An ambiguous island quote (more than one match, no #n) gets the "matches {count} places" label,
  // as a page quote does at load. An inline thread's text is its highlight, which is in the source, so it is never reported.
  function quoteReport() {
    const blockQuotes = [...quotes.keys()].filter((id) => cards.get(id).dataset.kind === 'block');
    const missingIf = (id, count) => {
      const occurrence = occurrences.get(id);
      if (count === 0 || (occurrence !== undefined && occurrence > count)) markMissing(id);
      else if (occurrence === undefined && count > 1) quoteNote(id, `matches ${count} places`);
    };
    return Promise.all(blockQuotes.map((id) => {
      const anchor = anchors.get(id);
      if (!isIsland(anchor)) {
        const count = counts.get(id);
        missingIf(id, count);
        return { id, count };
      }
      if (anchor.getAttribute('data-state') !== 'rendered') return { id, count: null };
      return window.margentIslands.find(anchor, quotes.get(id)).then((count) => {
        if (count === null) return { id, count: null };
        missingIf(id, count);
        return { id, count };
      });
    }));
  }

  // The hook for the edit runtime. reveal opens the drawer below 1100px, so a card's buttons can be reached.
  window.margentComments = {
    cards,
    relayout,
    quoteReport,
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
