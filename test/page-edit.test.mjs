// The renderDoc seam for `margent serve`: the optional edit slot and RenderedDoc.deps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const BLOCKS = join(here, 'fixtures', 'blocks');
const ALL = join(BLOCKS, 'all-blocks.md');
const S3 = join(here, 'fixtures', 'islands', 's3');

// Imported from .build/ (run `npm run build` first).
const { renderDoc } = await import('../.build/render/page.js');

function input(extra = {}) {
  return {
    file: ALL,
    source: readFileSync(ALL, 'utf8'),
    root: BLOCKS,
    outFile: join(BLOCKS, 'all-blocks.html'),
    ...extra,
  };
}

const state = { path: 'all-blocks.md', hash: 'h', source: readFileSync(ALL, 'utf8'), author: null };
const STATE_RE = /<script type="application\/json" id="margent-state">([\s\S]*?)<\/script>/;

test('edit adds exactly the comment rail (CSS and script), the CSS, the state script and the bundle script to the plain page', () => {
  const plain = renderDoc(input()).html;
  const edited = renderDoc(input({ edit: { state, js: '/*EDITJS*/', css: '/*EDITCSS*/' } })).html;

  const stateJson = JSON.stringify(state).replace(/</g, '\\u003c');
  const css = '\n/*EDITCSS*/';
  const stateScript = `\n<script type="application/json" id="margent-state">${stateJson}</script>`;
  const bundle = '\n<script>\n/*EDITJS*/</script>';
  // A served page always carries the comment rail, so the first note's draft can sit in it (decision 0023).
  const railCss = `${readFileSync(join(repo, 'shell', 'comments.css'), 'utf8')}\n`;
  const railJs = `\n<script>\n${readFileSync(join(repo, 'runtime', 'comments.js'), 'utf8')}</script>`;

  assert.ok(edited.includes(`${css}\n</style>`), 'the CSS is the last thing in the one style element');
  for (const insertion of [css, stateScript, bundle, railCss, railJs]) {
    assert.equal(edited.split(insertion).length, 2, `exactly one occurrence of ${JSON.stringify(insertion)}`);
  }
  // The policy meta differs by design (M5 R2.4): a served page may fetch from its own server, and it lists the hashes of
  // the comment rail and the edit bundle. Every other directive is the same as the plain page's.
  const policyMeta = (html) => /<meta http-equiv="Content-Security-Policy" content="[^"]*">/.exec(html)[0];
  const directives = (html) => {
    const content = /content="([^"]*)"/.exec(policyMeta(html))[1];
    return Object.fromEntries(content.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]));
  };
  const hash = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
  const plainPolicy = directives(plain);
  const editPolicy = directives(edited);
  assert.deepEqual(
    [...editPolicy['script-src']].sort(),
    [...plainPolicy['script-src'], hash(`\n${readFileSync(join(repo, 'runtime', 'comments.js'), 'utf8')}`), hash('\n/*EDITJS*/')].sort(),
    'script-src adds exactly the comment rail and the edit bundle'
  );
  assert.deepEqual(plainPolicy['connect-src'], ["'none'"]);
  assert.deepEqual(editPolicy['connect-src'], ["'self'"], 'a served page may fetch from its own server');
  const withoutScripts = ({ 'script-src': _s, 'connect-src': _c, ...rest }) => rest;
  assert.deepEqual(withoutScripts(editPolicy), withoutScripts(plainPolicy), 'every other directive is unchanged');

  const stripped = edited
    .replace(css, '')
    .replace(stateScript, '')
    .replace(bundle, '')
    .replace(railCss, '')
    .replace(railJs, '')
    .replace(policyMeta(edited), policyMeta(plain));
  assert.equal(stripped, plain);
});

test('a </script> in the state source cannot close the state element, and the state round-trips', () => {
  const hostile = { ...state, source: '# x\n\n</script><script>alert(1)</script>\n<!-- </script> -->' };
  const html = renderDoc(input({ edit: { state: hostile, js: '', css: '' } })).html;

  const match = STATE_RE.exec(html);
  assert.ok(match, 'state element found');
  assert.ok(!match[1].includes('<'), 'every "<" in the state JSON is escaped');
  assert.deepEqual(JSON.parse(match[1]), hostile);
});

test('deps for all-blocks: the md and the one inlined SVG, not the raster image', () => {
  const deps = renderDoc(input()).deps;
  assert.deepEqual(deps, [ALL, join(BLOCKS, 'assets', 'feedback-loops.svg')]);
});

test('deps for a doc with an island: the md and the island module it uses', () => {
  const file = join(S3, 'A.md');
  const out = renderDoc({ file, source: readFileSync(file, 'utf8'), root: S3, outFile: join(S3, 'A.html') });
  assert.deepEqual(out.deps, [file, join(S3, 'islands', 'llm-calls.island.js')]);
});

test('an edit runtime that would break its element is an error', () => {
  const plain = { edit: { state, js: '', css: '' } };
  assert.throws(() => renderDoc(input({ edit: { state, js: 'x</script>y', css: '' } })), /edit runtime contains/);
  assert.throws(() => renderDoc(input({ edit: { state, js: 'x<!--y', css: '' } })), /edit runtime contains/);
  assert.throws(() => renderDoc(input({ edit: { state, js: '', css: 'a</style>b' } })), /edit runtime CSS contains/);
  assert.doesNotThrow(() => renderDoc(input(plain)));
});

test('the edit bundle is built to .build/runtime/edit.js as a browser IIFE with no node banner', () => {
  const out = join(repo, '.build', 'runtime', 'edit.js');
  assert.ok(existsSync(out), `${out} exists after npm run build`);
  const js = readFileSync(out, 'utf8');
  assert.doesNotMatch(js, /createRequire/, 'the node require banner must not be in the browser bundle');
  assert.doesNotMatch(js, /<\/script|<\/style/i);
});
