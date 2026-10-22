import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { tmuxArgs, writeTmuxConf } from './tmux';

describe('tmuxArgs', () => {
  test('wraps the command in a reattachable session on the maple server', () => {
    // given
    const env = { MAPLE_TAB_ID: 'tab-1', MAPLE_SOCKET: '/tmp/maple.sock' };
    // when
    const args = tmuxArgs('maple-tab-1', '/tmp/maple/tmux.conf', '/tmp/dig', env, ['claude', '--resume', 's-1']);
    // then
    expect(args).toEqual([
      '-L',
      'maple',
      '-f',
      '/tmp/maple/tmux.conf',
      'new-session',
      '-A',
      '-s',
      'maple-tab-1',
      '-c',
      '/tmp/dig',
      '-e',
      'MAPLE_TAB_ID=tab-1',
      '-e',
      'MAPLE_SOCKET=/tmp/maple.sock',
      'claude',
      '--resume',
      's-1',
    ]);
  });
});

describe('writeTmuxConf', () => {
  let dir = '';

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'maple-tmux-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('writes a conf that hides the status bar, frees Ctrl+B, and passes the Jira env into sessions', async () => {
    // given
    const want = [
      'set -g status off',
      'set -g prefix None',
      'unbind C-b',
      'set -g escape-time 0',
      "set -ga terminal-overrides ',xterm-256color:smcup@:rmcup@'",
      'set -ga update-environment JIRA_SITE',
      'set -ga update-environment JIRA_EMAIL',
      'set -ga update-environment JIRA_TOKEN',
    ];
    // when
    const path = await writeTmuxConf(dir);
    // then
    expect(path).toBe(join(dir, 'tmux.conf'));
    const lines = (await readFile(path, 'utf8')).split('\n');
    for (const line of want) {
      expect(lines).toContain(line);
    }
  });
});
