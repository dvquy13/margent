import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARGENT_CORPUS } from './helpers/corpus.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const FIX = join(here, 'fixtures', 'render', 'docs');
const GOLDEN = join(here, 'golden', 'render');

// Imported from .build/ (run `npm run build` first). Each bundle carries its own copy of RenderError,
// so errors are matched by name, not by instanceof.
const { renderBody } = await import('../.build/render/markdown.js');
const { findDocsRoot, projectName } = await import('../.build/render/root.js');
const { slugify, Slugger } = await import('../.build/render/slug.js');
const { renderDoc } = await import('../.build/render/page.js');

// Every .md under dir, recursively, sorted.
function markdownUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...markdownUnder(full));
    else if (name.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

function renderFixture(name, outFolder = FIX) {
  const file = join(FIX, `${name}.md`);
  return renderBody(readFileSync(file, 'utf8'), { file, root: FIX, outFile: join(outFolder, `${name}.html`) });
}

function bodyDump(r) {
  return `<!-- hero -->\n${r.hero}<!-- toc -->\n${r.toc}\n<!-- main -->\n${r.main}`;
}

// Byte-for-byte golden comparison. UPDATE_GOLDEN=1 rewrites the golden files instead.
function assertGolden(name, actual) {
  const path = join(GOLDEN, `${name}.html`);
  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(GOLDEN, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  assert.equal(actual, readFileSync(path, 'utf8'), `golden ${name} differs (rerun with UPDATE_GOLDEN=1 if the change is intended)`);
}

function renderError(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  assert.fail('expected a RenderError');
}

// Tiny scanner for our own generated HTML. Returns the elements that sit at block level:
// children of the root, or children of a <section>. Raw-text elements are skipped.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function blockLevelElements(html) {
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const stack = [];
  const found = [];
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) continue;
    const [, closing, rawName, attrs, selfClosing] = m;
    const name = rawName.toLowerCase();
    if (closing) {
      const idx = stack.lastIndexOf(name);
      if (idx >= 0) stack.length = idx;
      continue;
    }
    const blockLevel = stack.length === 0 || (stack.length === 1 && stack[0] === 'section');
    if (blockLevel && name !== 'section') found.push({ name, attrs });
    if (selfClosing || VOID.has(name)) continue;
    if (name === 'style' || name === 'script') {
      const end = html.indexOf(`</${name}>`, re.lastIndex);
      re.lastIndex = end + `</${name}>`.length;
      continue;
    }
    stack.push(name);
  }
  return found;
}

test('frontmatter gives meta and title, and is never rendered as content', () => {
  const r = renderFixture('basic');
  assert.deepEqual(r.meta, { status: 'draft', version: '1.10', updated: '2026-10-23' });
  assert.equal(r.title, 'Basic page');
  const all = r.hero + r.main;
  assert.ok(!all.includes('owner'), 'unknown key leaked into the body');
  assert.ok(!all.includes('status: draft'), 'frontmatter leaked into the body');
  assert.ok(!all.includes('---'), 'frontmatter delimiter leaked into the body');
});

test('a file without frontmatter takes its title from the first # heading', () => {
  const r = renderFixture('nofm');
  assert.equal(r.title, 'First heading wins');
  assert.deepEqual(r.meta, {});
  assert.ok(r.hero.includes('<p data-src="1-1">Lead text with no frontmatter.</p>'));
});

test('invalid frontmatter YAML is a RenderError at its line, column and offending line', () => {
  const err = renderError(() => renderFixture('colon-value'));
  assert.equal(err.name, 'RenderError');
  assert.equal(err.line, 2);
  assert.match(
    err.message,
    /colon-value\.md:2: invalid frontmatter YAML at column 8: Nested mappings are not allowed in compact mappings in "Title: Bug: SDK Agent fails"\. Quote the value: it contains ": "$/
  );
  assert.doesNotMatch(err.message, /at line \d+, column/, 'yaml tail is cut');
});

test('an unclosed bracket is reported without quoting the line yaml gave up on', () => {
  const err = renderError(() => renderFixture('bad-yaml'));
  assert.equal(err.line, 3);
  assert.match(err.message, /bad-yaml\.md:3: invalid frontmatter YAML: Flow sequence .+ end with a \]$/);
});

test('a nested mapping from bad indentation gets the offending line but no quote hint', () => {
  const err = renderError(() => renderFixture('indent-mapping'));
  assert.equal(err.line, 2);
  assert.match(err.message, /indent-mapping\.md:2: invalid frontmatter YAML at column 8: .+ in "title: Indented"$/);
});

test('a frontmatter line longer than 80 characters is cut with an ellipsis', () => {
  const err = renderError(() => renderFixture('long-line'));
  assert.equal(err.line, 3);
  const quoted = err.message.match(/ in "(.*)"\. Quote the value/)[1];
  assert.equal(quoted.length, 81);
  assert.ok(quoted.endsWith('…'));
  assert.ok(quoted.startsWith('description: Use when you need'));
});

test('frontmatter that is never closed is a RenderError at line 1', () => {
  const err = renderError(() => renderFixture('unclosed-fm'));
  assert.match(err.message, /unclosed-fm\.md:1: frontmatter opened with --- is never closed/);
});

test('sections, TOC and slugs: duplicates get -2 and -3, unicode headings slug', () => {
  const r = renderFixture('basic');
  const ids = [...r.main.matchAll(/<section id="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['overview', 'overview-2', 'café-au-lait', '日本語-見出し', 'naïve-résumé', 'overview-3']);
  const tocLinks = [...r.toc.matchAll(/<a href="#([^"]+)">([^<]*)<\/a>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(tocLinks, [
    ['overview', 'Overview'],
    ['overview-2', 'Overview'],
    ['café-au-lait', 'Café au lait'],
    ['日本語-見出し', '日本語 見出し'],
    ['naïve-résumé', 'Naïve: Résumé!'],
    ['overview-3', 'Overview'],
  ]);
  assert.ok(r.toc.startsWith('<nav class="toc" aria-label="Sections"><ol>'));
  assert.ok(r.hero.startsWith('<h1 data-src="9-9" id="basic-page">Basic page</h1>'));
  assert.ok(r.hero.includes('Intro paragraph before any section.'));
  assert.ok(!r.main.includes('Intro paragraph'), 'blocks before the first ## belong in the hero');
});

test('an h2 that starts with a number shows the number in its own span, in the heading and the TOC', () => {
  const r = renderFixture('numbered');
  assert.ok(r.main.includes('<section id="02-data-layers">\n<h2 data-src="7-7"><span class="num">02</span>Data layers</h2>'));
  assert.ok(r.toc.includes('<li><a href="#02-data-layers"><span class="num">02</span>Data layers</a></li>'));
  assert.ok(r.main.includes('<section id="21-sub-numbered">'), 'slug is computed from the full text');
  assert.ok(r.toc.includes('<a href="#21-sub-numbered"><span class="num">2.1</span>Sub numbered</a>'));
  assert.ok(r.main.includes('<h2 data-src="15-15">Version 3 notes</h2>'), 'a number not at the start is unchanged');
  assert.ok(r.main.includes('<h2 data-src="19-19"><strong>03</strong> Bold number</h2>'), 'a number not in the first text token is left as written');
});

test('h3 to h6 get ids, deduplicated across the page', () => {
  const r = renderFixture('basic');
  assert.ok(r.main.includes('<h3 data-src="17-17" id="install">Install</h3>'));
  assert.ok(r.main.includes('<h4 data-src="21-21" id="install-2">Install</h4>'));
});

test('the title h1 gets a slug id, and a [x](#title-slug) link lands on it', () => {
  const file = join(FIX, 'title-link.md');
  const source = '# Title Here\n\nSee [the title](#title-here).\n\n## Next\n\nText.\n';
  const out = renderDoc({ file, source, root: FIX, outFile: join(FIX, 'title-link.html') });
  const h1 = out.html.match(/<h1 [^>]*>Title Here<\/h1>/);
  assert.ok(h1, 'title h1 is in the page');
  assert.match(h1[0], / id="title-here"/);
  assert.ok(out.html.includes('<a href="#title-here">the title</a>'), 'link is kept as written');
  const ids = [...out.html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.includes('title-here'), 'an element with the link target id exists');
});

test('the title h1 reserves its slug, so a later h2 with the same text gets -2', () => {
  const r = renderBody('# Example\n\n## Example\n\nText.\n', { file: join(FIX, 'dup.md'), root: FIX, outFile: join(FIX, 'dup.html') });
  assert.match(r.hero, /<h1 [^>]*id="example"/);
  assert.match(r.main, /<section id="example-2">/);
});

test('a top-level h2 carries its slug on its section, not on the heading', () => {
  const r = renderFixture('basic');
  assert.ok(r.main.includes('<h2 data-src="13-13">Overview</h2>'));
  assert.equal(r.main.includes('<h2 data-src="13-13" id='), false);
});

test('a page with no ## has no section and no TOC', () => {
  const r = renderFixture('nofm');
  assert.equal(r.toc, '');
  assert.equal(r.main, '');
});

test('slugify follows GitHub, keeping Unicode letters, marks and numbers', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('Café au lait'), 'café-au-lait');
  assert.equal(slugify('Naïve: Résumé!'), 'naïve-résumé');
  assert.equal(slugify('C++ & Rust!'), 'c--rust');
  assert.equal(slugify('snake_case 2026'), 'snake_case-2026');
  assert.equal(slugify('e\u0301té'), 'e\u0301té', 'combining marks are kept');
});

test('Slugger dedups with -2, -3 in document order', () => {
  const s = new Slugger();
  assert.deepEqual(['a', 'a', 'a'].map((t) => s.unique(t)), ['a', 'a-2', 'a-3']);
  const t = new Slugger();
  assert.deepEqual(['a-2', 'a', 'a'].map((x) => t.unique(x)), ['a-2', 'a', 'a-3']);
});

test('data-src on every block of the blocks fixture, with tables, fences and raw HTML wrapped', () => {
  const r = renderFixture('blocks');
  assert.ok(r.main.includes('<ul data-src="11-12">'));
  assert.ok(r.main.includes('<blockquote data-src="14-15">'));
  assert.ok(r.main.includes('<pre data-src="17-19"><code class="language-js">'));
  assert.ok(r.main.includes('<pre data-src="21-21"><code>'));
  assert.ok(r.main.includes('<div class="scroll" data-src="23-26">\n<table>'));
  assert.ok(r.main.includes('<hr data-src="28-28">'));
  assert.ok(r.main.includes('<div data-src="30-30">\n<div class="raw">raw html block</div>'));
  assert.ok(r.main.includes('<ol data-src="32-33">'));
  assertGolden('blocks.body', bodyDump(r));
});

test('link rewriting: .md inside the root becomes .html, everything else is left alone', () => {
  const r = renderFixture('links');
  assert.ok(r.hero.includes('<a href="sub/child.html#details" data-md-href="sub/child.md#details">child</a>'), 'anchor kept');
  assert.ok(r.hero.includes('<a href="sub/child.html" data-md-href="sub/child.md">child plain</a>'));
  assert.ok(r.hero.includes('<a href="../outside.md">up</a>'), 'outside the root is untouched');
  assert.ok(r.hero.includes('<a href="https://example.com/page.md">site</a>'), 'absolute URL untouched');
  assert.ok(r.hero.includes('<a href="mailto:someone@example.com">mail</a>'), 'mailto untouched');
  assert.ok(r.hero.includes('<a href="#links">here</a>'), 'anchor-only untouched');
  assert.ok(r.hero.includes('<a href="links.html" data-md-href="links.md">self</a>'), 'same-folder link');
  assert.ok(r.hero.includes('<a href="sub/missing.html" data-md-href="sub/missing.md">gone</a>'), 'inside the root, rewritten even if missing');
});

test('links lists the existing .md files inside the root, sorted and de-duplicated', () => {
  const r = renderFixture('links');
  assert.deepEqual(r.links, [join(FIX, 'links.md'), join(FIX, 'sub', 'child.md')]);
});

test('an SVG alone in a paragraph is inlined in a figure, and the italic line after it is the caption', () => {
  const r = renderFixture('figures');
  assert.ok(r.hero.includes('<figure data-src="7-9"><div class="scroll"><svg '), 'figure spans image and caption');
  assert.ok(r.hero.includes('</svg></div><figcaption>Caption for the diagram with a <a href="sub/child.html" data-md-href="sub/child.md">link</a>.</figcaption></figure>'));
  assert.ok(r.hero.includes('<p data-src="11-11">Between the two blocks.</p>'), 'the block after the caption is separate');
  assert.equal(r.hero.includes('<img src="images/feedback-loops.svg"'), false);
});

test('an SVG figure without a caption has no figcaption', () => {
  const r = renderFixture('figures');
  assert.ok(r.hero.includes('<figure data-src="13-13"><div class="scroll"><svg '));
  const figure = r.hero.slice(r.hero.indexOf('<figure data-src="13-13">'));
  assert.ok(figure.startsWith('<figure data-src="13-13"><div class="scroll"><svg '));
  assert.ok(figure.slice(0, figure.indexOf('</figure>')).endsWith('</svg></div>'));
});

test('an inlined SVG keeps its own role and aria-label', () => {
  const r = renderFixture('figures');
  assert.equal(r.hero.match(/<svg [^>]*role="img"/g).length, 2);
  assert.ok(r.hero.includes('aria-label="Three feedback loops on a time axis'));
});

test('a figure svg gets role and aria-label from alt when it has none, and drops the XML prolog', () => {
  const root = mkdtempSync(join(tmpdir(), 'margent-svg-'));
  mkdirSync(join(root, 'islands'));
  writeFileSync(
    join(root, 'plain.svg'),
    '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">\n<!-- made by hand -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>\n',
  );
  const file = join(root, 'doc.md');
  writeFileSync(file, '# Doc\n\n![A square](plain.svg)\n');
  const r = renderBody(readFileSync(file, 'utf8'), { file, root, outFile: join(root, 'doc.html') });
  assert.ok(
    r.hero.includes('<figure data-src="3-3"><div class="scroll"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" role="img" aria-label="A square"><rect width="5" height="5"/></svg></div></figure>'),
    r.hero,
  );
  assert.equal(r.hero.includes('<?xml'), false);
  assert.equal(r.hero.includes('DOCTYPE'), false);
});

test('a non-SVG local image stays an img, with its path relative to the output file folder', () => {
  const outFolder = join(FIX, 'out', 'deep');
  const r = renderFixture('figures', outFolder);
  assert.ok(r.hero.includes('<img src="../../images/pixel.png" alt="Plain picture" data-md-src="images/pixel.png">'));
  assert.ok(r.hero.includes('Inline <img src="../../images/pixel.png" alt="tiny" data-md-src="images/pixel.png"> image'));
  const same = renderFixture('figures');
  assert.ok(same.hero.includes('<img src="images/pixel.png" alt="Plain picture">'));
});

test('a missing local image is a RenderError at the image line', () => {
  const err = renderError(() => renderFixture('missing-image'));
  assert.equal(err.name, 'RenderError');
  assert.equal(err.line, 9);
  assert.match(err.message, /missing-image\.md:9: image not found: images\/does-not-exist\.png/);
});

test('a figure whose SVG cannot be read is a RenderError at the figure line', () => {
  const root = mkdtempSync(join(tmpdir(), 'margent-svg-'));
  mkdirSync(join(root, 'islands'));
  const file = join(root, 'doc.md');
  writeFileSync(file, '# Doc\n\nText.\n\n![Gone](gone.svg)\n');
  const err = renderError(() => renderBody(readFileSync(file, 'utf8'), { file, root, outFile: join(root, 'doc.html') }));
  assert.equal(err.name, 'RenderError');
  assert.equal(err.line, 5);
  assert.match(err.message, /doc\.md:5: cannot read image gone\.svg/);
});

// Renders a source string with no file on disk. The markers are checked on the body HTML.
function renderSource(source) {
  const file = join(FIX, 'inline.md');
  return renderBody(source, { file, root: FIX, outFile: join(FIX, 'inline.html') }).hero;
}

// No soft-break element: the newline stays in the text node. The edit runtime (T5) reads soft breaks from that newline
// on a cloned DOM. An element boundary there changes Chrome's glyph shaping (109 px on a long page at 1280), so a
// marker element would break the "no pixel change" rule (R8.2).
test('R8.1: a soft break renders as a bare newline in the paragraph, with no data-soft anywhere', () => {
  assert.equal(renderSource('First line\nsecond line.\n'), '<p data-src="1-2">First line\nsecond line.</p>\n');
  assert.equal(renderSource('One.\n\nTwo.\n'), '<p data-src="1-1">One.</p>\n<p data-src="3-3">Two.</p>\n');
  assert.ok(!renderSource('a\nb\n- c\nd\n').includes('data-soft'));
});

test('R8.2: a loose list marks items 2 and up, and never the first item', () => {
  const html = renderSource('- one\n\n- two\n\n- three\n');
  assert.ok(html.includes('<li>\n<p>one</p>'), 'first item is unmarked');
  assert.ok(html.includes('<li data-gap="1">\n<p>two</p>'));
  assert.ok(html.includes('<li data-gap="1">\n<p>three</p>'));
});

test('R8.2: a tight list has no gap marks', () => {
  assert.equal(renderSource('- one\n- two\n'), '<ul data-src="1-2">\n<li>one</li>\n<li>two</li>\n</ul>\n');
});

test('R8.2: a nested list is judged by its own blank-line predecessors', () => {
  const html = renderSource('- outer a\n  - inner a\n  - inner b\n\n  - inner c\n- outer b\n\n- outer c\n');
  assert.ok(html.includes('<li>\n<p>inner b</p>'), 'inner b follows a text line, so unmarked');
  assert.ok(html.includes('<li data-gap="1">\n<p>inner c</p>'), 'inner c follows a blank line');
  assert.ok(html.includes('<li>\n<p>outer b</p>'), 'outer b follows a text line, so unmarked');
  assert.ok(html.includes('<li data-gap="1">\n<p>outer c</p>'), 'outer c follows a blank line');
  assert.ok(!html.includes('<li data-gap="1">\n<p>inner a</p>'), 'the first item of a list is never marked');
  // A nested list that opens after a blank line starts with its own first item, which stays unmarked.
  const opening = renderSource('- outer a\n\n  - inner a\n  - inner b\n');
  assert.ok(opening.includes('<li>inner a</li>'));
  assert.ok(!opening.includes('data-gap'));
});

test('determinism: rendering the same input twice gives identical output', () => {
  for (const name of ['basic', 'figures', 'links', 'blocks', 'nofm']) {
    const a = renderFixture(name);
    const b = renderFixture(name);
    assert.deepEqual(a, b, name);
    assert.equal(bodyDump(a), bodyDump(b), name);
  }
});

test('golden bodies for the basic, links, figures and nofm fixtures', () => {
  for (const name of ['basic', 'links', 'figures', 'nofm']) {
    assertGolden(`${name}.body`, bodyDump(renderFixture(name)));
  }
});

test('findDocsRoot: the nearest ancestor with an islands folder, else the file folder', () => {
  assert.equal(findDocsRoot(join(FIX, 'basic.md')), FIX);
  assert.equal(findDocsRoot(join(FIX, 'sub', 'child.md')), FIX);
  const bare = mkdtempSync(join(tmpdir(), 'margent-root-'));
  mkdirSync(join(bare, 'sub'));
  assert.equal(findDocsRoot(join(bare, 'sub', 'x.md')), join(bare, 'sub'));
});

test('projectName: the parent folder when the root is called docs, else the root name', () => {
  assert.equal(projectName('/work/acme/docs'), 'acme');
  assert.equal(projectName('/work/margent/kb'), 'kb');
});

test('data-src covers every top-level block of the frozen margent docs, with no overlaps and no uncovered content', () => {
  // A copy of the whole tree, so every relative image link resolves as it does in the repo.
  const root = join(mkdtempSync(join(tmpdir(), 'margent-corpus-')), 'docs');
  cpSync(MARGENT_CORPUS, root, { recursive: true });
  const files = markdownUnder(root);
  assert.ok(files.length > 0, 'corpus has markdown files');

  for (const file of files) {
    const name = relative(root, file);
    const text = readFileSync(file, 'utf8');
    const r = renderBody(text, { file, root, outFile: file.replace(/\.md$/, '.html') });
    const lines = text.split('\n');
    const fmEnd = lines[0] === '---' ? lines.indexOf('---', 1) + 1 : 0;

    const blank = (n) => lines[n - 1].trim() === '';
    const elements = [...blockLevelElements(r.hero), ...blockLevelElements(r.main)];
    assert.ok(elements.length > 0, `${name}: has blocks`);
    const ranges = elements.map((el) => {
      const m = /data-src="(\d+)-(\d+)"/.exec(el.attrs);
      assert.ok(m, `${name}: top-level <${el.name}> has no data-src`);
      return [Number(m[1]), Number(m[2])];
    });
    ranges.sort((a, b) => a[0] - b[0]);

    const covered = new Array(lines.length + 1).fill(false);
    let prevEnd = fmEnd;
    for (const [s, e] of ranges) {
      assert.ok(s >= 1 && s <= e && e <= lines.length, `${name}: range ${s}-${e} is out of bounds`);
      assert.ok(!blank(s) && !blank(e), `${name}: range ${s}-${e} starts or ends on a blank line`);
      assert.ok(s > prevEnd, `${name}: range ${s}-${e} overlaps the one before it`);
      for (let n = s; n <= e; n++) covered[n] = true;
      prevEnd = e;
    }
    for (let n = fmEnd + 1; n <= lines.length; n++) {
      if (!blank(n)) assert.ok(covered[n], `${name}: line ${n} is not covered by any data-src range: ${lines[n - 1]}`);
    }
  }
});

test('renderDoc fills the shell: title, generator, header, footer and scripts', () => {
  const file = join(FIX, 'basic.md');
  const out = renderDoc({ file, source: readFileSync(file, 'utf8'), root: FIX, outFile: join(FIX, 'basic.html') });
  assert.equal(out.title, 'Basic page');
  assert.ok(out.html.includes('<title>Basic page</title>'));
  const { version } = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  assert.ok(out.html.includes(`<meta name="generator" content="margent ${version}">`));
  assert.ok(out.html.includes('Rendered from basic.md'));
  assert.ok(out.html.includes('<span class="top-meta">draft · 1.10 · 2026-10-23</span>'));
  assert.ok(out.html.includes('<span class="wordmark">render</span>'), 'project name is the root folder name when it is not docs');
  assert.ok(!out.html.includes('{{'), 'no slot left unfilled');
  assert.ok(!out.html.includes(repoRoot()), 'no absolute path in the output');
});

test('renderDoc is deterministic and returns links', () => {
  const file = join(FIX, 'links.md');
  const input = { file, source: readFileSync(file, 'utf8'), root: FIX, outFile: join(FIX, 'links.html') };
  assert.equal(renderDoc(input).html, renderDoc(input).html);
  assert.deepEqual(renderDoc(input).links, [join(FIX, 'links.md'), join(FIX, 'sub', 'child.md')]);
});

test('full-page goldens: basic doc and the shell all-blocks fixture', () => {
  const basic = join(FIX, 'basic.md');
  assertGolden('basic.page', renderDoc({ file: basic, source: readFileSync(basic, 'utf8'), root: FIX, outFile: join(FIX, 'basic.html') }).html);
  const blocksDir = join(here, 'fixtures', 'blocks');
  const all = join(blocksDir, 'all-blocks.md');
  assertGolden('all-blocks.page', renderDoc({ file: all, source: readFileSync(all, 'utf8'), root: blocksDir, outFile: join(blocksDir, 'all-blocks.html') }).html);
});

function repoRoot() {
  return repo;
}

test('a rewritten link or image keeps its original target in data-md-href and data-md-src; an unchanged one gets none', () => {
  const file = join(FIX, 'links-original.md');
  const source = '[spec](specs/x.md#a) and [ext](https://example.com/a.md) and ![pic](./images/pixel.png) and ![keep](https://example.com/p.png)\n';
  const body = renderBody(source, { file, root: FIX, outFile: join(FIX, 'links-original.html') });
  assert.ok(body.hero.includes('<a href="specs/x.html#a" data-md-href="specs/x.md#a">spec</a>'), body.hero);
  assert.ok(body.hero.includes('<a href="https://example.com/a.md">ext</a>'), body.hero);
  assert.ok(body.hero.includes('<img src="images/pixel.png" alt="pic" data-md-src="./images/pixel.png">'), body.hero);
  assert.ok(body.hero.includes('<img src="https://example.com/p.png" alt="keep">'), body.hero);
});
