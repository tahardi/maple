import { describe, expect, test, vi } from 'vitest';
import { fakeRunner } from '@main/testing/fakeRunner';
import { endTmux, tmuxArgs, writeTmuxConf } from './tmux';

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
  test('writes a conf into the VM that hides the status bar, frees Ctrl+B, and carries no Jira variables', async () => {
    // given
    const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 });
    const runner = fakeRunner({ exec });

    // when
    const path = await writeTmuxConf(runner, '/home/dev');

    // then
    expect(path).toBe('/home/dev/.xena/maple-tmux.conf');
    const [command, { input }] = exec.mock.calls[0] as [string[], { input: string }];
    expect(command).toEqual([
      'sh',
      '-c',
      'mkdir -p "$(dirname "$1")" && cat > "$1"',
      'sh',
      '/home/dev/.xena/maple-tmux.conf',
    ]);
    for (const line of [
      'set -g status off',
      'set -g prefix None',
      'unbind C-b',
      'set -g escape-time 0',
      "set -ga terminal-overrides ',xterm-256color:smcup@:rmcup@'",
    ]) {
      expect(input).toContain(line);
    }
    expect(input).not.toContain('JIRA');
  });
});

describe('writeTmuxConf errors', () => {
  test('throws the stderr when the conf cannot be written', async () => {
    // given
    const runner = fakeRunner({ exec: vi.fn().mockResolvedValue({ stdout: '', stderr: 'denied\n', code: 1 }) });

    // when
    const written = writeTmuxConf(runner, '/home/dev');

    // then
    await expect(written).rejects.toThrow('writing tmux conf: denied');
  });
});

describe('endTmux', () => {
  test('ends one tab session on the VM tmux server', async () => {
    // given
    const exec = vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 });
    const runner = fakeRunner({ exec });

    // when
    await endTmux(runner, 'maple-t1');

    // then
    expect(exec).toHaveBeenCalledWith(['tmux', '-L', 'maple', 'kill-session', '-t', 'maple-t1']);
  });

  test.each([
    { name: 'a missing session', stderr: "can't find session: maple-t1", code: 1 },
    { name: 'no tmux server', stderr: 'no server running on /tmp/tmux-1000/maple', code: 1 },
  ])('stays quiet about $name', async ({ stderr, code }) => {
    // given
    const runner = fakeRunner({ exec: vi.fn().mockResolvedValue({ stdout: '', stderr, code }) });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    // when
    await endTmux(runner, 'maple-t1', logger);

    // then
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: 'exits non-zero',
      exec: vi.fn().mockResolvedValue({ stdout: '', stderr: 'Connection closed', code: 255 }),
      error: 'Connection closed',
    },
    { name: 'rejects', exec: vi.fn().mockRejectedValue(new Error('timing out')), error: 'timing out' },
  ])('logs a kill-session that $name and still resolves', async ({ exec, error }) => {
    // given
    const runner = fakeRunner({ exec });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    // when
    const ended = endTmux(runner, 'maple-t1', logger);

    // then
    await expect(ended).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('session', 'failed', { operation: 'endTmux', name: 'maple-t1', error });
  });
});
