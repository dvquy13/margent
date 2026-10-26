// Quoted phrases (decision 0023), shared by every place that stores or finds one: the edit runtime stores a quote
// (`store`, which it calls from quoteOf), and the page and the island guest find it in a block (`find`). One classic
// script, loaded in the page before comments.js, and copied into each island frame before guest.js. Plain browser
// script: no imports, no network, and nothing touches the DOM at load time.
var MargentQuote = (function () {
  'use strict';

  // The phrase a block comment quotes: whitespace collapsed and trimmed, each " as '.
  function store(text) {
    return text.replace(/\s+/g, ' ').trim().replaceAll('"', "'");
  }

  // Every match of phrase in root's text, as a Range each. Whitespace is ignored on both sides: a quote taken from a
  // selection across elements has a space or line break where the text nodes have none ("are out HN" against "are
  // out" + "HN"), and one taken before 2026-10-24 has none at block boundaries ("gate.Spread"). A quote stores ' for
  // each " of the page (store above), so " is read as ' on both sides. A match may run across text nodes (two list
  // items, or text around bold). Matches do not overlap: the search resumes after each match.
  function find(root, phrase) {
    var needle = String(phrase).replace(/\s+/g, '').replaceAll('"', "'");
    if (needle === '') return [];
    // Each non-space character of the root's text, with its text node and offset in that node. The text of a style or
    // script element is not page text: an island may render one into its shadow root.
    var chars = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        return p && (p.tagName === 'STYLE' || p.tagName === 'SCRIPT') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    for (var node = walker.nextNode(); node; node = walker.nextNode()) {
      var value = node.nodeValue;
      for (var i = 0; i < value.length; i++) {
        if (!/\s/.test(value[i])) chars.push({ node: node, i: i, c: value[i].replace('"', "'") });
      }
    }
    var squeezed = chars.map(function (x) { return x.c; }).join('');
    var ranges = [];
    for (var at = squeezed.indexOf(needle); at >= 0; at = squeezed.indexOf(needle, at + needle.length)) {
      var first = chars[at];
      var last = chars[at + needle.length - 1];
      var range = document.createRange();
      range.setStart(first.node, first.i);
      range.setEnd(last.node, last.i + 1);
      ranges.push(range);
    }
    return ranges;
  }

  return { store: store, find: find };
})();
