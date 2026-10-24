// Acceptance M2 A10: fonts-blocked pixel comparison of two rendered HTML pages, at 1280 and 390 wide, light theme.
// Google Fonts hosts are aborted so both pages use the same local fallback fonts (the Google Fonts load race
// otherwise makes even an unchanged page vary between runs). Each page is screenshotted full-page, then the two
// PNGs are decoded in the browser and compared pixel by pixel. Usage: [THEME=dark] [MASK_ISLANDS=1] node scripts/accept/pixel-diff.mjs <before.html> <after.html> <outDir>
// THEME is light (default) or dark: it sets the emulated colour scheme, which the page's theme tokens follow.
// Prints PASS only when the sizes match and no pixel differs. A diff-*.png in outDir marks the differing pixels in red.
import { withBrowser } from '../../test/helpers/browser.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , beforeHtml, afterHtml, outDir] = process.argv;
mkdirSync(outDir, { recursive: true });
const theme = process.env.THEME || 'light';
if (theme !== 'light' && theme !== 'dark') throw new Error(`pixel-diff.mjs: THEME must be light or dark, got ${theme}`);

async function shot(browser, html, path, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const page = await context.newPage();
  await page.goto(pathToFileURL(html).href);
  // An M5 island reports its state before its frame reports the height, so the box has no height until both arrived.
  await page.waitForFunction(
    () => [...document.querySelectorAll('agent-island')].every((h) => h.hasAttribute('data-state') && h.getBoundingClientRect().height > 0),
    null,
    { timeout: 15000 }
  );
  await page.evaluate(() => document.fonts.ready);
  // A full-page shot can catch an image before it is decoded (seen on a 320px JPEG at 390px dark), so wait for every image.
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  // MASK_ISLANDS=1 hides island content but keeps its box: what remains must match exactly, with or without frames.
  if (process.env.MASK_ISLANDS === '1') {
    await page.addStyleTag({ content: 'agent-island .island-mount { visibility: hidden !important; }' });
  }
  await page.screenshot({ path, fullPage: true });
  await context.close();
}

// Counts pixels that differ between two PNG files. Returns size, count and the first differing pixel.
async function countDiff(browser, a, b) {
  const uri = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  const res = await page.evaluate(async ([ua, ub]) => {
    const load = (u) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u; });
    const [ia, ib] = await Promise.all([load(ua), load(ub)]);
    // A size difference is a failure in its own right. The pixels are then compared over the common top-left area,
    // so the count says how far the content differs, and the diff image shows where.
    const W = Math.min(ia.width, ib.width), H = Math.min(ia.height, ib.height);
    const px = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
    const da = px(ia), db = px(ib);
    const out = new Uint8ClampedArray(W * H * 4);
    let diff = 0, first = null;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * ia.width + x) * 4, j = (y * ib.width + x) * 4, o = (y * W + x) * 4;
      if (da[i] !== db[j] || da[i + 1] !== db[j + 1] || da[i + 2] !== db[j + 2] || da[i + 3] !== db[j + 3]) {
        diff++;
        if (!first) first = [x, y];
        out.set([255, 0, 0, 255], o);
      } else {
        out.set([da[i] * 0.3 + 180, da[i + 1] * 0.3 + 180, da[i + 2] * 0.3 + 180, 255], o);
      }
    }
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').putImageData(new ImageData(out, W, H), 0, 0);
    return { size: [ia.width, ia.height], sizeB: [ib.width, ib.height], diff, first, png: c.toDataURL('image/png') };
  }, [uri(a), uri(b)]);
  if (res.diff > 0 || res.size.join() !== res.sizeB.join()) {
    writeFileSync(join(outDir, `diff-${basename(beforeHtml, '.html')}-${basename(afterHtml, '.html')}-${res.size[0]}.png`), Buffer.from(res.png.split(',')[1], 'base64'));
  }
  await page.close();
  return res;
}

await withBrowser(async (browser) => {
  for (const width of [1280, 390]) {
    const a = join(outDir, `before-${basename(beforeHtml, '.html')}-${width}.png`);
    const b = join(outDir, `after-${basename(afterHtml, '.html')}-${width}.png`);
    await shot(browser, beforeHtml, a, width);
    await shot(browser, afterHtml, b, width);
    const r = await countDiff(browser, a, b);
    const same = r.size.join() === r.sizeB.join();
    const verdict = same && r.diff === 0 ? 'PASS' : 'FAIL';
    console.log(`${theme} ${basename(beforeHtml, '.html')} ${width}px: ${verdict} differing pixels ${r.diff}`, same ? `size ${r.size}${r.first ? ` first at ${r.first}` : ''}` : `sizes ${r.size} vs ${r.sizeB} (compared over the common area)`);
  }
});
