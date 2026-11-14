// Opens a page in the default browser (spec R4). BROWSER overrides the platform opener; tests set BROWSER=true.
// `margent doctor` (spec R7) reads the same command, without launching it.
import { spawnSync } from 'node:child_process';
import { resolveCommand } from './command-lookup.js';

// The command that opens a page: BROWSER when set, else the platform opener.
export function openerCommand(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string {
  if (env.BROWSER) return env.BROWSER;
  if (platform === 'darwin') return 'open';
  if (platform === 'win32') return 'cmd';
  return 'xdg-open';
}

// Whether the opener command resolves: a path (a slash, a backslash on win32, or absolute) is checked as given (as
// spawn does), a bare name is searched on PATH, with PATHEXT on win32 (cmd is cmd.exe).
export function openerResolves(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): boolean {
  return resolveCommand(command, env, platform) !== null;
}

export function openInBrowser(path: string): void {
  const command = openerCommand();
  // `start` is a cmd builtin. The title argument is "", so the path is the only quoted argument.
  const windowsShell = !process.env.BROWSER && process.platform === 'win32';
  const args = windowsShell ? ['/c', `start "" "${path}"`] : [path];
  const result = spawnSync(command, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsVerbatimArguments: windowsShell,
  });
  if (result.error) {
    throw new Error(`could not start the browser opener "${command}": ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = result.stderr.toString('utf8').trim();
    const how = result.status === null ? `was killed by ${result.signal}` : `exited with ${result.status}`;
    throw new Error(`the browser opener "${command}" ${how}${stderr ? `: ${stderr}` : ''}`);
  }
}
