// Finds a command the way spawn would run it, for `findChrome` and the `doctor` opener check. platform and env are
// parameters, so tests cover Windows lookups on any OS. On win32, env names are matched in any case (as Windows does),
// and a name is tried with .com and .exe appended (cmd finds cmd.exe), the only files spawn starts without a shell.
import { accessSync, constants, statSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';

// What spawn (libuv) appends to a name on win32. It never reads PATHEXT, and Node refuses to spawn a .bat or .cmd
// without a shell, so a .cmd on PATH (code.cmd) would pass a PATHEXT lookup and then fail to start.
const SPAWN_EXTS = ['.com', '.exe'];

// A file that can be run: a directory passes X_OK too (and on Windows X_OK only checks that the path exists).
export function isExecutable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
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

// The files that running `base` may mean, as spawn looks for them. On win32 that is base itself when it ends in .com
// or .exe, then base with .com and .exe appended; elsewhere just base.
function candidates(base: string, platform: NodeJS.Platform): string[] {
  if (platform !== 'win32') return [base];
  const own = SPAWN_EXTS.includes(win32.extname(base).toLowerCase()) ? [base] : [];
  return [...own, ...SPAWN_EXTS.map((ext) => base + ext)];
}

function firstExecutable(base: string, platform: NodeJS.Platform): string | null {
  return candidates(base, platform).find(isExecutable) ?? null;
}

// The first executable for a bare name on PATH, or null. PATH is split by the given platform's delimiter; entries are
// joined with this machine's separator, since the files are on this machine.
export function findOnPath(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string | null {
  const delimiter = platform === 'win32' ? win32.delimiter : posix.delimiter;
  for (const raw of (envValue(env, 'PATH', platform) ?? '').split(delimiter)) {
    // Windows PATH entries may be quoted ("C:\Program Files\x").
    const dir = platform === 'win32' ? raw.replace(/^"(.*)"$/, '$1') : raw;
    if (dir === '') continue;
    const found = firstExecutable(join(dir, name), platform);
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
  return isPath ? firstExecutable(command, platform) : findOnPath(command, env, platform);
}
