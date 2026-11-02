// Home and End in the editor's fields (spec P1). On macOS, Chrome follows the Cocoa convention: Home and End scroll the
// page instead of moving the caret, so a comment field's Home sends the reader to the top of the document. The keys here
// move the caret as a native text editor does, and keep the page still. Other platforms keep the browser's keys.

// The Cocoa behavior is macOS only, so the keys below are too. The comment shortcut (comments.js) uses it as well.
export const IS_MAC = /Mac/.test(navigator.platform);

// Handles Home and End for the focused field (a textarea, or a block being edited). Returns true when it handled the
// event, after preventing the browser's own key, so the caller stops there.
export function lineKeys(e) {
  if (!IS_MAC || (e.key !== 'Home' && e.key !== 'End') || e.altKey || e.isComposing) return false;
  const home = e.key === 'Home';
  const t = e.target;
  if (t instanceof HTMLTextAreaElement) {
    moveInTextarea(t, home, e.shiftKey, e.metaKey);
  } else if (t instanceof Element && t.closest('[contenteditable="true"]')) {
    // Selection.modify moves the caret by the same rules as the native keys: a line, or the whole block with Cmd.
    getSelection().modify(
      e.shiftKey ? 'extend' : 'move',
      home ? 'backward' : 'forward',
      e.metaKey ? 'documentboundary' : 'lineboundary'
    );
  } else {
    return false;
  }
  e.preventDefault();
  return true;
}

// Moves a textarea's caret to the start or end of its line (the text between two newlines), or of the whole field with
// Cmd. With Shift the selection grows from its anchor, the end that did not move, so the selection's direction is kept.
function moveInTextarea(el, home, shift, whole) {
  const value = el.value;
  // The end that moves is the focus: the selection's end, or its start when the selection runs backward.
  const backward = el.selectionDirection === 'backward';
  const focus = backward ? el.selectionStart : el.selectionEnd;
  const anchor = backward ? el.selectionEnd : el.selectionStart;
  let target;
  if (whole) {
    target = home ? 0 : value.length;
  } else if (home) {
    target = focus === 0 ? 0 : value.lastIndexOf('\n', focus - 1) + 1;
  } else {
    const newline = value.indexOf('\n', focus);
    target = newline === -1 ? value.length : newline;
  }
  if (!shift) {
    el.setSelectionRange(target, target);
    return;
  }
  el.setSelectionRange(Math.min(anchor, target), Math.max(anchor, target), target < anchor ? 'backward' : 'forward');
}
