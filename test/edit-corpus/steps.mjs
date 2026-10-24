// Runs the corpus step vocabulary (see README.md) on a served page with real mouse and keyboard input. Text is located
// in the page with a DOM Range, only to read coordinates: the DOM is never changed by a step.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

export const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
const BLANK_AREA = { x: 990, y: 880 };

// Finds the first visible occurrence of `text` in the target's text (a page, or an island's frame), scrolls it into view,
// and returns the viewport rects of its first character, its last character and its middle character. Throws when the
// text is absent (or returns null with missing 'null', so a caller can try the next frame), or visible more than once,
// so a case never clicks an occurrence it did not mean. With `panel`, also tags the block's edit control and the block
// for hovering (data-probe attributes), returning their ids. The text of an open shadow root counts, and an island's
// light DOM (its data and source) does not: an island draws its text in its frame, so a page only finds it there.
async function locate(target, text, { panel = false, nth = null, tagBlock = false, missing = 'throw' } = {}) {
  return target.evaluate(
    ({ text, panel, nth, tagBlock, missing }) => {
      document.querySelectorAll('[data-probe]').forEach((e) => e.removeAttribute('data-probe'));
      const nodes = [];
      let full = '';
      // Collects the text nodes of a root in document order, entering each open shadow root it meets.
      const collect = (root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => {
            if (n.nodeType === Node.ELEMENT_NODE) {
              if (n.localName === 'agent-island') return NodeFilter.FILTER_REJECT;
              if (n.shadowRoot) collect(n.shadowRoot);
              return NodeFilter.FILTER_SKIP;
            }
            // A text node directly in a shadow root has no parent element.
            return n.parentElement?.closest('script, style, agent-island, .c-rail') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          },
        });
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          nodes.push({ node: n, start: full.length });
          full += n.data;
        }
      };
      collect(document.body);
      const at = (offset) => {
        let i = nodes.length - 1;
        while (nodes[i].start > offset) i--;
        return { node: nodes[i].node, offset: offset - nodes[i].start };
      };
      const charRange = (a) => {
        const r = document.createRange();
        r.setStart(a.node, a.offset);
        r.setEnd(a.node, a.offset + 1);
        return r;
      };
      const hits = [];
      for (let i = full.indexOf(text); i !== -1; i = full.indexOf(text, i + 1)) {
        // A block comment line is hidden under the rail, and its note is in its card, so its text counts as the block's
        // (as it did when the note sat under its block). The block is then the line, whose thread has the Reply.
        const a = at(i);
        const drawn = [...charRange(a).getClientRects()].some((r) => r.width > 0 && r.height > 0);
        if (drawn || a.node.parentElement.closest('p.c-line')) hits.push(i);
      }
      if (hits.length === 0) {
        if (missing === 'null') return null;
        throw new Error(`text ${JSON.stringify(text)} is not visible on the page`);
      }
      if (nth === null && hits.length > 1) throw new Error(`text ${JSON.stringify(text)} is visible ${hits.length} times: make it unique or give nth`);
      if (nth !== null && (nth < 1 || nth > hits.length)) throw new Error(`text ${JSON.stringify(text)} has ${hits.length} visible occurrences, not ${nth}`);
      const i = hits[nth === null ? 0 : nth - 1];
      const first = at(i);
      const last = at(i + text.length - 1);
      const mid = at(i + Math.floor(text.length / 2));
      first.node.parentElement.scrollIntoView({ block: 'center' });
      const rect = (a) => {
        const b = charRange(a).getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
      };
      const out = { first: rect(first), last: rect(last), mid: rect(mid) };
      if (tagBlock) {
        let el = first.node.parentElement.closest('[data-src]');
        if (!el) throw new Error(`text ${JSON.stringify(text)} is not inside a block`);
        for (let up = el.parentElement?.closest('[data-src]'); up; up = el.parentElement?.closest('[data-src]')) el = up;
        el.setAttribute('data-probe', 'block');
        el.scrollIntoView({ block: 'center' });
      }
      if (panel) {
        const block = first.node.parentElement.closest('[data-src]');
        if (!block) throw new Error(`text ${JSON.stringify(text)} is not inside a block`);
        const ctrl = block.lastElementChild;
        if (!ctrl || !ctrl.classList.contains('edit-control')) throw new Error(`block ${block.dataset.src} has no edit control`);
        block.setAttribute('data-probe', 'block');
        ctrl.setAttribute('data-probe', 'control');
        block.scrollIntoView({ block: 'center' });
      }
      return out;
    },
    { text, panel, nth, tagBlock, missing }
  );
}

const center = (r) => (r.top + r.bottom) / 2;

async function clickAt(page, step) {
  const r = await locate(page, step.text, { nth: step.nth ?? null });
  const at = step.at ?? 'start';
  const p = at === 'end' ? { x: r.last.right - 1, y: center(r.last) }
    : at === 'middle' ? { x: r.mid.left + 1, y: center(r.mid) }
    : at === 'start' ? { x: r.first.left + 1, y: center(r.first) }
    : null;
  if (!p) throw new Error(`click.at must be start, end or middle, got ${JSON.stringify(at)}`);
  await page.mouse.click(p.x, p.y);
}

// Finds the text in the frame of an island (each island in document order), scrolls that island into view, and returns
// the rects in page coordinates: the frame's box plus the text's box inside it. The mouse then drags in the page, as a
// reader's would. Throws when no island's frame has the text.
async function locateInIsland(page, text, nth) {
  for (const handle of await page.locator('agent-island iframe').elementHandles()) {
    const frame = await handle.contentFrame();
    if (!frame) throw new Error('an island frame has no document to search');
    await handle.scrollIntoViewIfNeeded();
    const inner = await locate(frame, text, { nth, missing: 'null' });
    if (inner === null) continue;
    // A press sent right after the scroll can land on the page under the frame's old place: two frames let the frame settle.
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    const box = await handle.boundingBox();
    if (!box) throw new Error(`the frame of the island holding ${JSON.stringify(text)} has no box on the page`);
    const moved = (r) => ({ left: r.left + box.x, right: r.right + box.x, top: r.top + box.y, bottom: r.bottom + box.y });
    return { first: moved(inner.first), last: moved(inner.last), mid: moved(inner.mid) };
  }
  throw new Error(`text ${JSON.stringify(text)} is not visible in any island`);
}

async function selectText(page, step) {
  if (step.island !== undefined && typeof step.island !== 'boolean') throw new Error(`select.island must be true or false, got ${JSON.stringify(step.island)}`);
  const nth = step.nth ?? null;
  const r = step.island === true ? await locateInIsland(page, step.text, nth) : await locate(page, step.text, { nth });
  await page.mouse.move(r.first.left + 1, center(r.first));
  await page.mouse.down();
  await page.mouse.move(r.last.right - 1, center(r.last), { steps: 5 });
  await page.mouse.up();
}

// A real paste: a ClipboardEvent on the focused element, carrying both types the way a browser copy does.
async function paste(page, { html, text }) {
  await page.evaluate(({ html, text }) => {
    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', text);
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { html, text });
}

// Opens the side panel on a block (by a text it contains, or by its range) or on the frontmatter, through the block's
// edit control, after hovering the block as a user would.
async function openPanel(page, spec) {
  if (spec === 'frontmatter') {
    await page.evaluate(() => {
      document.querySelectorAll('[data-probe]').forEach((e) => e.removeAttribute('data-probe'));
      const ctrl = [...document.querySelectorAll('button.edit-control')].find((b) => !b.closest('[data-src]'));
      if (!ctrl) throw new Error('the frontmatter has no edit control');
      ctrl.setAttribute('data-probe', 'control');
      ctrl.scrollIntoView({ block: 'center' });
    });
  } else if (spec.range) {
    await page.evaluate((range) => {
      document.querySelectorAll('[data-probe]').forEach((e) => e.removeAttribute('data-probe'));
      const block = document.querySelector(`[data-src="${range}"]`);
      if (!block) throw new Error(`no block with range ${range}`);
      const ctrl = block.lastElementChild;
      if (!ctrl || !ctrl.classList.contains('edit-control')) throw new Error(`block ${range} has no edit control`);
      block.setAttribute('data-probe', 'block');
      ctrl.setAttribute('data-probe', 'control');
      block.scrollIntoView({ block: 'center' });
    }, spec.range);
  } else {
    await locate(page, spec.text, { panel: true });
  }
  const block = page.locator('[data-probe="block"]');
  if (await block.count()) {
    const box = await block.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  }
  await page.locator('[data-probe="control"]').click();
  await page.waitForSelector('.edit-panel:not([hidden]) textarea');
}

const CONTROLS = {
  Comment: '.comment-control',
  Reply: '.comment-reply',
  Resolve: '.comment-resolve',
  Edit: '.comment-edit',
  Save: '.comment-save',
  Cancel: '.comment-cancel',
};

// Clicks a comment control with a real mouse click. Without near or range, `Comment` is the floating control at the
// selection. With near (a text in the block) or range (the block's lines, e.g. "13-23"), the control is one of the block's:
// its Comment control, or the Reply, Resolve or Edit of its thread (Save and Cancel are a draft's, in its card). The block is hovered first, as a user would. nth picks
// among that block's controls with that label (1-based).
async function clickControl(page, { label, near = null, range = null, nth = null }) {
  if (!Object.hasOwn(CONTROLS, label)) throw new Error(`control.label must be Comment, Reply, Resolve, Edit, Save or Cancel, got ${JSON.stringify(label)}`);
  if (near === null && range === null) {
    if (label !== 'Comment') throw new Error(`control ${label} needs near or range, to find the block of its thread`);
    await page.locator('.comment-tool:not([hidden])').click();
    return;
  }
  if (near !== null) {
    await locate(page, near, { tagBlock: true });
    const gated = await page.evaluate(() => document.querySelector('[data-probe="block"]').getAttribute('data-gate') === 'pass');
    if (gated && label === 'Comment') {
      // A gated block shows its Comment control only while it holds focus (edit.css), so a real click in its text focuses
      // it first. The caret moves and nothing is typed, so the block's source stays as it was.
      await clickAt(page, { text: near, at: 'start' });
      await locate(page, near, { tagBlock: true });
    }
  } else {
    await page.evaluate((r) => {
      document.querySelectorAll('[data-probe]').forEach((e) => e.removeAttribute('data-probe'));
      const block = document.querySelector(`[data-src="${r}"]`);
      if (!block) throw new Error(`no block with range ${r}`);
      block.setAttribute('data-probe', 'block');
      block.scrollIntoView({ block: 'center' });
    }, range);
  }
  // Reply and Resolve are on the card of each thread in the block, in the rail (decision 0023). Below 1100px the rail is
  // a drawer, so it opens first, as a user would open it.
  if (label !== 'Comment') await openRail(page);
  await page.evaluate(({ selector, label, nth }) => {
    document.querySelectorAll('[data-probe="control"]').forEach((e) => e.removeAttribute('data-probe'));
    const block = document.querySelector('[data-probe="block"]');
    let hits;
    if (label === 'Comment') {
      hits = [...block.querySelectorAll(selector)].filter((e) => (e.getAttribute('aria-label') ?? '').startsWith('Comment on '));
    } else {
      const hook = window.margentComments;
      if (!hook) throw new Error(`${label} needs the comment rail, and this page has none`);
      // A card can hold several controls of one label (Edit on each of the owner's notes), so all of them count.
      hits = [...block.querySelectorAll('span.c-thread[data-c]')].flatMap((thread) => [
        ...(hook.cards.get(thread.dataset.c)?.querySelectorAll(selector) ?? []),
      ]);
    }
    const want = nth ?? 1;
    if (hits.length < want) throw new Error(`the block has ${hits.length} ${label} control(s), not ${want}`);
    hits[want - 1].setAttribute('data-probe', 'control');
  }, { selector: CONTROLS[label], label, nth });
  const box = await page.locator('[data-probe="block"]').boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('[data-probe="control"]').click();
}

// Opens the comment rail's drawer when it is closed (below 1100px, where the rail is a drawer behind the Comments button).
async function openRail(page) {
  const toggle = page.locator('.c-toggle');
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

// Changes the served file on disk, as another editor would, so that the next save is stale.
function appendToFile(ctx, value) {
  if (!ctx.served) throw new Error('write needs the served copy');
  if (typeof value?.append !== 'string') throw new Error(`write takes {"append": "text"}, got ${JSON.stringify(value)}`);
  appendFileSync(join(ctx.served.root, ctx.doc), value.append);
}

// Runs one step. Unknown keys fail loudly. ctx: { served, doc } for the steps that touch the file on disk.
export async function runStep(page, step, ctx = {}) {
  const keys = Object.keys(step);
  if (keys.length !== 1) throw new Error(`a step has one key, got ${JSON.stringify(step)}`);
  const [kind] = keys;
  const value = step[kind];
  switch (kind) {
    case 'click': return clickAt(page, value);
    case 'select': return selectText(page, value);
    case 'type': return page.keyboard.type(value);
    case 'press': return page.keyboard.press(value.replaceAll('Meta', MOD));
    case 'paste': return paste(page, value);
    case 'blur':
      if (value !== true) throw new Error('blur takes true');
      return page.mouse.click(BLANK_AREA.x, BLANK_AREA.y);
    case 'panel': return openPanel(page, value);
    case 'control': return clickControl(page, value);
    case 'write': return appendToFile(ctx, value);
    case 'panelSelectAll':
      if (value !== true) throw new Error('panelSelectAll takes true');
      return page.keyboard.press(`${MOD}+a`);
    case 'wait':
      // Waiting for a save is done by the runner after the steps; the step only marks the point in the case.
      if (value !== 'save') throw new Error(`wait takes "save", got ${JSON.stringify(value)}`);
      return;
    default:
      throw new Error(`unknown step ${JSON.stringify(kind)} in ${JSON.stringify(step)}`);
  }
}

// Records every /_save request and its response status on a page.
export function recordSaves(page) {
  const requests = [];
  const statuses = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname === '/_save') requests.push(r.postData());
  });
  page.on('response', (r) => {
    if (new URL(r.url()).pathname === '/_save') statuses.push(r.status());
  });
  return { requests, statuses };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
