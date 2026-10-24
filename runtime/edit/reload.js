// Live reload (spec R7.2 to R7.4). The page holds an SSE stream for its own .md. A `changed` event reloads the page,
// keeping the scroll position, unless the page holds unsaved text: then the reload waits, under a banner, until the
// text is saved (and refused as stale) or cancelled. A 409 keeps the text across the reload in sessionStorage, and the
// reloaded page reopens the panel with it.
// Sets margent.reload() (reload now, or hold it while dirty()), margent.idle() (run a held reload once the text is
// settled) and margent.stale(range, text). While dirty() a beforeunload guard asks before any other navigation, so a
// link or a closed tab cannot discard unsaved text. The page's own reloads skip the guard (`leaving`).

const EVENT_PANEL = 'margent:panel';

const CHANGED_TEXT =
  'This file changed on disk. Saving your edit now will be refused as stale. Cancel the edit to reload the file.';
const CONNECTION_TEXT = 'Live reload lost its connection, so this page will not update until it reconnects.';
const CONNECTION_CLOSED_TEXT = 'Live reload stopped, so this page will not update. Reload the page once margent serve is running.';

export function initReload(margent) {
  const { state } = margent;
  const scrollKey = `margent:scroll:${state.path}`;
  const staleKey = `margent:stale:${state.path}`;
  let held = false;

  // Banners sit under the header, or inside the panel while it is open, so they never hide the text being edited.
  const host = document.createElement('div');
  host.className = 'edit-banners';
  host.hidden = true;
  const banners = new Map();

  function place() {
    const panel = document.querySelector('.edit-panel');
    const inPanel = panel !== null && !panel.hidden;
    host.classList.toggle('edit-banners--page', !inPanel);
    if (inPanel) {
      const title = panel.querySelector('.edit-panel-title');
      if (host.parentNode !== panel) title.after(host);
    } else if (host.parentNode !== document.body) {
      document.body.append(host);
    }
  }

  function setBanner(kind, message) {
    const el = banners.get(kind);
    if (message === null) {
      if (el) {
        el.remove();
        banners.delete(kind);
      }
    } else {
      let node = el;
      if (!node) {
        node = document.createElement('p');
        node.className = 'edit-banner';
        node.dataset.kind = kind;
        node.setAttribute('role', kind === 'changed' ? 'status' : 'alert');
        banners.set(kind, node);
      }
      node.textContent = message;
      host.append(node);
    }
    host.hidden = banners.size === 0;
    place();
  }

  document.addEventListener(EVENT_PANEL, place);

  // The page's own navigation. A reload keeps the scroll position; storage can be blocked, and then the reload goes to
  // the top, with a warning. `leaving` tells the beforeunload guard that this navigation is ours.
  let leaving = false;
  function reloadNow() {
    try {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    } catch (err) {
      console.warn(`margent: the scroll position was not saved (${err.message}), so the reload goes to the top.`);
    }
    leaving = true;
    location.reload();
  }

  // Reload now, or hold it while text is unsaved, so a save that finishes while another block is being typed in cannot
  // discard that text (R7.3). idle() runs the held reload.
  function requestReload() {
    if (leaving) return;
    if (margent.dirty()) {
      held = true;
      setBanner('changed', CHANGED_TEXT);
      return;
    }
    reloadNow();
  }
  margent.reload = requestReload;

  margent.idle = () => {
    if (!held || margent.dirty()) return;
    held = false;
    setBanner('changed', null);
    reloadNow();
  };

  // R7.4: the text is kept in sessionStorage across the reload. If storage is blocked the reload would lose it, so the
  // reload is refused and the panel says so. The panel is open here by design, so this reload is not held.
  margent.stale = (range, text) => {
    try {
      sessionStorage.setItem(staleKey, JSON.stringify({ range, text }));
    } catch (err) {
      const message = `Your unsaved text could not be kept across a reload (${err.message}), so the page was not reloaded. Copy your text before you reload.`;
      console.error(`margent: ${message}`);
      setBanner('error', message);
      return;
    }
    reloadNow();
  };

  // A navigation away (a link, a closed tab) asks first while text is unsaved. Our own reloads are not blocked.
  window.addEventListener('beforeunload', (e) => {
    if (leaving || !margent.dirty()) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // Restore the scroll position, then once more when the page has loaded (islands and figures can change its height).
  let restoreY = null;
  try {
    restoreY = sessionStorage.getItem(scrollKey);
    sessionStorage.removeItem(scrollKey);
  } catch (err) {
    console.warn(`margent: the saved scroll position could not be read (${err.message}).`);
  }
  if (restoreY !== null) {
    window.scrollTo(0, Number(restoreY));
    window.addEventListener('load', () => window.scrollTo(0, Number(restoreY)), { once: true });
  }

  // The reopened panel holds the text from a 409 (R7.4). Removed only once the panel opened with it.
  let kept = null;
  try {
    kept = sessionStorage.getItem(staleKey);
  } catch (err) {
    throw new Error(`margent: could not read the unsaved text kept across the reload (${err.message})`, { cause: err });
  }
  if (kept !== null) {
    const { range, text } = JSON.parse(kept);
    const start = Number(range.split('-')[0]);
    const end = Number(range.split('-')[1]);
    margent.openPanel(range, {
      text,
      notice: `The file changed on disk. Your text will replace lines ${start}–${end} of the current file.`,
    });
    sessionStorage.removeItem(staleKey);
  }

  // The server skips a change this page already shows (its own save), so it needs the hash the page was rendered from.
  const es = new EventSource(`/_events?path=${encodeURIComponent(state.path)}&hash=${state.hash}`);
  es.addEventListener('open', () => setBanner('connection', null));
  // Through margent.reload, the one reload entry point, so a stub of it (the edit corpus) also covers this event.
  es.addEventListener('changed', () => margent.reload());
  // EventSource retries by itself. Each failure is shown and logged, and the banner clears when the stream reopens.
  es.addEventListener('error', () => {
    const closed = es.readyState === EventSource.CLOSED;
    console.error(`margent: the live reload stream for ${state.path} is ${closed ? 'closed for good' : 'retrying'}`);
    setBanner('connection', closed ? CONNECTION_CLOSED_TEXT : CONNECTION_TEXT);
  });
}
