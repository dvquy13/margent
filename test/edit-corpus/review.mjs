// Prints every corpus case for review: its name, its steps on one line, and the diff from the original doc to the
// expected file, with two lines of context. Run: node test/edit-corpus/review.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = join(HERE, 'docs');
const CASES = join(HERE, 'cases');

function summarize(step) {
  const [kind] = Object.keys(step);
  const v = step[kind];
  if (kind === 'type') return `type ${JSON.stringify(v)}`;
  if (kind === 'press') return `press ${v}`;
  if (kind === 'blur') return 'blur';
  if (kind === 'click') return `click ${JSON.stringify(v.text)} ${v.at ?? 'start'}`;
  if (kind === 'select') return `select ${JSON.stringify(v.text)}`;
  if (kind === 'paste') return `paste ${JSON.stringify(v.text)} (html ${JSON.stringify(v.html)})`;
  if (kind === 'panel') return typeof v === 'string' ? `panel ${v}` : `panel ${JSON.stringify(v)}`;
  if (kind === 'wait') return `wait ${v}`;
  return `${kind}${v === true ? '' : ' ' + JSON.stringify(v)}`;
}

function diff(a, b) {
  const dir = mkdtempSync(join(tmpdir(), 'corpus-review-'));
  try {
    writeFileSync(join(dir, 'a'), a);
    writeFileSync(join(dir, 'b'), b);
    try {
      return execFileSync('diff', ['-U2', '--label', 'original', '--label', 'expected', join(dir, 'a'), join(dir, 'b')], { encoding: 'utf8' });
    } catch (err) {
      if (err.status === 1) return err.stdout;
      throw err;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const out = [];
for (const dir of readdirSync(CASES).sort()) {
  for (const file of readdirSync(join(CASES, dir)).filter((f) => f.endsWith('.json')).sort()) {
    const base = file.slice(0, -5);
    const json = JSON.parse(readFileSync(join(CASES, dir, file), 'utf8'));
    const original = readFileSync(join(DOCS, json.doc), 'utf8');
    const expected = readFileSync(join(CASES, dir, `${base}.expected.md`), 'utf8');
    const flags = `${json.author === null ? '  [no author]' : ''}${json.expect ? `  [expect ${json.expect}]` : ''}`;
    out.push(`## ${dir}/${base}  (${json.doc})${flags}`);
    out.push(`steps: ${json.steps.map(summarize).join(' ; ')}`);
    const d = expected === original ? '(no change: nothing is saved)\n' : diff(original, expected);
    out.push(d.replace(/\n$/, ''));
    out.push('');
  }
}
process.stdout.write(out.join('\n') + '\n');
