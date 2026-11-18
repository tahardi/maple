import { afterEach, describe, expect, test, vi } from 'vitest';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { TabState } from '@shared/types/tabs/tabState';
import { fakeRunnerPty, type FakePty } from '@main/testing/fakeSpawn';
import { tmuxArgs } from '../tmux';
import { ClaudeProcesses } from './ClaudeProcesses';
import { fakeRunner } from '@main/testing/fakeRunner';

const config: MapleConfig = {
  worktreesDir: '/tmp/wts',
  vaultDir: null,
  notifications: true,
  backgroundWaitMinutes: 15,
  eventKeepDays: 365,
  eventMaxMegabytes: 200,
  stateBackups: 3,
  startAtOnce: 4,
  startGapSeconds: 90,
  maxWorking: 8,
  maxLoadPerCore: 0.8,
  minFreeMegabytes: 2048,
  projects: [
    {
      name: 'Dig Days',
      jiraKey: 'DIG',
      jiraBoardId: 1,
      plannerDir: '/tmp/dig-days',
      repo: 'tahardi/dig-days',
      otherRepos: [],
    },
  ],
  actions: [],
  remote: null,
};

const base = ['--dangerously-skip-permissions'];

function tab(kind: TabState['kind'], projectKey = 'DIG'): TabState {
  const cardKey = kind === 'card' ? 'DIG-44' : null;
  return { id: 't1', projectKey, kind, cardKey, sessionId: 's1', worktreePath: null, worktreePaths: [] };
}

function setup(current: MapleConfig = config) {
  const ptys: FakePty[] = [];
  const spawnFn = fakeRunnerPty(ptys);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const endTmux = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
  const reconnect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const processes = new ClaudeProcesses({
    config: () => current,
    reconnect,
    tmuxConf: '/home/dev/.xena/maple-tmux.conf',
    endTmux,
    runner: fakeRunner({ spawnPty: spawnFn }),
    home: '/home/dev',
    logger,
  });
  return { processes, ptys, spawnFn, logger, endTmux, reconnect };
}

describe('ClaudeProcesses', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('launch spawns claude in tmux on the VM with a new session id and the prompt', () => {
    // given
    const { processes, ptys, spawnFn } = setup();
    const spawned = vi.fn();
    processes.on('spawn', spawned);
    // when
    processes.launch(tab('card'), { resume: false, prompt: '/card DIG-44' });
    // then
    const env = { MAPLE_TAB_ID: 't1', MAPLE_FINDINGS_DIR: '/home/dev/.local/state/maple/findings' };
    const claude = ['claude', ...base, '--session-id', 's1', '/card DIG-44'];
    expect(vi.mocked(spawnFn).mock.calls[0][0]).toEqual([
      'tmux',
      ...tmuxArgs('maple-t1', '/home/dev/.xena/maple-tmux.conf', '/tmp/dig-days', env, claude),
    ]);
    expect(ptys[0].options).toEqual({ cwd: '/tmp/dig-days', cols: 120, rows: 40, env: {} });
    expect(spawned).toHaveBeenCalledWith('t1', true, false);
    expect(processes.isAlive('t1')).toBe(true);
  });

  test('launch with resume always passes --resume', () => {
    // given
    const { processes, ptys, spawnFn } = setup();
    const spawned = vi.fn();
    processes.on('spawn', spawned);
    // when
    processes.launch(tab('planner'), { resume: true, prompt: null });
    // then
    expect(ptys[0].args.slice(-2)).toEqual(['--resume', 's1']);
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(spawned).toHaveBeenCalledWith('t1', false, true);
  });

  test.each([
    { kind: 'card' as const, want: '/home/dev/.local/state/maple/findings' },
    { kind: 'learning' as const, want: '/home/dev/.local/state/maple/findings' },
    { kind: 'vault' as const, want: undefined },
  ])('launch gives MAPLE_FINDINGS_DIR to a $kind tab: $want', ({ kind, want }) => {
    // given
    const { processes, ptys } = setup({ ...config, vaultDir: '/tmp/vault' });
    // when
    processes.launch(tab(kind), { resume: false, prompt: null });
    // then
    const assignments = ptys[0].args.filter((arg) => arg.startsWith('MAPLE_FINDINGS_DIR='));
    expect(assignments).toEqual(want === undefined ? [] : [`MAPLE_FINDINGS_DIR=${want}`]);
  });

  test('launch gives no session the snapshot dir, the vault dir, or the hook socket', () => {
    // given
    const { processes, ptys } = setup({ ...config, vaultDir: '/tmp/vault' });
    // when
    processes.launch(tab('card'), { resume: false, prompt: null });
    // then
    const joined = ptys[0].args.join(' ');
    for (const name of ['MAPLE_SNAPSHOT_DIR', 'MAPLE_VAULT_DIR', 'MAPLE_SOCKET']) {
      expect(joined).not.toContain(name);
    }
  });

  test('launch for an unknown project throws', () => {
    // given
    const { processes, spawnFn } = setup();
    // when
    const launch = () => {
      processes.launch(tab('card', 'NOPE'), { resume: false, prompt: null });
    };
    // then
    expect(launch).toThrow('starting session: unknown project NOPE');
    expect(spawnFn).not.toHaveBeenCalled();
  });

  test.each([{ kind: 'vault' as const }, { kind: 'learning' as const }])(
    'launch on a $kind tab starts in the VM home',
    ({ kind }) => {
      // given
      const { processes, ptys } = setup({ ...config, vaultDir: '/tmp/vault' });
      // when
      processes.launch(tab(kind), { resume: false, prompt: null });
      // then
      expect(ptys[0].options.cwd).toBe('/home/dev');
    },
  );

  test('launch again kills the old pty and reattaches to the tmux session', () => {
    // given
    const { processes, ptys, endTmux } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    // when
    processes.launch(tab('card'), { resume: true, prompt: null });
    // then
    expect(ptys[0].killed).toBe(true);
    expect(ptys[1].args).toContain('maple-t1');
    expect(endTmux).not.toHaveBeenCalled();
  });

  test('write sends keystrokes and emits input', () => {
    // given
    const { processes, ptys } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    const input = vi.fn();
    const interrupt = vi.fn();
    processes.on('input', input);
    processes.on('interrupt', interrupt);
    // when
    processes.write('t1', 'x');
    // then
    expect(ptys[0].written).toEqual(['x']);
    expect(input).toHaveBeenCalledWith('t1');
    expect(interrupt).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'Esc', key: '\x1b' },
    { name: 'Ctrl+C', key: '\x03' },
  ])('$name emits interrupt', ({ key }) => {
    // given
    const { processes } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    const interrupt = vi.fn();
    processes.on('interrupt', interrupt);
    // when
    processes.write('t1', key);
    // then
    expect(interrupt).toHaveBeenCalledWith('t1');
  });

  test('sendPrompt writes the text, then a carriage return 100 ms later', () => {
    // given
    vi.useFakeTimers();
    const { processes, ptys, logger } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    // when
    processes.sendPrompt('t1', 'hi');
    // then
    expect(ptys[0].written).toEqual(['hi']);
    expect(logger.info).toHaveBeenCalledWith('session', 'prompt sent', { tabId: 't1', length: 2 });
    vi.advanceTimersByTime(99);
    expect(ptys[0].written).toEqual(['hi']);
    vi.advanceTimersByTime(1);
    expect(ptys[0].written).toEqual(['hi', '\r']);
  });

  test('sendPrompt sends no carriage return when the session exits before 100 ms', () => {
    // given
    vi.useFakeTimers();
    const { processes, ptys } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    processes.sendPrompt('t1', 'hi');
    // when
    ptys[0].emitExit(0);
    vi.advanceTimersByTime(100);
    // then
    expect(ptys[0].written).toEqual(['hi']);
  });

  test('resize ignores sizes below 1', () => {
    // given
    const { processes, ptys } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    // when
    processes.resize('t1', 0, 24);
    processes.resize('t1', 80, 0);
    processes.resize('t1', 80, 24);
    // then
    expect(ptys[0].resized).toEqual([[80, 24]]);
  });

  test('write after exit leaves the dead pty alone', () => {
    // given
    const { processes, ptys } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    const exit = vi.fn();
    processes.on('exit', exit);
    ptys[0].emitExit(1);
    // when
    processes.write('t1', 'x');
    // then
    expect(exit).toHaveBeenCalledWith('t1', 1);
    expect(processes.isAlive('t1')).toBe(false);
    expect(ptys[0].written).toEqual([]);
  });

  test('backlog keeps the last 200,000 characters of output', () => {
    // given
    const { processes, ptys } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    const data = vi.fn();
    processes.on('data', data);
    // when
    ptys[0].emitData('a'.repeat(150_000));
    ptys[0].emitData('b'.repeat(100_000));
    // then
    expect(data).toHaveBeenLastCalledWith('t1', 'b'.repeat(100_000));
    expect(processes.backlog('t1')).toBe('a'.repeat(100_000) + 'b'.repeat(100_000));
  });

  test('planner output split across chunks emits batch once', () => {
    // given
    const { processes, ptys } = setup();
    processes.launch(tab('planner'), { resume: false, prompt: null });
    const batch = vi.fn();
    processes.on('batch', batch);
    // when
    ptys[0].emitData('\x1b[32mMAPLE-BATCH: DI');
    ptys[0].emitData('G-1, DIG-2\x1b[0m\r\n');
    // then
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledWith('DIG', ['DIG-1', 'DIG-2']);
  });

  test('exit of a replaced pty emits nothing', () => {
    // given
    const { processes, ptys } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    processes.launch(tab('card'), { resume: true, prompt: null });
    const exit = vi.fn();
    processes.on('exit', exit);
    // when
    ptys[0].emitExit(1);
    // then
    expect(exit).not.toHaveBeenCalled();
    expect(processes.isAlive('t1')).toBe(true);
  });

  test('kill kills the pty and ends the tab tmux session', async () => {
    // given
    const { processes, ptys, endTmux } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    ptys[0].emitData('hello');
    // when
    await processes.kill('t1');
    // then
    expect(ptys[0].killed).toBe(true);
    expect(endTmux).toHaveBeenCalledWith('maple-t1');
    expect(processes.isAlive('t1')).toBe(false);
    expect(processes.backlog('t1')).toBe('');
  });

  test('killAll kills the ptys and leaves the tmux sessions running', () => {
    // given
    const { processes, ptys, endTmux } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    // when
    processes.killAll();
    // then
    expect(ptys[0].killed).toBe(true);
    expect(endTmux).not.toHaveBeenCalled();
  });

  test('an ssh pty that exits with 255 reattaches after five seconds, three times, then reports the exit', async () => {
    // given
    vi.useFakeTimers();
    const { processes, ptys, logger, reconnect } = setup();
    const exit = vi.fn();
    processes.on('exit', exit);
    processes.launch(tab('card'), { resume: false, prompt: '/card DIG-44' });
    // when
    for (let attempt = 1; attempt <= 3; attempt++) {
      ptys[attempt - 1].emitExit(255);
      await vi.advanceTimersByTimeAsync(4999);
      expect(ptys).toHaveLength(attempt);
      await vi.advanceTimersByTimeAsync(1);
      expect(reconnect).toHaveBeenCalledTimes(attempt);
      // then
      expect(ptys).toHaveLength(attempt + 1);
      expect(ptys[attempt].args).toContain('maple-t1');
      expect(ptys[attempt].args.slice(-2)).toEqual(['--resume', 's1']);
      expect(logger.warn).toHaveBeenCalledWith('session', 'ssh lost, reattaching', { tabId: 't1', attempt });
      expect(exit).not.toHaveBeenCalled();
    }
    ptys[3].emitExit(255);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ptys).toHaveLength(4);
    expect(exit).toHaveBeenCalledWith('t1', 255);
    expect(processes.isAlive('t1')).toBe(false);
  });

  test('output from the session resets the reattach count', async () => {
    // given
    vi.useFakeTimers();
    const { processes, ptys } = setup();
    const exit = vi.fn();
    processes.on('exit', exit);
    processes.launch(tab('card'), { resume: false, prompt: null });
    ptys[0].emitExit(255);
    await vi.advanceTimersByTimeAsync(5000);
    ptys[1].emitData('x');
    // when
    for (let i = 1; i <= 3; i++) {
      ptys[i].emitExit(255);
      await vi.advanceTimersByTimeAsync(5000);
    }
    // then
    expect(ptys).toHaveLength(5);
    expect(exit).not.toHaveBeenCalled();
  });

  test('an exit that is not 255 is reported at once', () => {
    // given
    vi.useFakeTimers();
    const { processes, ptys } = setup();
    const exit = vi.fn();
    processes.on('exit', exit);
    processes.launch(tab('card'), { resume: false, prompt: null });
    // when
    ptys[0].emitExit(1);
    vi.advanceTimersByTime(5000);
    // then
    expect(exit).toHaveBeenCalledWith('t1', 1);
    expect(ptys).toHaveLength(1);
  });

  test('kill during a reattach wait cancels the reattach', async () => {
    // given
    vi.useFakeTimers();
    const { processes, ptys } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    ptys[0].emitExit(255);
    // when
    await processes.kill('t1');
    await vi.advanceTimersByTimeAsync(5000);
    // then
    expect(ptys).toHaveLength(1);
  });

  test('killAll during a reattach wait cancels the reattach', async () => {
    // given
    vi.useFakeTimers();
    const { processes, ptys } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    ptys[0].emitExit(255);
    // when
    processes.killAll();
    await vi.advanceTimersByTimeAsync(5000);
    // then
    expect(ptys).toHaveLength(1);
  });

  test('kill while the reconnect waits for a touch cancels the reattach', async () => {
    // given
    vi.useFakeTimers();
    const { processes, ptys, reconnect } = setup();
    let touched: () => void = () => undefined;
    reconnect.mockReturnValue(
      new Promise<void>((resolve) => {
        touched = resolve;
      }),
    );

    processes.launch(tab('card'), { resume: false, prompt: null });
    ptys[0].emitExit(255);
    await vi.advanceTimersByTimeAsync(5000);
    // when
    await processes.kill('t1');
    touched();
    await vi.advanceTimersByTimeAsync(0);
    // then
    expect(ptys).toHaveLength(1);
  });

  test('killAll while the reconnect waits for a touch cancels the reattach', async () => {
    // given
    vi.useFakeTimers();
    const { processes, ptys, reconnect } = setup();
    let touched: () => void = () => undefined;
    reconnect.mockReturnValue(
      new Promise<void>((resolve) => {
        touched = resolve;
      }),
    );

    processes.launch(tab('card'), { resume: false, prompt: null });
    ptys[0].emitExit(255);
    await vi.advanceTimersByTimeAsync(5000);
    // when
    processes.killAll();
    touched();
    await vi.advanceTimersByTimeAsync(0);
    // then
    expect(ptys).toHaveLength(1);
  });

  test('a reconnect that fails is logged and the reattach still runs', async () => {
    // given
    vi.useFakeTimers();
    const { processes, ptys, reconnect, logger } = setup();
    reconnect.mockRejectedValue(new Error('starting ssh master: timing out'));
    processes.launch(tab('card'), { resume: false, prompt: null });
    // when
    ptys[0].emitExit(255);
    await vi.advanceTimersByTimeAsync(5000);
    // then
    expect(logger.warn).toHaveBeenCalledWith('session', 'failed', {
      operation: 'reconnect',
      tabId: 't1',
      error: 'starting ssh master: timing out',
    });
    expect(ptys).toHaveLength(2);
  });

  test('input during a reattach wait does not reach the exited pty', async () => {
    // given
    vi.useFakeTimers();
    const { processes, ptys } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    ptys[0].emitExit(255);
    // when
    processes.write('t1', 'x');
    processes.resize('t1', 80, 24);
    processes.sendPrompt('t1', 'hi');
    await vi.advanceTimersByTimeAsync(100);
    // then
    expect(ptys[0].written).toEqual([]);
    expect(ptys[0].resized).toEqual([]);
  });

  test('a reattach whose project is gone reports the exit instead of throwing', async () => {
    // given
    vi.useFakeTimers();
    const current = { ...config };
    const { processes, ptys, logger } = setup(current);
    const exit = vi.fn();
    processes.on('exit', exit);
    processes.launch(tab('card'), { resume: false, prompt: null });
    current.projects = [];
    // when
    ptys[0].emitExit(255);
    await vi.advanceTimersByTimeAsync(5000);
    // then
    expect(exit).toHaveBeenCalledWith('t1', 255);
    expect(processes.isAlive('t1')).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('session', 'failed', {
      operation: 'reattach',
      tabId: 't1',
      error: 'starting session: unknown project DIG',
    });
  });
});
