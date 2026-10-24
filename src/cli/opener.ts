// Opens a page in the default browser (spec R4). BROWSER overrides the platform opener; tests set BROWSER=true.
// `margent doctor` (spec R7) reads the same command, without launching it.
import { spawnSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

// The command that opens a page: BROWSER when set, else the platform opener.
export function openerCommand(): string {
  if (process.env.BROWSER) return process.env.BROWSER;
  if (process.platform === 'darwin') return 'open';
  if (process.platform === 'win32') return 'cmd';
  return 'xdg-open';
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// Whether the opener command resolves: a path with a slash is checked as given (as spawn does), a bare name is searched on PATH.
export function openerResolves(command: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (command.includes('/')) return isExecutable(command);
  return (env.PATH ?? '')
    .split(delimiter)
    .some((dir) => dir !== '' && isExecutable(join(dir, command)));
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
