import { errorText } from '@shared/errors/errorText';
import { appLogger, type Logger } from '@main/app/log/log';
import type { Runner } from '@main/remote/runner';
import { vmTmuxConf } from '@main/remote/vmPaths';

const CONF = [
  'set -g status off',
  'set -g prefix None',
  'unbind C-b',
  'set -g escape-time 0',
  "set -ga terminal-overrides ',xterm-256color:smcup@:rmcup@'",
];

export function tmuxArgs(
  name: string,
  conf: string,
  cwd: string,
  env: Record<string, string>,
  command: string[],
): string[] {
  const vars = Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
  return ['-L', 'maple', '-f', conf, 'new-session', '-A', '-s', name, '-c', cwd, ...vars, ...command];
}

export async function writeTmuxConf(runner: Runner, home: string): Promise<string> {
  const path = vmTmuxConf(home);
  const command = ['sh', '-c', 'mkdir -p "$(dirname "$1")" && cat > "$1"', 'sh', path];
  const result = await runner.exec(command, { input: `${CONF.join('\n')}\n` });
  if (result.code !== 0) {
    throw new Error(`writing tmux conf: ${result.stderr.trim()}`);
  }
  return path;
}

const GONE = /can't find session|no server running/;

export async function endTmux(runner: Runner, name: string, logger: Logger = appLogger): Promise<void> {
  const failed = (error: string): void => {
    logger.warn('session', 'failed', { operation: 'endTmux', name, error });
  };

  try {
    const result = await runner.exec(['tmux', '-L', 'maple', 'kill-session', '-t', name]);
    if (result.code !== 0 && !GONE.test(result.stderr)) {
      failed(result.stderr.trim());
    }
  } catch (err) {
    failed(errorText(err));
  }
}
