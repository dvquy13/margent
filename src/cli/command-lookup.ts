// Finds a command the way the OS would run it, for `findChrome` and the `doctor` opener check. platform and env are
// parameters, so tests cover Windows lookups on any OS. On win32, env names are matched in any case (as Windows does)
// and a name is tried with each PATHEXT extension (cmd finds cmd.exe).
import { accessSync, constants } from 'node:fs';
import { delimiter, join, win32 } from 'node:path';

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

export function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// The value of env var `name`. Windows env names are case-insensitive (ProgramFiles, PROGRAMFILES), and a copied env
// object loses that, so on win32 the first key that matches in any case wins.
export function envValue(env: NodeJS.ProcessEnv, name: string, platform: NodeJS.Platform): string | undefined {
  if (env[name] !== undefined || platform !== 'win32') return env[name];
  const upper = name.toUpperCase();
  const key = Object.keys(env).find((k) => k.toUpperCase() === upper);
  return key === undefined ? undefined : env[key];
}

// The files that running `base` may mean. On win32 that is base itself when it has an extension, then base with each
// PATHEXT extension appended; elsewhere just base.
function candidates(base: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  if (platform !== 'win32') return [base];
  const exts = (envValue(env, 'PATHEXT', platform) || DEFAULT_PATHEXT).split(';').filter((e) => e !== '');
  return [...(win32.extname(base) ? [base] : []), ...exts.map((ext) => base + ext)];
}

function firstExecutable(base: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string | null {
  return candidates(base, env, platform).find(isExecutable) ?? null;
}

// The first executable for a bare name on PATH, or null.
export function findOnPath(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string | null {
  for (const raw of (envValue(env, 'PATH', platform) ?? '').split(delimiter)) {
    // Windows PATH entries may be quoted ("C:\Program Files\x").
    const dir = platform === 'win32' ? raw.replace(/^"(.*)"$/, '$1') : raw;
    if (dir === '') continue;
    const found = firstExecutable(join(dir, name), env, platform);
    if (found) return found;
  }
  return null;
}

// The executable a command runs, or null. A path (a slash, a backslash on win32, or absolute) is checked as given, as
// spawn does; a bare name is searched on PATH.
export function resolveCommand(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string | null {
  const isPath =
    command.includes('/') || (platform === 'win32' && (command.includes('\\') || win32.isAbsolute(command)));
  return isPath ? firstExecutable(command, env, platform) : findOnPath(command, env, platform);
}
