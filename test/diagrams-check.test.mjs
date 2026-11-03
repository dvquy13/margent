// `margent check` on diagram width (M8 spec D3.1 and A5). Spawns `node dist/cli.js` from the repo root, so the fixtures'
// paths are repo-relative. No Chrome is needed: a diagram alone never starts a page run. Run after `npm run build`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(REPO, 'dist', 'cli.js');
const WIDTH = 'test/fixtures/diagrams/width';

function check(target) {
  return spawnSync(process.execPath, [CLI, 'check', target], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, MARGENT_CHROME: '/nonexistent/chrome' },
  });
}

test('A5: check of a diagram 1365 px wide in its wide layout prints the D3.1 line and exits 1 (D3.1)', () => {
  const r = check(`${WIDTH}/wide.md`);
  assert.equal(
    r.stdout,
    `${WIDTH}/wide.md:5: diagram is 1365px wide, so its text would shrink below 75% in the page column: split it, turn it top-to-bottom, or draw it as an SVG\n`,
  );
  assert.equal(r.stderr, '');
  assert.equal(r.status, 1);
});

test('A5: check of a diagram under 1200 px wide passes with the usual ok line (D3.1)', () => {
  const r = check(`${WIDTH}/fits.md`);
  assert.equal(r.stdout, 'ok 1 docs, 0 islands\n');
  assert.equal(r.stderr, '');
  assert.equal(r.status, 0);
});

test('A5: a wide diagram and a broken local link print both lines, sorted by line (D3.1)', () => {
  // The diagram sits on line 3 and the broken link on line 14, so the sort puts the diagram first even though the link
  // problems are collected before the diagram problems.
  const dir = mkdtempSync(join(tmpdir(), 'margent-diagrams-'));
  try {
    const doc = join(dir, 'mixed.md');
    writeFileSync(
      doc,
      [
        '# Mixed',
        '',
        '```mermaid',
        'flowchart TD',
        '  Root[Quarterly review] --> N0[Collect the weekly metrics]',
        '  Root --> N1[Review open incidents]',
        '  Root --> N2[Update the roadmap]',
        '  Root --> N3[Sync with design]',
        '  Root --> N4[Draft the release notes]',
        '  Root --> N5[Check the backlog]',
        '  Root --> N6[Plan the next sprint]',
        '```',
        '',
        'See [the missing note](no-such-note.md).',
        '',
      ].join('\n'),
    );
    const r = check(doc);
    const lines = r.stdout.trimEnd().split('\n');
    assert.equal(lines.length, 2, r.stdout);
    assert.match(lines[0], /^\S+mixed\.md:3: diagram is 1365px wide, so its text would shrink below 75%/);
    assert.match(lines[1], /^\S+mixed\.md:14: link to no-such-note\.md: no such file$/);
    assert.equal(r.status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
