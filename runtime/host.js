// Defines <agent-island>, the page side of each island (M5 spec R3). Each island runs in its own sandboxed srcdoc frame,
// built here from the island's data and module, and talks to the page only through postMessage (guest.js is the other
// end). Loaded after kit.js. Exposes window.margentIslands for `check` and the edit runtime.
(function () {
  'use strict';

  var STATE_WAIT_MS = 10000;
  var MEASURE_WAIT_MS = 5000;
  var GUEST_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src data:";
  var ALLOWED_LINKS = ['http:', 'https:', 'mailto:'];

  var islands = [];   // one record per <agent-island>, in document order
  var byEl = new Map();
  var measureSeq = 0;
  var storageWarned = false;

  function messageOf(e) {
    return e && typeof e.message === 'string' ? e.message : String(e);
  }

  function findSource(name) {
    var scripts = document.querySelectorAll('script.island-module');
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].getAttribute('data-name') === name) return scripts[i];
    }
    return null;
  }

  // The page's color scheme, as theme.js decides it: the data-theme attribute, else the system scheme.
  function colorScheme() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr === 'dark' ? 'dark' : 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Escapes a value for a double-quoted attribute.
  function attr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  // The frame's document (M5 R3.2): its own policy, the page's font link, the island's data and module, then the kit,
  // quote and guest runtime exactly as the page carries them (the page's policy lists their hashes). "<" is escaped in
  // the JSON, so the module text cannot close its element.
  function srcdocFor(name, path, kind, payload, module) {
    var kitEl = document.getElementById('margent-guest-kit');
    var quoteEl = document.getElementById('margent-guest-quote');
    var guestEl = document.getElementById('margent-guest-runtime');
    if (!kitEl || !quoteEl || !guestEl) {
      throw new Error('the page has no guest runtime (#margent-guest-kit, #margent-guest-quote, #margent-guest-runtime)');
    }
    var fonts = document.querySelector('link[rel="stylesheet"][href^="https://fonts.googleapis.com/"]');
    if (!fonts) throw new Error('the page has no Google Fonts stylesheet link for island frames');
    var json = JSON.stringify({ name: name, path: path, kind: kind, data: payload.data, rowLines: payload.rowLines, module: module })
      .replace(/</g, '\\u003c');
    // The frame takes the page's language and text-size-adjust, so its lines break and its fonts fall back as the page's do.
    var lang = document.documentElement.getAttribute('lang') || '';
    return '<!doctype html><html' + (lang ? ' lang="' + attr(lang) + '"' : '') + '><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="' + attr(GUEST_POLICY) + '">' +
      '<link rel="stylesheet" href="' + attr(fonts.getAttribute('href')) + '">' +
      '<style>html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; } html, body { margin: 0; background: transparent; overflow: hidden; }</style>' +
      '</head><body>' +
      '<script type="application/json" id="margent-island">' + json + '<\/script>' +
      '<script>' + kitEl.textContent + '<\/script>' +
      '<script>' + quoteEl.textContent + '<\/script>' +
      '<script>' + guestEl.textContent + '<\/script>' +
      '</body></html>';
  }

  // Remembered island heights live in sessionStorage, so a reload starts each frame at its last height (no layout shift).
  // Storage can be blocked: the first failure says so once, and the island then starts at 0 as before.
  function storageFailed(e) {
    if (storageWarned) return;
    storageWarned = true;
    console.warn('margent: island heights could not be remembered (' + messageOf(e) + ').');
  }

  function rememberedHeight(key) {
    try {
      var px = Number(sessionStorage.getItem(key));
      return px > 0 ? px : 0;
    } catch (e) {
      storageFailed(e);
      return 0;
    }
  }

  function rememberHeight(key, px) {
    try {
      sessionStorage.setItem(key, String(px));
    } catch (e) {
      storageFailed(e);
    }
  }

  // The error box shows in the page when the frame cannot exist or has failed (R3.5), and the state says so.
  function failIsland(isl, err) {
    isl.failed = true;
    isl.el.removeAttribute('data-reserved');
    MargentKit.showError(isl.mount, isl.name, err);
    isl.el.setAttribute('data-state', 'error');
    isl.el.setAttribute('data-error', messageOf(err));
  }

  function sendTokens(isl) {
    try {
      isl.frame.contentWindow.postMessage({
        type: 'tokens',
        tokens: MargentKit.currentTokens(),
        colorScheme: colorScheme()
      }, '*');
    } catch (e) {
      failIsland(isl, e);
    }
  }

  // The mismatch badge (R3.1): one line per cell, text set with textContent so cell text stays escaped.
  function setBadge(el, mismatches) {
    var old = el.querySelector(':scope > .island-badge');
    if (old) old.remove();
    if (mismatches.length === 0) return;
    var badge = document.createElement('div');
    badge.className = 'island-badge';
    var title = document.createElement('div');
    title.textContent = mismatches.length === 1
      ? '1 cell does not match its column pattern, so the visual may leave it out:'
      : mismatches.length + ' cells do not match their column patterns, so the visual may leave them out:';
    var list = document.createElement('ul');
    mismatches.forEach(function (m) {
      var item = document.createElement('li');
      item.textContent = 'row ' + (m.row + 1) + ', ' + m.column + ': "' + m.text + '"';
      list.appendChild(item);
    });
    badge.append(title, list);
    el.insertBefore(badge, el.querySelector(':scope > .island-mount'));
  }

  function setAttr(el, name, value) {
    if (value === null || value === undefined) el.removeAttribute(name);
    else el.setAttribute(name, value);
  }

  function onState(isl, msg) {
    var mismatches = msg.mismatches || [];
    isl.el.setAttribute('data-state', msg.state);
    isl.el.removeAttribute('data-reserved');
    setAttr(isl.el, 'data-error', msg.error);
    setAttr(isl.el, 'data-mismatches', mismatches.length > 0 ? JSON.stringify(mismatches) : null);
    setBadge(isl.el, mismatches);
  }

  function onHeight(isl, px) {
    isl.frame.style.height = px + 'px';
    rememberHeight(isl.heightKey, px);
  }

  // Links open in a new tab with noopener, and only for the schemes in ALLOWED_LINKS. Anything else is refused.
  function onOpen(url) {
    var parsed;
    try {
      parsed = new URL(String(url));
    } catch (e) {
      return;
    }
    if (ALLOWED_LINKS.indexOf(parsed.protocol) < 0) return;
    window.open(parsed.href, '_blank', 'noopener');
  }

  // The selection event (R6 consumes it): text and rect in page viewport coordinates, or an empty selection.
  function onSelection(isl, msg) {
    var rect = null;
    if (msg.rect) {
      var f = isl.frame.getBoundingClientRect();
      rect = {
        left: msg.rect.left + f.left,
        top: msg.rect.top + f.top,
        right: msg.rect.right + f.left,
        bottom: msg.rect.bottom + f.top,
        width: msg.rect.width,
        height: msg.rect.height
      };
    }
    isl.el.dispatchEvent(new CustomEvent('margent:island-selection', {
      bubbles: true,
      detail: { text: msg.text, rect: rect }
    }));
  }

  // The pointer is over the page's own content, so it left every island frame (see 'hover' below).
  document.addEventListener('pointerover', function (ev) {
    islands.forEach(function (i) {
      if (ev.target !== i.frame) i.el.removeAttribute('data-hover');
    });
  });

  // One listener for every frame. A message counts only when it comes from an island's own frame.
  window.addEventListener('message', function (ev) {
    if (!ev.source) return;
    var isl = islands.find(function (i) { return i.frame && i.frame.contentWindow === ev.source; });
    if (!isl || isl.failed) return;
    var msg = ev.data;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'ready':
        isl.ready = true;
        sendTokens(isl);
        break;
      case 'state':
        onState(isl, msg);
        break;
      case 'height':
        onHeight(isl, msg.px);
        break;
      case 'open':
        onOpen(msg.url);
        break;
      case 'overflow':
        if (isl.measures[msg.id]) {
          isl.measures[msg.id](msg.overflow);
        }
        break;
      case 'found':
        if (isl.finds[msg.id]) {
          isl.finds[msg.id](msg.count);
        }
        break;
      case 'selection':
        onSelection(isl, msg);
        break;
      case 'hover':
        if (msg.inside === true) isl.el.setAttribute('data-hover', '');
        break;
    }
  });

  // Defines <agent-island>. The frame is built on connect; a failure before it exists shows in the page.
  class AgentIsland extends HTMLElement {
    connectedCallback() {
      if (this._started) return;
      this._started = true;
      var name = this.getAttribute('name') || '';
      var mount = document.createElement('div');
      mount.className = 'island-mount';
      this.appendChild(mount);
      var isl = { el: this, name: name, mount: mount, frame: null, ready: false, failed: false, measures: {}, finds: {} };
      // Per page path, island position, name and width: the same island at the same width reads the same height back.
      isl.heightKey = 'margent-island-height:' + location.pathname + ':' + islands.length + ':' + name + ':' +
        Math.round(this.getBoundingClientRect().width);
      islands.push(isl);
      byEl.set(this, isl);
      var startHeight = rememberedHeight(isl.heightKey);
      try {
        var dataEl = this.querySelector(':scope > script.island-data');
        if (!dataEl) throw new Error('no island data element inside island "' + name + '"');
        var payload = JSON.parse(dataEl.textContent);
        var srcEl = findSource(name);
        if (!srcEl) throw new Error('no module source for island "' + name + '" in the page');
        var frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.setAttribute('title', name);
        frame.style.cssText = 'display:block;width:100%;border:0;height:' + startHeight + 'px';
        // A remembered height reserves the box: the JS-off fallback stays hidden until the state says otherwise.
        // A guest that never reports must not leave a blank reserved box: after the state wait, the island falls back as before.
        if (startHeight > 0) {
          var el = this;
          this.setAttribute('data-reserved', '');
          setTimeout(function () {
            if (!el.hasAttribute('data-reserved')) return;
            el.removeAttribute('data-reserved');
            frame.style.height = '0px';
          }, STATE_WAIT_MS);
        }
        frame.srcdoc = srcdocFor(name, srcEl.getAttribute('data-path'), this.getAttribute('data-kind'), payload, srcEl.textContent);
        isl.frame = frame;
        mount.appendChild(frame);
      } catch (e) {
        failIsland(isl, e);
      }
    }
  }
  customElements.define('agent-island', AgentIsland);

  // Theme changes reach every guest that has said it is ready. A guest that is not ready gets tokens on ready.
  MargentKit.watchTheme(function () {
    islands.forEach(function (isl) {
      if (isl.ready && !isl.failed) sendTokens(isl);
    });
  });

  function waitUntil(pred, ms) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function tick() {
        if (pred() || Date.now() - t0 >= ms) return resolve();
        setTimeout(tick, 20);
      })();
    });
  }

  function nextFrames(n) {
    return new Promise(function (resolve) {
      (function step(k) {
        if (k === 0) return resolve();
        requestAnimationFrame(function () { step(k - 1); });
      })(n);
    });
  }

  // Asks one rendered guest for its overflow. A guest that does not answer in time is an error, not a clean island.
  function measure(isl) {
    return new Promise(function (resolve, reject) {
      var id = String(++measureSeq);
      var timer = setTimeout(function () {
        delete isl.measures[id];
        reject(new Error('island ' + isl.name + ': no overflow reply within ' + MEASURE_WAIT_MS / 1000 + 's'));
      }, MEASURE_WAIT_MS);
      isl.measures[id] = function (overflow) {
        clearTimeout(timer);
        delete isl.measures[id];
        resolve(overflow);
      };
      isl.frame.contentWindow.postMessage({ type: 'measure', id: id }, '*');
    });
  }

  // Asks one rendered guest how many times a phrase occurs in it. A null count means the guest had no island to search.
  function find(isl, phrase) {
    return new Promise(function (resolve, reject) {
      var id = String(++measureSeq);
      var timer = setTimeout(function () {
        delete isl.finds[id];
        reject(new Error('island ' + isl.name + ': no find reply within ' + MEASURE_WAIT_MS / 1000 + 's'));
      }, MEASURE_WAIT_MS);
      isl.finds[id] = function (count) {
        clearTimeout(timer);
        delete isl.finds[id];
        resolve(count);
      };
      isl.frame.contentWindow.postMessage({ type: 'find', id: id, phrase: phrase }, '*');
    });
  }

  // Every island's state and overflow, in document order. Waits (bounded) for every island to report a state, then
  // measures the rendered ones at the frame's current width. An island that never reports has state null.
  function report() {
    var els = [...document.querySelectorAll('agent-island')];
    return waitUntil(function () {
      return els.every(function (el) { return el.hasAttribute('data-state'); });
    }, STATE_WAIT_MS)
      .then(function () { return nextFrames(2); })
      .then(function () {
        return Promise.all(els.map(function (el) {
          var isl = byEl.get(el);
          if (el.getAttribute('data-state') !== 'rendered') return null;
          return measure(isl);
        }));
      })
      .then(function (overflows) {
        return els.map(function (el, i) {
          var overflow = overflows[i];
          setAttr(el, 'data-overflow', overflow ? JSON.stringify(overflow) : null);
          var mismatches = el.getAttribute('data-mismatches');
          return {
            name: el.getAttribute('name'),
            state: el.getAttribute('data-state'),
            error: el.getAttribute('data-error'),
            mismatches: mismatches ? JSON.parse(mismatches) : [],
            overflow: overflow || null
          };
        });
      });
  }

  // Marks the quoted phrase inside one island (R6). A null phrase clears the marks.
  function mark(el, phrase) {
    var isl = byEl.get(el);
    if (!isl) throw new Error('margentIslands.mark: the element is not an <agent-island> of this page');
    if (!isl.frame) throw new Error('island ' + isl.name + ': it has no frame to mark');
    isl.frame.contentWindow.postMessage({ type: 'mark', phrase: phrase === undefined ? null : phrase }, '*');
  }

  // Counts the occurrences of a phrase inside one rendered island (the quote check of the comment rail). Resolves to the
  // count, or to null when the island has not rendered.
  function findIn(el, phrase) {
    var isl = byEl.get(el);
    if (!isl) throw new Error('margentIslands.find: the element is not an <agent-island> of this page');
    if (!isl.frame) throw new Error('island ' + isl.name + ': it has no frame to search');
    return find(isl, phrase);
  }

  window.margentIslands = { report: report, mark: mark, find: findIn };
})();
