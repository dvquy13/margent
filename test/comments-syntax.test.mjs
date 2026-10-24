// Comment syntax tests (M3 T1, spec R1, R5.6): the note grammar, the pure source edits, and code spans. Run after
// `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { NOTE, noteSource, nextId, appendNote, stripThread, stripAll, splitQuote, quotedText } = await import(
  '../.build/comments/syntax.js'
);

const notesIn = (text) => [...text.matchAll(NOTE)].map((m) => ({ ...m.groups }));

test('R1.1: a thread is a highlight and its notes, and stripThread unwraps the highlight', () => {
  const block =
    'The filter keeps {==96% of GitHub issues==}{>>[c3] Quy: is that stable across repos?<<}{>>[c3] Claude: Measured on 4 repos in S3.<<}';
  assert.deepEqual(notesIn(block), [
    { id: 'c3', author: 'Quy', text: 'is that stable across repos?' },
    { id: 'c3', author: 'Claude', text: 'Measured on 4 repos in S3.' },
  ]);
  assert.equal(stripThread(block, 'c3'), 'The filter keeps 96% of GitHub issues');
});

test('R1.3: a point comment is a note with no highlight, and stripThread removes it', () => {
  const block = 'Some text {>>[c2] Quy: check this claim<<} and more';
  assert.deepEqual(notesIn(block), [{ id: 'c2', author: 'Quy', text: 'check this claim' }]);
  assert.equal(stripThread(block, 'c2'), 'Some text  and more');
});

test('R1.4: a block comment line is a paragraph of notes, and stripThread on it leaves nothing', () => {
  const table = '| Spike | Verdict |\n|---|---|\n| S3 | Proceed |';
  const line = '{>>[c4] Quy: S1 is missing from this table.<<}';
  assert.deepEqual(notesIn(`${table}\n\n${line}`), [{ id: 'c4', author: 'Quy', text: 'S1 is missing from this table.' }]);
  assert.equal(stripThread(line, 'c4'), '');
});

test('R1.6: a highlight with inline markdown keeps its bytes when unwrapped', () => {
  const block = 'Read {==the **filter** keeps==}{>>[c1] Quy: why?<<} first';
  assert.equal(stripThread(block, 'c1'), 'Read the **filter** keeps first');
});

test('noteSource writes the grammar that NOTE reads back', () => {
  const src = noteSource({ id: 'c7', author: 'Quy Dinh', text: 'a: b [c] <c> a<<<' });
  assert.equal(src, '{>>[c7] Quy Dinh: a: b [c] <c> a<<<<<}');
  assert.deepEqual(notesIn(src), [{ id: 'c7', author: 'Quy Dinh', text: 'a: b [c] <c> a<<<' }]);
});

test('noteSource throws a clear error on each bad input', () => {
  const ok = { id: 'c1', author: 'Quy', text: 'fine' };
  const bad = [
    [{ ...ok, text: '' }, /text is empty/],
    [{ ...ok, text: '   ' }, /text is empty/],
    [{ ...ok, text: 'two\nlines' }, /one line/],
    [{ ...ok, text: 'two\rlines' }, /one line/],
    [{ ...ok, text: 'has <<} inside' }, /'<<\}'/],
    [{ ...ok, author: '' }, /author is empty/],
    [{ ...ok, author: '  ' }, /author is empty/],
    [{ ...ok, author: 'a:b' }, /author/],
    [{ ...ok, author: 'a]b' }, /author/],
    [{ ...ok, author: 'a\nb' }, /author/],
    [{ ...ok, author: 'a<<}b' }, /author/],
    [{ ...ok, id: 'c0' }, /id/],
    [{ ...ok, id: 'c01' }, /id/],
    [{ ...ok, id: 'x1' }, /id/],
    [{ ...ok, id: 'c' }, /id/],
  ];
  for (const [parts, pattern] of bad) {
    assert.throws(() => noteSource(parts), (err) => err instanceof Error && pattern.test(err.message), JSON.stringify(parts));
  }
});

test('nextId: c1 on an empty file, and one above the highest id with gaps allowed', () => {
  assert.equal(nextId(''), 'c1');
  assert.equal(nextId('# no notes\n'), 'c1');
  assert.equal(nextId('a {>>[c1] A: x<<} b {>>[c4] B: y<<}'), 'c5');
  assert.equal(nextId('{>>[c9] A: x<<}\n{>>[c10] A: y<<}'), 'c11');
});

test('appendNote adds a reply after the last note of a two-note thread', () => {
  const block = 'Keep {==this==}{>>[c1] Quy: first<<}{>>[c1] Claude: second<<} and {>>[c2] Quy: other<<}';
  const out = appendNote(block, 'c1', { id: 'c1', author: 'Quy', text: 'third' });
  assert.equal(out, 'Keep {==this==}{>>[c1] Quy: first<<}{>>[c1] Claude: second<<}{>>[c1] Quy: third<<} and {>>[c2] Quy: other<<}');
});

test('appendNote throws when the block has no note with the id', () => {
  assert.throws(() => appendNote('plain text', 'c1', { id: 'c1', author: 'Quy', text: 'x' }), /no note with id c1/);
});

test('stripThread keeps the highlight bytes exactly and leaves other threads untouched', () => {
  const block =
    'A {==one **bold** and `code`==}{>>[c1] Quy: x<<}{>>[c1] Claude: y<<} B {==two==}{>>[c2] Quy: z<<} C';
  assert.equal(stripThread(block, 'c1'), 'A one **bold** and `code` B {==two==}{>>[c2] Quy: z<<} C');
  assert.equal(stripThread(block, 'c2'), 'A {==one **bold** and `code`==}{>>[c1] Quy: x<<}{>>[c1] Claude: y<<} B two C');
});

test('stripThread throws when the block has no note with the id', () => {
  assert.throws(() => stripThread('{==x==}{>>[c1] Quy: y<<}', 'c2'), /no note with id c2/);
});

test('stripAll removes every thread and unwraps every highlight', () => {
  const block =
    '{==a==}{>>[c1] Quy: one<<} then {==b **c**==}{>>[c2] Quy: two<<}{>>[c2] Claude: three<<} and {>>[c3] Quy: point<<}';
  assert.equal(stripAll(block), 'a then b **c** and ');
  assert.equal(stripAll('no comments here'), 'no comments here');
});

test('code spans: a note inside one is not a note for appendNote, stripThread or stripAll', () => {
  const block = 'use `{>>[c1] A: x<<}` here';
  assert.throws(() => appendNote(block, 'c1', { id: 'c1', author: 'Quy', text: 'y' }), /no note with id c1/);
  assert.throws(() => stripThread(block, 'c1'), /no note with id c1/);
  assert.equal(stripAll(block), block);
});

test('code spans: a highlight inside one is not unwrapped, and a code span inside a highlight is fine', () => {
  const block = '`{==x==}`{>>[c1] Quy: y<<}';
  assert.equal(stripThread(block, 'c1'), '`{==x==}`');
  assert.equal(stripThread('{==use `x`==}{>>[c2] Quy: y<<}', 'c2'), 'use `x`');
});

test('code spans: an unmatched backtick run is literal text, so the note after it counts', () => {
  const block = 'a ` {==b==}{>>[c1] Quy: y<<}';
  assert.equal(stripThread(block, 'c1'), 'a ` b');
  assert.equal(appendNote(block, 'c1', { id: 'c1', author: 'Quy', text: 'z' }), 'a ` {==b==}{>>[c1] Quy: y<<}{>>[c1] Quy: z<<}');
});

test('code spans: a longer run only closes on a run of the same length', () => {
  const block = '``a ` {>>[c1] A: x<<} ``{>>[c1] Quy: y<<}';
  assert.equal(stripThread(block, 'c1'), '``a ` {>>[c1] A: x<<} ``');
});

test('stripThread unwraps the highlight even when a code span before it holds an opener', () => {
  const block = 'Use `{==` here, {==real==}{>>[c1] Quy: ok<<} after.';
  assert.equal(stripThread(block, 'c1'), 'Use `{==` here, real after.');
});

// ---- quoted block comments (M3 T13, plan "Quote grammar")

test('T13: splitQuote reads "quote" → body with U+2192 and one space each side', () => {
  assert.deepEqual(splitQuote('"Reddit is out" → why left out?'), { quote: 'Reddit is out', body: 'why left out?' });
});

test('T13: splitQuote returns the text as the body when there is no quote, and never throws', () => {
  const plain = [
    'why left out?',
    '"Reddit is out" why left out?', // no arrow
    '"Reddit is out" -> why left out?', // ASCII arrow
    '"Reddit is out"→ why left out?', // no space before the arrow
    '"Reddit is out" →why left out?', // no space after the arrow
    '"Reddit is out"  →  why left out?', // two spaces each side
    '"" → empty quote', // no characters in the quote
    '"a "b" c" → quote holds a double quote',
    '"unclosed → body',
    '',
  ];
  for (const text of plain) {
    assert.deepEqual(splitQuote(text), { body: text }, JSON.stringify(text));
  }
});

test('T13: quotedText round-trips through splitQuote', () => {
  const text = quotedText('Reddit, Discourse and Stack Exchange are out', 'why are these left out?');
  assert.equal(text, '"Reddit, Discourse and Stack Exchange are out" → why are these left out?');
  assert.deepEqual(splitQuote(text), {
    quote: 'Reddit, Discourse and Stack Exchange are out',
    body: 'why are these left out?',
  });
  assert.deepEqual(splitQuote(quotedText('a', 'b → c')), { quote: 'a', body: 'b → c' });
});

test('T13: quotedText throws a clear error on each bad input', () => {
  const bad = [
    [['', 'body'], /quote is empty/],
    [['   ', 'body'], /quote is empty/],
    [['has "quotes"', 'body'], /'"'/],
    [['two\nlines', 'body'], /line break/],
    [['two\rlines', 'body'], /line break/],
    [['has <<} inside', 'body'], /'<<\}'/],
    [['quote', ''], /body is empty/],
    [['quote', '   '], /body is empty/],
  ];
  for (const [args, pattern] of bad) {
    assert.throws(() => quotedText(...args), (err) => err instanceof Error && pattern.test(err.message), JSON.stringify(args));
  }
});

test('T13: a quoted first note still passes noteSource, and a body with <<} is rejected there', () => {
  const text = quotedText('quote', 'body');
  assert.equal(noteSource({ id: 'c1', author: 'Quy', text }), '{>>[c1] Quy: "quote" → body<<}');
  assert.throws(() => noteSource({ id: 'c1', author: 'Quy', text: quotedText('quote', 'a <<} b') }), /'<<\}'/);
});

test('splitQuote reads a whitespace-only quote as plain text, as quotedText refuses to write one', () => {
  assert.deepEqual(splitQuote('"  " → x'), { body: '"  " → x' });
});
