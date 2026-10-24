// Shared Playwright helpers for browser tests. Drives the installed Chrome (channel: 'chrome').
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';

// Runs fn(browser) and always closes the browser.
export async function withBrowser(fn) {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

// Opens a page in a fresh context. Collects page errors and console errors (failed resource loads,
// such as the Google Fonts stylesheet when offline, are not errors of the page itself).
// When JavaScript is on, waits until every <agent-island> has a data-state and a box (or an error), and the fonts are ready.
// Returns { page, errors, close }.
export async function openPage(browser, fileOrUrl, {
  javaScriptEnabled = true,
  colorScheme = 'light',
  viewport = { width: 1000, height: 900 }
} = {}) {
  const url = /^[a-z]+:\/\//i.test(fileOrUrl) ? fileOrUrl : pathToFileURL(fileOrUrl).href;
  const context = await browser.newContext({ javaScriptEnabled, colorScheme, viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) {
      errors.push(`console: ${m.text().split('\n')[0]}`);
    }
  });
  await page.goto(url);
  if (javaScriptEnabled) {
    await islandsSettled(page);
    await page.evaluate(() => document.fonts.ready);
  }
  return { page, errors, close: () => context.close() };
}

// Waits until every island has its state and a box (or an error box), then until no island frame's height has changed for
// quietMs. A guest reports its height again when its fonts load (runtime/guest.js), which moves the text below the island,
// and a click measured before that lands elsewhere. A page with no island frames returns at once. Throws, naming the
// deadline, when the heights keep changing: a silent pass there would let the caller measure a moving page.
export async function islandsSettled(page, { quietMs = 300, deadlineMs = 5000 } = {}) {
  // Each frame reports its height right after its state. An island that rendered has a box, and so does its error box.
  await page.waitForFunction(
    () => [...document.querySelectorAll('agent-island')].every((h) => h.hasAttribute('data-state') &&
      (h.getAttribute('data-state') === 'error' || h.getBoundingClientRect().height > 0)),
    null,
    { timeout: 15000 }
  );
  if ((await page.locator('agent-island iframe').count()) === 0) return;
  const started = Date.now();
  let last = null;
  let quietSince = started;
  for (;;) {
    const heights = await page.evaluate(() => [...document.querySelectorAll('agent-island iframe')].map((f) => f.style.height).join('|'));
    if (heights !== last) {
      last = heights;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= quietMs) {
      return;
    }
    if (Date.now() - started > deadlineMs) throw new Error(`island heights still changing after ${deadlineMs} ms (last: ${last})`);
    await new Promise((done) => setTimeout(done, 50));
  }
}

// The srcdoc frame of island i. Its guest's shadow content is read inside this frame (M5 R3).
export async function islandFrame(page, i) {
  const handle = await page.locator('agent-island iframe').nth(i).elementHandle();
  const frame = await handle.contentFrame();
  if (!frame) throw new Error(`island ${i} has no frame`);
  return frame;
}

// The srcdoc frame of the island named `name`, once the page has given that island a state. Read the guest inside it.
export async function islandFrameByName(page, name) {
  await page.waitForFunction(
    (n) => [...document.querySelectorAll('agent-island')].some((h) => h.getAttribute('name') === n && h.hasAttribute('data-state')),
    name,
    { timeout: 5000 }
  );
  const i = await page.evaluate((n) => [...document.querySelectorAll('agent-island')].findIndex((h) => h.getAttribute('name') === n), name);
  return islandFrame(page, i);
}

// Per-island facts. The page side (state, badge, height) is read in the page; the guest side (text, error box, clipping)
// is read inside each island's frame. Height is the <agent-island> box. Clipped lists shadow elements that extend past
// the guest's host box at rest.
export async function islandInfo(page) {
  const pageSide = await page.evaluate(() => [...document.querySelectorAll('agent-island')].map((host) => ({
    name: host.getAttribute('name'),
    state: host.getAttribute('data-state'),
    height: host.getBoundingClientRect().height,
    badge: host.querySelector(':scope > .island-badge')?.textContent ?? null
  })));
  const out = [];
  for (let i = 0; i < pageSide.length; i++) {
    const frame = await islandFrame(page, i);
    const guest = await frame.evaluate(() => {
      const TEXT_SKIP = new Set(['STYLE', 'SCRIPT']);
      const host = [...document.body.children].find((e) => e.shadowRoot);
      const root = host.shadowRoot;
      let textLength = 0;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const p = n.parentElement;
        if (p && TEXT_SKIP.has(p.tagName)) continue;
        textLength += n.textContent.trim().length;
      }
      const hr = host.getBoundingClientRect();
      const clipped = [];
      root.querySelectorAll('*').forEach((e) => {
        if (TEXT_SKIP.has(e.tagName)) return;
        const r = e.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.left < hr.left - 0.5 || r.top < hr.top - 0.5 || r.right > hr.right + 0.5 || r.bottom > hr.bottom + 0.5) {
          if (clipped.some((c) => c.contains(e))) return;
          clipped.push(e);
        }
      });
      return {
        textLength,
        errorBox: !!root.querySelector('[data-island-error]'),
        clipped: clipped.map((e) => `${e.tagName.toLowerCase()} "${(e.textContent || '').trim().slice(0, 30)}"`)
      };
    });
    out.push({ ...pageSide[i], ...guest });
  }
  return out;
}

// Marks the interactive elements inside island i's frame (outermost only) with data-probe-c, and returns their
// descriptions. Use clickCandidate to click one by index.
export async function clickCandidates(page, i) {
  const frame = await islandFrame(page, i);
  return frame.evaluate(() => {
    const host = [...document.body.children].find((e) => e.shadowRoot);
    const all = [...host.shadowRoot.querySelectorAll('*')];
    all.forEach((e) => e.removeAttribute('data-probe-c'));
    const sel = 'button, a[href], input, select, textarea, summary, [role=button], [tabindex], [onclick]';
    const cands = all.filter((e) => {
      if (e.tagName === 'STYLE' || e.tagName === 'SCRIPT') return false;
      if (e.matches(sel)) return true;
      const parent = e.parentElement;
      return getComputedStyle(e).cursor === 'pointer' && !(parent && getComputedStyle(parent).cursor === 'pointer');
    });
    const outer = cands.filter((e) => !cands.some((o) => o !== e && o.contains(e)));
    outer.forEach((e, k) => e.setAttribute('data-probe-c', String(k)));
    return outer.map((e) => `${e.tagName.toLowerCase()} "${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`);
  });
}

export async function clickCandidate(page, i, c) {
  const frame = await islandFrame(page, i);
  // A link click opens a real tab through the page's open handler; the probe checks the island, not that navigation.
  // The bound allows for a loaded machine, and a click that never lands still fails.
  await frame.locator(`[data-probe-c="${c}"]`).click({ timeout: 10_000, noWaitAfter: true });
}
