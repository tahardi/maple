import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CONF = [
  'set -g status off',
  'set -g prefix None',
  'unbind C-b',
  'set -g escape-time 0',
  "set -ga terminal-overrides ',xterm-256color:smcup@:rmcup@'",
  'set -ga update-environment JIRA_SITE',
  'set -ga update-environment JIRA_EMAIL',
  'set -ga update-environment JIRA_TOKEN',
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

export async function writeTmuxConf(dir: string): Promise<string> {
  const path = join(dir, 'tmux.conf');
  await mkdir(dir, { recursive: true });
  await writeFile(path, `${CONF.join('\n')}\n`);
  return path;
}

export function endTmux(name: string | null): void {
  const args = name === null ? ['kill-server'] : ['kill-session', '-t', name];
  try {
    execFileSync('tmux', ['-L', 'maple', ...args], { stdio: 'ignore' });
  } catch {
    return;
  }
}
