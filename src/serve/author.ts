// Who signs new notes in `margent serve` (spec R5.6, decisions 0021 and 0032). `margent doctor` reports the same.
import { execFileSync } from 'node:child_process';

// Why a name cannot sign a note (the note grammar, spec R2), or null when it can. A note is `[c{n}] {author}: {text}`.
function authorProblem(name: string): string | null {
  if (name.trim() === '') return 'the name is empty';
  if (/[:\]\r\n]/.test(name)) return 'the name has ":", "]" or a line break';
  return null;
}

// The name new notes are signed with (decisions 0021, 0032), and where it came from. The option wins and must be
// usable; else `git config user.name` in the served root; else the OS user name (USER, or USERNAME on Windows, or
// LOGNAME), so a machine without git config can still comment. With none usable, author is null and reason says why.
export function resolveAuthor(
  configured: string | undefined,
  root: string
): { author: string | null; source: 'option' | 'git' | 'os'; reason: string } {
  if (configured !== undefined) {
    const problem = authorProblem(configured);
    if (problem !== null) throw new Error(`--author ${JSON.stringify(configured)} is not usable: ${problem}`);
    return { author: configured, source: 'option', reason: '' };
  }
  const git = gitUserName(root);
  if (git.name !== null) return { author: git.name, source: 'git', reason: '' };
  const os = osUserName();
  if (os.name !== null) return { author: os.name, source: 'os', reason: git.reason };
  return { author: null, source: 'os', reason: `${git.reason}, and ${os.reason}` };
}

// `git config user.name` in root, or null and why not.
function gitUserName(root: string): { name: string | null; reason: string } {
  let name: string;
  try {
    name = execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (err) {
    // git config exits 1 when the name is unset. Anything else means git itself could not run.
    if ((err as { status?: number }).status === 1) return { name: null, reason: 'git config user.name is not set' };
    return { name: null, reason: `git could not be run: ${(err as Error).message}` };
  }
  if (name === '') return { name: null, reason: 'git config user.name is empty' };
  const problem = authorProblem(name);
  if (problem !== null) return { name: null, reason: `git config user.name ${JSON.stringify(name)} is not usable: ${problem}` };
  return { name, reason: '' };
}

// The OS user name from the environment, or null and why not.
function osUserName(): { name: string | null; reason: string } {
  for (const key of ['USER', 'USERNAME', 'LOGNAME']) {
    const name = process.env[key]?.trim();
    if (name && authorProblem(name) === null) return { name, reason: '' };
  }
  return { name: null, reason: 'no usable USER, USERNAME or LOGNAME is set' };
}
