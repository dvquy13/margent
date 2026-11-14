// The script policy every page carries (spec M5 R2.4; spikes/s6-sandbox/FINDINGS.md). It lists the sha256 of each
// script text the page or its guests run, and nothing else, so a script written into the markdown never runs.
import { createHash } from 'node:crypto';

// `serve` pages may fetch from their own server; pages written to disk may not fetch at all.
export type PolicyMode = 'serve' | 'file';

// The CSP source for one script text: 'sha256-' plus base64 of the UTF-8 bytes of the exact text. Every listed text
// reaches the browser through an HTML parser, which makes CR into LF and NUL into U+FFFD before a script runs, so a
// text holding either would be blocked. The build and loadIsland give LF text; anything else is a bug, and fails here.
export function scriptHash(text: string): string {
  const bad = /[\r\0]/.exec(text);
  if (bad) {
    const what = bad[0] === '\r' ? 'a CR' : 'a NUL';
    throw new Error(`a script on the page contains ${what} character, which the browser would change, so its hash would not match`);
  }
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

// `texts` are every script text the page lists, in first-seen order; duplicates collapse to one hash.
export function pagePolicy(texts: string[], mode: PolicyMode): string {
  const hashes = [...new Set(texts.map(scriptHash))];
  return [
    `script-src ${hashes.length > 0 ? hashes.join(' ') : "'none'"}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `connect-src ${mode === 'serve' ? "'self'" : "'none'"}`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
  ].join('; ');
}
