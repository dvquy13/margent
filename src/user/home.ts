// The margent home folder and the user's theme in it (spec U1, U2; decision 0047). Only the CLI reads these: renders
// get the theme as a value and never touch the home folder.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RenderError } from '../errors.js';

export interface UserTheme {
  file: string; // absolute path of theme.css, for messages
  css: string; // its text, byte for byte
}

// $MARGENT_HOME when set and not empty, else ~/.margent.
export function margentHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.MARGENT_HOME ? env.MARGENT_HOME : join(homedir(), '.margent');
}

// The theme in the home folder, or null when there is none. A missing folder or file means no theme. Never creates the folder.
export function readUserTheme(home: string = margentHome()): UserTheme | null {
  const file = join(home, 'theme.css');
  let css: string;
  try {
    css = readFileSync(file, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null;
    throw new Error(`${file}: cannot read the theme: ${e.message}`);
  }
  const theme = { file, css };
  assertThemeSafe(theme);
  return theme;
}

// A theme holding "</style" would close the page's style element: it fails with that text's line (spec U2.3).
export function assertThemeSafe(theme: UserTheme): void {
  const at = theme.css.search(/<\/style/i);
  if (at === -1) return;
  throw new RenderError(theme.file, theme.css.slice(0, at).split('\n').length, 'theme.css must not contain "</style"');
}
