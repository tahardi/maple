import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { errorText } from '@shared/errors/errorText';
import { COMMAND_TIMEOUT_MS } from '@main/util/commandTimeout';

const execFileAsync = promisify(execFile);
export const NO_FSMONITOR = ['-c', 'core.fsmonitor=false'];

export async function runGit(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', [...NO_FSMONITOR, ...args], {
      cwd,
      env: { ...process.env, ...env },
      maxBuffer: 64 * 1024 * 1024,
      timeout: COMMAND_TIMEOUT_MS,
    });
    return stdout;
  } catch (err) {
    const reason = isKilled(err) ? `timing out after ${String(COMMAND_TIMEOUT_MS)}ms` : errorText(err);
    throw new Error(`running git ${args.join(' ')}: ${reason}`, {
      cause: err,
    });
  }
}

function isKilled(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'killed' in err && err.killed === true;
}

export function splitZ(output: string): string[] {
  return output.split('\0').filter((part) => part !== '');
}

export async function showOrNull(worktree: string, base: string, path: string): Promise<Buffer | null> {
  try {
    const { stdout } = await execFileAsync('git', [...NO_FSMONITOR, 'show', `${base}:${path}`], {
      cwd: worktree,
      encoding: 'buffer',
      maxBuffer: 64 * 1024 * 1024,
      timeout: COMMAND_TIMEOUT_MS,
    });
    return stdout;
  } catch {
    return null;
  }
}
