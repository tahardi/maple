import { afterEach, describe, expect, test, vi } from 'vitest';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { TabState } from '@shared/types/tabs/tabState';
import { fakeSpawn, type FakePty } from '@main/testing/fakeSpawn';
import { tmuxArgs } from '../tmux';
import { ClaudeProcesses } from './ClaudeProcesses';

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
};

const base = ['--dangerously-skip-permissions', '--settings', '/tmp/maple/hooksFile.json'];

function tab(kind: TabState['kind'], projectKey = 'DIG'): TabState {
  const cardKey = kind === 'card' ? 'DIG-44' : null;
  return { id: 't1', projectKey, kind, cardKey, sessionId: 's1', worktreePath: null, worktreePaths: [] };
}

function setup(hasTranscript = true, current: MapleConfig = config) {
  const ptys: FakePty[] = [];
  const spawnFn = fakeSpawn(ptys);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const endTmux = vi.fn<(name: string | null) => void>();
  const processes = new ClaudeProcesses({
    spawn: spawnFn,
    config: () => current,
    hooksFile: '/tmp/maple/hooksFile.json',
    socketPath: '/tmp/maple.sock',
    snapshotRoot: '/tmp/maple/snapshots',
    findingsDir: '/tmp/maple/findings',
    hasTranscript: () => hasTranscript,
    tmuxConf: '/tmp/maple/tmux.conf',
    endTmux,
    sessionEnv: { JIRA_SITE: 'https://x.atlassian.net' },
    logger,
  });
  return { processes, ptys, spawnFn, logger, endTmux };
}

describe('ClaudeProcesses', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('launch spawns claude in tmux with the hooks settings, a new session id, and the prompt', () => {
    // given
    const { processes, ptys, spawnFn } = setup();
    const spawned = vi.fn();
    processes.on('spawn', spawned);
    // when
    processes.launch(tab('card'), { resume: false, prompt: '/card DIG-44' });
    // then
    const env = {
      MAPLE_TAB_ID: 't1',
      MAPLE_SOCKET: '/tmp/maple.sock',
      MAPLE_SNAPSHOT_DIR: '/tmp/maple/snapshots/s1',
      MAPLE_FINDINGS_DIR: '/tmp/maple/findings',
    };
    const claude = ['claude', ...base, '--session-id', 's1', '/card DIG-44'];
    expect(vi.mocked(spawnFn).mock.calls[0][0]).toBe('tmux');
    expect(ptys[0].args).toEqual(tmuxArgs('maple-t1', '/tmp/maple/tmux.conf', '/tmp/dig-days', env, claude));
    expect(ptys[0].options).toMatchObject({ cwd: '/tmp/dig-days', cols: 120, rows: 40 });
    expect(ptys[0].options.env).toMatchObject({ TERM: 'xterm-256color', JIRA_SITE: 'https://x.atlassian.net' });
    expect(spawned).toHaveBeenCalledWith('t1', true, false);
    expect(processes.isAlive('t1')).toBe(true);
  });

  test.each([
    { exists: 'exists', hasTranscript: true, flag: '--resume' },
    { exists: 'is missing', hasTranscript: false, flag: '--session-id' },
  ])('launch with resume uses $flag when the transcript $exists', ({ hasTranscript, flag }) => {
    // given
    const { processes, ptys } = setup(hasTranscript);
    // when
    processes.launch(tab('planner'), { resume: true, prompt: null });
    // then
    expect(ptys[0].args.join(' ')).toContain(`${flag} s1`);
  });

  test.each([
    { kind: 'card' as const, want: '/tmp/maple/findings' },
    { kind: 'learning' as const, want: '/tmp/maple/findings' },
    { kind: 'vault' as const, want: undefined },
  ])('launch gives MAPLE_FINDINGS_DIR to a $kind tab: $want', ({ kind, want }) => {
    // given
    const { processes, ptys } = setup(true, { ...config, vaultDir: '/tmp/vault' });
    // when
    processes.launch(tab(kind), { resume: false, prompt: null });
    // then
    const assignments = ptys[0].args.filter((arg) => arg.startsWith('MAPLE_FINDINGS_DIR='));
    expect(assignments).toEqual(want === undefined ? [] : [`MAPLE_FINDINGS_DIR=${want}`]);
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
    'launch on a $kind tab starts in the vaultDir',
    ({ kind }) => {
      // given
      const { processes, ptys } = setup(true, { ...config, vaultDir: '/tmp/vault' });
      // when
      processes.launch(tab(kind), { resume: false, prompt: null });
      // then
      expect(ptys[0].options.cwd).toBe('/tmp/vault');
    },
  );

  test('launch on a vault tab without a vaultDir throws', () => {
    // given
    const { processes } = setup();
    // when
    const launch = () => {
      processes.launch(tab('vault'), { resume: false, prompt: null });
    };
    // then
    expect(launch).toThrow('starting session: no vaultDir in config');
  });

  test('launch again kills the old pty and ends its tmux session', () => {
    // given
    const { processes, ptys, spawnFn, endTmux } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    // when
    processes.launch(tab('card'), { resume: true, prompt: null });
    // then
    expect(ptys[0].killed).toBe(true);
    expect(endTmux).toHaveBeenCalledWith('maple-t1');
    expect(endTmux.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(spawnFn).mock.invocationCallOrder[1]);
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

  test('kill kills the pty and ends the tab tmux session', () => {
    // given
    const { processes, ptys, endTmux } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    ptys[0].emitData('hello');
    // when
    processes.kill('t1');
    // then
    expect(ptys[0].killed).toBe(true);
    expect(endTmux).toHaveBeenCalledWith('maple-t1');
    expect(processes.isAlive('t1')).toBe(false);
    expect(processes.backlog('t1')).toBe('');
  });

  test('killAll ends the tmux server', () => {
    // given
    const { processes, ptys, endTmux } = setup();
    processes.launch(tab('card'), { resume: false, prompt: null });
    // when
    processes.killAll();
    // then
    expect(ptys[0].killed).toBe(true);
    expect(endTmux).toHaveBeenCalledWith(null);
  });
});
