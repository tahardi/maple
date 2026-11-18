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
  await runner.exec(command, { input: `${CONF.join('\n')}\n` });
  return path;
}

export async function endTmux(runner: Runner, name: string): Promise<void> {
  await runner.exec(['tmux', '-L', 'maple', 'kill-session', '-t', name]).catch(() => undefined);
}
