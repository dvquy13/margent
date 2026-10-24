// The package version, so no test pins a literal one: release-please bumps package.json, and every test follows it.
import { readFileSync } from 'node:fs';

export const VERSION = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;

// Goldens store the page's generator line as `margent {version}`, so a release does not rewrite them.
export function versionless(html) {
  return html.replaceAll(`<meta name="generator" content="margent ${VERSION}">`, '<meta name="generator" content="margent {version}">');
}
