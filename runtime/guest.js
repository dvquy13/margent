// The island guest (M5 spec R3). It runs in the island's sandboxed srcdoc frame, after the kit, and talks to the page
// only through postMessage. It reads the island from #margent-island, checks the module with the checks that moved
// out of Node (R1.3), renders it into an open shadow root, and reports: state, height, overflow, links, selections,
// and how often a quoted phrase occurs (quote.js, copied into the frame before this script).
// Plain browser script: no imports, no network, and nothing touches the DOM until the first tokens message.
(function () {
  'use strict';

  var island = JSON.parse(document.getElementById('margent-island').textContent);
  var name = island.name;
  var MAX_JOINED = 240;
  var HIGHLIGHT_CSS = '::highlight(margent-quote) { background-color: var(--accent-border); }';
  var TOLERANCE = 1;

  var state = {
    started: false,
    rendered: false,
    tokens: null,
    callbacks: [],
    host: null,
    root: null,
    sheet: null
  };

  function post(msg) {
    window.parent.postMessage(msg, '*');
  }
  function messageOf(e) {
    return e && typeof e.message === 'string' ? e.message : String(e);
  }
  function firstLine(text) {
    return text.split('\n')[0];
  }

  // The schema message of the pre-M5 check, with its MAX_JOINED rule.
  function schemaMessage(errors) {
    var joined = errors.join('; ');
    var detail = joined.length <= MAX_JOINED ? joined : errors[0] + ' (and ' + (errors.length - 1) + ' more)';
    return 'island ' + name + ': data does not match schema: ' + detail;
  }

  // Runs the module's script once and returns what it registered. A throw at load is captured through the window
  // error event, as a script element reports it; a module that did not register is an error too.
  function loadModule() {
    var reg = window.__margentModules || (window.__margentModules = {});
    var captured = null;
    var onError = function (e) { captured = captured || e.error || new Error(e.message); };
    window.addEventListener('error', onError);
    var el = document.createElement('script');
    el.textContent = island.module;
    document.head.appendChild(el);
    el.remove();
    window.removeEventListener('error', onError);
    if (captured) throw new Error('module ' + island.path + ' throws at load: ' + messageOf(captured));
    if (!reg[name]) throw new Error('island "' + name + '": module did not register');
    return reg[name];
  }

  // The kit object a module receives. tokens follows the theme; onTheme callbacks run after each change.
  function makeKit() {
    return {
      get tokens() { return state.tokens; },
      onTheme: function (cb) { state.callbacks.push(cb); },
      md: MargentKit.md,
      esc: MargentKit.esc,
      fmt: MargentKit.fmt,
      tone: MargentKit.tone
    };
  }

  // Shows an error in the box and tells the page. `err` is what the box shows, `text` is the state's error (the check text).
  function failed(err, text) {
    MargentKit.showError(state.root, name, err);
    post({ type: 'state', state: 'error', error: text, mismatches: [] });
  }

  // A failure after the first render: an uncaught error, an unhandled rejection or an onTheme callback.
  function reportLater(err) {
    failed(err, 'island ' + name + ': ' + messageOf(err));
  }

  // Loads, checks and renders the island once, then posts its state. Every check throws a message with today's text.
  function renderIsland() {
    var mod;
    var mismatches;
    try {
      mod = loadModule();
      if (mod.contract !== MargentKit.CONTRACT) {
        throw new Error('island "' + name + '": module declares contract ' + String(mod.contract) + '; contract ' +
          MargentKit.CONTRACT + ' is required');
      }
      if (mod.schema === null || typeof mod.schema !== 'object') {
        throw new Error('island "' + name + '": module must export `schema`');
      }
      if (typeof mod.render !== 'function') {
        throw new Error('island "' + name + '": module must default-export a render function');
      }
      var errors;
      try {
        errors = MargentKit.validate(mod.schema, island.data);
      } catch (e) {
        throw new Error('island ' + name + ': ' + messageOf(e));
      }
      if (errors.length > 0) throw new Error(schemaMessage(errors));
      mismatches = MargentKit.checkPatterns(name, mod.schema, island.kind, island.data);
    } catch (e) {
      failed(e, messageOf(e));
      return;
    }
    try {
      mod.render(state.root, island.data, makeKit());
    } catch (e) {
      failed(e, 'island ' + name + ': ' + firstLine(messageOf(e)));
      return;
    }
    state.rendered = true;
    post({ type: 'state', state: 'rendered', error: null, mismatches: mismatches });
  }

  // Links never navigate the island: the page opens them, if the scheme is allowed.
  function onClick(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    e.preventDefault();
    post({ type: 'open', url: a.getAttribute('href') });
  }

  // Overflow (contract rule 4): the spill rule of `margent check`, measured against the host box.
  function overflowOf() {
    if (!state.rendered) return null;
    var root = state.root;
    var hostRect = state.host.getBoundingClientRect();
    var fits = function (rect) {
      return rect.left >= hostRect.left - TOLERANCE && rect.right <= hostRect.right + TOLERANCE;
    };
    var intentionalScroller = function (el) {
      for (var a = el.parentElement; a; a = a.parentElement) {
        var overflowX = getComputedStyle(a).overflowX;
        if ((overflowX === 'auto' || overflowX === 'scroll') && fits(a.getBoundingClientRect())) return true;
      }
      return false;
    };
    var describe = function (el) {
      var cls = (el.getAttribute('class') || '').trim().split(/\s+/)[0];
      var tag = el.tagName.toLowerCase() + (cls ? '.' + cls : '');
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30);
      return tag + ' "' + text + '"';
    };
    var flagged = [];
    root.querySelectorAll('*').forEach(function (el) {
      if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') return;
      var rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (fits(rect) || intentionalScroller(el)) return;
      var past = rect.right > hostRect.right + TOLERANCE
        ? { side: 'right', px: Math.round(rect.right - hostRect.right) }
        : { side: 'left', px: Math.round(hostRect.left - rect.left) };
      flagged.push({ el: el, past: past });
    });
    var outermost = flagged.find(function (f) {
      return !flagged.some(function (g) { return g !== f && g.el.contains(f.el); });
    });
    if (!outermost) return null;
    return { description: describe(outermost.el), side: outermost.past.side, px: outermost.past.px };
  }

  // Marks every occurrence of phrase in the shadow root for the CSS Highlight API (quote.js finds them). Null clears.
  function mark(phrase) {
    if (phrase === null) {
      CSS.highlights.delete('margent-quote');
      return;
    }
    CSS.highlights.set('margent-quote', new Highlight(...MargentQuote.find(state.root, phrase)));
  }

  // Theme tokens: the first message renders, later ones refresh the sheet and run the onTheme callbacks.
  function onTokens(msg) {
    document.documentElement.style.colorScheme = msg.colorScheme;
    if (!state.started) {
      state.started = true;
      start(msg.tokens);
      return;
    }
    state.tokens = msg.tokens;
    state.sheet.replaceSync(MargentKit.baseCss(msg.tokens));
    state.callbacks.forEach(function (cb) {
      try {
        cb(msg.tokens);
      } catch (e) {
        reportLater(e);
      }
    });
  }

  function start(tokens) {
    state.tokens = tokens;
    var host = document.createElement('div');
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: 'open' });
    state.host = host;
    state.root = root;
    state.sheet = new CSSStyleSheet();
    state.sheet.replaceSync(MargentKit.baseCss(tokens));
    var highlight = new CSSStyleSheet();
    highlight.replaceSync(HIGHLIGHT_CSS);
    root.adoptedStyleSheets = [state.sheet, highlight];
    root.addEventListener('click', onClick);

    renderIsland();

    // The exact height, fractions included: rounding up would push everything below the island down by up to 1px.
    var postHeight = function () { post({ type: 'height', px: host.getBoundingClientRect().height }); };
    new ResizeObserver(postHeight).observe(host);
    // Chrome throttles rendering in an off-screen cross-origin frame, so the ResizeObserver stays silent until the island
    // scrolls into view. Fonts usually finish loading in that window and change the height, and font events still run.
    document.fonts.addEventListener('loadingdone', postHeight);
    document.fonts.ready.then(postHeight);

    window.addEventListener('error', function (e) {
      // A ResizeObserver loop notice is the browser's, not the island's.
      if (/^ResizeObserver loop/.test(e.message)) return;
      reportLater(e.error || new Error(e.message));
    });
    window.addEventListener('unhandledrejection', function (e) {
      reportLater(e.reason instanceof Error ? e.reason : new Error(String(e.reason)));
    });
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window.parent) return;
    var msg = ev.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'tokens') onTokens(msg);
    else if (msg.type === 'mark') mark(msg.phrase);
    else if (msg.type === 'measure') post({ type: 'overflow', id: msg.id, overflow: overflowOf() });
    else if (msg.type === 'find') {
      // null when the guest has not started (no shadow root yet): the host reads that as "no island to search".
      post({ type: 'found', id: msg.id, count: state.root ? MargentQuote.find(state.root, msg.phrase).length : null });
    }
  });

  // Selections: the text inside the island and its rect in frame coordinates, on pointerup.
  document.addEventListener('pointerup', function () {
    var sel = state.root && state.root.getSelection ? state.root.getSelection() : document.getSelection();
    var text = sel && sel.rangeCount > 0 ? sel.toString() : '';
    if (!text) {
      post({ type: 'selection', text: '', rect: null });
      return;
    }
    var r = sel.getRangeAt(0).getBoundingClientRect();
    post({
      type: 'selection',
      text: text,
      rect: { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height }
    });
  });

  // The page never sees :hover over a sandboxed frame (the hover chain stops at the frame), so the guest says when the
  // pointer enters. The host mirrors it as data-hover, which the edit controls show on, and clears it itself: the frame
  // gets no event when the pointer leaves, while the page gets one as soon as the pointer is over its own content.
  document.documentElement.addEventListener('pointerenter', function () { post({ type: 'hover', inside: true }); });

  post({ type: 'ready' });
})();
