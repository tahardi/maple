import type { IPty, spawn } from 'node-pty';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MapleConfig, TabState } from '@shared/types';
import { findWorktree } from './git';
import { SessionManager } from './sessions';
import { tmuxArgs } from './tmux';
import { watchWorktrees } from './worktreeWatcher';

vi.mock('./git', () => ({ findWorktree: vi.fn() }));
vi.mock('./worktreeWatcher', () => ({ watchWorktrees: vi.fn() }));

type FakePty = {
  args: string[];
  options: { cwd?: string; cols?: number; rows?: number; env?: Record<string, string | undefined> };
  written: string[];
  resized: [number, number][];
  killed: boolean;
  emitData: (data: string) => void;
  emitExit: (exitCode: number) => void;
};

const config: MapleConfig = {
  worktreesDir: '/tmp/wts',
  vaultDir: null,
  notifications: true,
  projects: [
    { name: 'Dig Days', jiraKey: 'DIG', jiraBoardId: 1, plannerDir: '/tmp/dig-days' },
    { name: 'Halo', jiraKey: 'HALO', jiraBoardId: 2, plannerDir: '/tmp/halo' },
  ],
  actions: [],
};

function fakeSpawn(ptys: FakePty[]): typeof spawn {
  return vi.fn<typeof spawn>((_file, args, options) => {
    let onData: (data: string) => void = () => undefined;
    let onExit: (e: { exitCode: number }) => void = () => undefined;
    const fake: FakePty = {
      args: typeof args === 'string' ? [args] : args,
      options,
      written: [],
      resized: [],
      killed: false,
      emitData: (data) => {
        onData(data);
      },
      emitExit: (exitCode) => {
        onExit({ exitCode });
      },
    };
    ptys.push(fake);
    const pty = {
      onData: (cb: (data: string) => void) => {
        onData = cb;
        return { dispose: () => undefined };
      },
      onExit: (cb: (e: { exitCode: number }) => void) => {
        onExit = cb;
        return { dispose: () => undefined };
      },
      write: (data: string) => {
        fake.written.push(data);
      },
      resize: (cols: number, rows: number) => {
        fake.resized.push([cols, rows]);
      },
      kill: () => {
        fake.killed = true;
      },
    };
    return pty as unknown as IPty;
  });
}

function setup(closedSessions: Record<string, string> = {}, hasTranscript: (id: string) => boolean = () => true) {
  const ptys: FakePty[] = [];
  let n = 0;
  const save = vi.fn<(tabs: TabState[], closed: Record<string, string>) => Promise<void>>(() => Promise.resolve());
  const spawnFn = fakeSpawn(ptys);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const endTmux = vi.fn<(name: string | null) => void>();
  const manager = new SessionManager({
    spawn: spawnFn,
    config: () => config,
    hooksFile: '/tmp/maple/hooksFile.json',
    socketPath: '/tmp/maple.sock',
    save,
    closedSessions,
    uuid: () => `uuid-${String(++n)}`,
    hasTranscript,
    tmuxConf: '/tmp/maple/tmux.conf',
    endTmux,
    logger,
  });
  return { manager, ptys, save, spawnFn, logger, endTmux };
}

function fresh(manager: SessionManager, tab: TabState): TabState {
  manager.startFresh(tab.id);
  return tab;
}

function resumed(manager: SessionManager, tab: TabState): TabState {
  manager.resume(tab.id);
  return tab;
}

const base = ['--dangerously-skip-permissions', '--settings', '/tmp/maple/hooksFile.json'];

function wrapped(tabId: string, claude: string[], cwd = '/tmp/dig-days'): string[] {
  const env = { MAPLE_TAB_ID: tabId, MAPLE_SOCKET: '/tmp/maple.sock' };
  return tmuxArgs(`maple-${tabId}`, '/tmp/maple/tmux.conf', cwd, env, ['claude', ...claude]);
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.mocked(findWorktree).mockReset().mockResolvedValue(null);
    vi.mocked(watchWorktrees)
      .mockReset()
      .mockReturnValue(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('startCard spawns claude with a new session and the card prompt', () => {
    // given
    const { manager, ptys, spawnFn } = setup();
    // when
    const tab = manager.startCard('DIG', 'DIG-44');
    // then
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(spawnFn).mock.calls[0][0]).toBe('tmux');
    expect(ptys[0].args).toEqual(wrapped(tab.id, [...base, '--session-id', tab.sessionId, '/card DIG-44']));
    expect(ptys[0].options).toMatchObject({ cwd: '/tmp/dig-days', cols: 120, rows: 40 });
    expect(ptys[0].options.env).toMatchObject({ TERM: 'xterm-256color' });
  });

  test('drops CLAUDE_CODE_CHILD_SESSION so claude writes a transcript', () => {
    // given
    vi.stubEnv('CLAUDE_CODE_CHILD_SESSION', '1');
    vi.stubEnv('MAPLE_TEST_KEEP', 'kept');
    const { manager, ptys } = setup();
    // when
    manager.openPlanner('DIG', null);
    // then
    vi.unstubAllEnvs();
    expect(ptys[0].options.env).not.toHaveProperty('CLAUDE_CODE_CHILD_SESSION');
    expect(ptys[0].options.env).toMatchObject({ MAPLE_TEST_KEEP: 'kept' });
  });

  test('logs spawned with the args', () => {
    // given
    const { manager, logger } = setup();
    // when
    const tab = manager.startCard('DIG', 'DIG-44');
    // then
    expect(logger.info).toHaveBeenCalledWith(
      'session',
      'spawned',
      expect.objectContaining({ tabId: tab.id, args: [...base, '--session-id', tab.sessionId, '/card DIG-44'] }),
    );
  });

  test.each([
    { name: 'startCard', open: (m: SessionManager) => m.startCard('DIG', 'DIG-44') },
    { name: 'openCard', open: (m: SessionManager) => m.openCard('DIG', 'DIG-44', null) },
    { name: 'openPlanner', open: (m: SessionManager) => m.openPlanner('DIG', null) },
  ])('$name twice returns the same tab and spawns once', ({ open }) => {
    // given
    const { manager, spawnFn } = setup();
    const first = open(manager);
    // when
    const second = open(manager);
    // then
    expect(second.id).toBe(first.id);
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  test.each([
    { name: 'startCard', open: (m: SessionManager) => m.startCard('DIG', 'DIG-44'), prompted: true, resumes: false },
    {
      name: 'openCard',
      open: (m: SessionManager) => m.openCard('DIG', 'DIG-44', null),
      prompted: false,
      resumes: false,
    },
    {
      name: 'openCard with a resume id',
      open: (m: SessionManager) => m.openCard('DIG', 'DIG-44', 'old'),
      prompted: false,
      resumes: true,
    },
    { name: 'openPlanner', open: (m: SessionManager) => m.openPlanner('DIG', null), prompted: false, resumes: false },
    {
      name: 'startFresh on a card',
      open: (m: SessionManager) => fresh(m, m.startCard('DIG', 'DIG-44')),
      prompted: true,
      resumes: false,
    },
    {
      name: 'startFresh on a planner',
      open: (m: SessionManager) => fresh(m, m.openPlanner('DIG', null)),
      prompted: false,
      resumes: false,
    },
    {
      name: 'resume',
      open: (m: SessionManager) => resumed(m, m.startCard('DIG', 'DIG-44')),
      prompted: false,
      resumes: true,
    },
  ])('$name emits spawn with prompted $prompted and resumes $resumes', ({ open, prompted, resumes }) => {
    // given
    const { manager } = setup();
    const spawned = vi.fn();
    manager.on('spawn', spawned);
    // when
    const tab = open(manager);
    // then
    expect(spawned).toHaveBeenLastCalledWith(tab.id, prompted, resumes);
  });

  test.each([
    { name: 'with a resume id', resumeId: 'old-session', want: ['--resume', 'old-session'] },
    { name: 'without a resume id', resumeId: null, want: ['--session-id', 'uuid-2'] },
  ])('openCard $name spawns without a prompt', ({ resumeId, want }) => {
    // given
    const { manager, ptys } = setup();
    // when
    const tab = manager.openCard('DIG', 'DIG-44', resumeId);
    // then
    expect(ptys[0].args).toEqual(wrapped(tab.id, [...base, ...want]));
  });

  test('close then openCard resumes the closed session', () => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    manager.close(tab.id);
    // when
    const reopened = manager.openCard('DIG', 'DIG-44', null);
    // then
    expect(ptys[0].killed).toBe(true);
    expect(ptys[1].args).toEqual(wrapped(reopened.id, [...base, '--resume', tab.sessionId]));
  });

  test('startFresh on a card tab spawns a new session with the card prompt', () => {
    // given
    const { manager, ptys, save } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    // when
    manager.startFresh(tab.id);
    // then
    const fresh = manager.get(tab.id);
    expect(fresh?.sessionId).not.toBe(tab.sessionId);
    expect(ptys[1].args).toEqual(wrapped(tab.id, [...base, '--session-id', fresh?.sessionId ?? '', '/card DIG-44']));
    expect(save).toHaveBeenLastCalledWith([fresh], {});
  });

  test('startFresh on a planner tab spawns a new session without a prompt', () => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.openPlanner('DIG', null);
    // when
    manager.startFresh(tab.id);
    // then
    expect(ptys[1].args).toEqual(wrapped(tab.id, [...base, '--session-id', manager.get(tab.id)?.sessionId ?? '']));
  });

  test('openCard with a resume id that has no transcript starts that session fresh', () => {
    // given
    const { manager, ptys } = setup({}, () => false);
    const spawned = vi.fn();
    manager.on('spawn', spawned);
    // when
    const tab = manager.openCard('DIG', 'DIG-44', 'old-session');
    // then
    expect(ptys[0].args).toEqual(wrapped(tab.id, [...base, '--session-id', 'old-session']));
    expect(spawned).toHaveBeenCalledWith(tab.id, false, false);
  });

  test('resize and write after the session exits leave the dead pty alone', () => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    ptys[0].emitExit(1);
    // when
    manager.resize(tab.id, 80, 24);
    manager.write(tab.id, 'x');
    manager.sendPrompt(tab.id, 'hi');
    // then
    expect(ptys[0].resized).toEqual([]);
    expect(ptys[0].written).toEqual([]);
  });

  test.each([
    { cols: 0, rows: 24 },
    { cols: 80, rows: 0 },
  ])('resize to $cols x $rows is ignored', ({ cols, rows }) => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    // when
    manager.resize(tab.id, cols, rows);
    // then
    expect(ptys[0].resized).toEqual([]);
  });

  test('resume respawns the tab with its session id', () => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    ptys[0].emitExit(1);
    // when
    manager.resume(tab.id);
    // then
    expect(ptys[1].args).toEqual(wrapped(tab.id, [...base, '--resume', tab.sessionId]));
    expect(manager.isAlive(tab.id)).toBe(true);
  });

  test('sendPrompt writes the text, then a carriage return 100 ms later, and emits input', () => {
    // given
    vi.useFakeTimers();
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    const input = vi.fn();
    manager.on('input', input);
    // when
    manager.sendPrompt(tab.id, 'hi');
    // then
    expect(ptys[0].written).toEqual(['hi']);
    expect(input).toHaveBeenCalledWith(tab.id);
    vi.advanceTimersByTime(99);
    expect(ptys[0].written).toEqual(['hi']);
    vi.advanceTimersByTime(1);
    expect(ptys[0].written).toEqual(['hi', '\r']);
  });

  test('write sends keystrokes and emits input', () => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    const input = vi.fn();
    manager.on('input', input);
    // when
    manager.write(tab.id, 'x');
    // then
    expect(ptys[0].written).toEqual(['x']);
    expect(input).toHaveBeenCalledWith(tab.id);
  });

  test.each([
    {
      name: 'write',
      call: (m: SessionManager) => {
        m.write('missing', 'x');
      },
    },
    {
      name: 'resize',
      call: (m: SessionManager) => {
        m.resize('missing', 80, 24);
      },
    },
    {
      name: 'sendPrompt',
      call: (m: SessionManager) => {
        m.sendPrompt('missing', 'hi');
      },
    },
  ])('$name on an unknown tab does nothing', ({ call }) => {
    // given
    const { manager } = setup();
    const input = vi.fn();
    manager.on('input', input);
    // when
    call(manager);
    // then
    expect(input).not.toHaveBeenCalled();
  });

  test('planner output split across chunks emits batch once', () => {
    // given
    const { manager, ptys } = setup();
    manager.openPlanner('DIG', null);
    const batch = vi.fn();
    manager.on('batch', batch);
    // when
    ptys[0].emitData('\x1b[32mMAPLE-BATCH: DI');
    ptys[0].emitData('G-1, DIG-2\x1b[0m\r\n');
    // then
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledWith('DIG', ['DIG-1', 'DIG-2']);
  });

  test('backlog keeps the last 200,000 characters of output', () => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    const data = vi.fn();
    manager.on('data', data);
    // when
    ptys[0].emitData('a'.repeat(150_000));
    ptys[0].emitData('b'.repeat(100_000));
    // then
    expect(data).toHaveBeenLastCalledWith(tab.id, 'b'.repeat(100_000));
    expect(manager.backlog(tab.id)).toBe('a'.repeat(100_000) + 'b'.repeat(100_000));
  });

  test('pty exit emits exit with the code and marks the tab dead', () => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    const exit = vi.fn();
    manager.on('exit', exit);
    // when
    ptys[0].emitExit(3);
    // then
    expect(exit).toHaveBeenCalledWith(tab.id, 3);
    expect(manager.isAlive(tab.id)).toBe(false);
  });

  test('every tab list change saves all tabs and closed sessions and emits changed', () => {
    // given
    const { manager, save } = setup({ 'DIG-1': 'old' });
    const changed = vi.fn<(tabs: TabState[]) => void>();
    manager.on('changed', changed);
    // when
    const card = manager.startCard('DIG', 'DIG-44');
    const planner = manager.openPlanner('DIG', null);
    manager.setWorktree(card.id, '/tmp/wts/dig-days-dig-44');
    manager.close(planner.id);
    manager.close(card.id);
    // then
    const withWorktree = { ...card, worktreePath: '/tmp/wts/dig-days-dig-44' };
    expect(save.mock.calls).toEqual([
      [[card], { 'DIG-1': 'old' }],
      [[card, planner], { 'DIG-1': 'old' }],
      [[withWorktree, planner], { 'DIG-1': 'old' }],
      [[withWorktree], { 'DIG-1': 'old' }],
      [[], { 'DIG-1': 'old', 'DIG-44': card.sessionId }],
    ]);
    expect(changed.mock.calls.map(([tabs]) => tabs)).toEqual(save.mock.calls.map(([tabs]) => tabs));
  });

  test('startCard sets the worktree once findWorktree finds it', async () => {
    // given
    let onChange: () => void = () => undefined;
    vi.mocked(watchWorktrees).mockImplementation((_dir, cb) => {
      onChange = cb;
      return () => undefined;
    });
    vi.mocked(findWorktree).mockResolvedValueOnce(null).mockResolvedValueOnce('/tmp/wts/dig-days-dig-44');
    const { manager } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    await vi.waitFor(() => {
      expect(findWorktree).toHaveBeenCalledTimes(1);
    });
    // when
    onChange();
    // then
    await vi.waitFor(() => {
      expect(manager.get(tab.id)?.worktreePath).toBe('/tmp/wts/dig-days-dig-44');
    });
    expect(findWorktree).toHaveBeenCalledWith('/tmp/wts', 'DIG-44');
  });

  test.each([
    { name: 'an explicit resume id over a closed session', resumeId: 'explicit', want: 'explicit' },
    { name: 'a closed session from startup state', resumeId: null, want: 'from-state' },
  ])('openCard prefers $name', ({ resumeId, want }) => {
    // given
    const { manager, ptys } = setup({ 'DIG-44': 'from-state' });
    // when
    const tab = manager.openCard('DIG', 'DIG-44', resumeId);
    // then
    expect(ptys[0].args).toEqual(wrapped(tab.id, [...base, '--resume', want]));
    expect(tab.sessionId).toBe(want);
  });

  test('openPlanner with a resume id resumes it in the planner dir', () => {
    // given
    const { manager, ptys } = setup();
    // when
    const tab = manager.openPlanner('HALO', 'planner-session');
    // then
    expect(ptys[0].args).toEqual(wrapped(tab.id, [...base, '--resume', 'planner-session'], '/tmp/halo'));
    expect(ptys[0].options.cwd).toBe('/tmp/halo');
    expect(tab).toMatchObject({ kind: 'planner', cardKey: null, sessionId: 'planner-session' });
  });

  test('openPlanner opens one tab per project', () => {
    // given
    const { manager, spawnFn } = setup();
    const dig = manager.openPlanner('DIG', null);
    // when
    const halo = manager.openPlanner('HALO', null);
    // then
    expect(halo.id).not.toBe(dig.id);
    expect(spawnFn).toHaveBeenCalledTimes(2);
  });

  test('startCard for an unknown project throws', () => {
    // given
    const { manager } = setup();
    // when
    const start = () => manager.startCard('NOPE', 'NOPE-1');
    // then
    expect(start).toThrow('starting session: unknown project NOPE');
  });

  test.each([
    { key: 'DIG', want: true },
    { key: 'NOPE', want: false },
  ])('hasProject $key is $want', ({ key, want }) => {
    // given
    const { manager } = setup();
    // when
    const has = manager.hasProject(key);
    // then
    expect(has).toBe(want);
  });

  test.each([
    {
      name: 'resume',
      restart: (m: SessionManager, id: string) => {
        m.resume(id);
      },
    },
    {
      name: 'startFresh',
      restart: (m: SessionManager, id: string) => {
        m.startFresh(id);
      },
    },
  ])('$name kills the old pty and ignores its late exit', ({ restart }) => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    const exit = vi.fn();
    manager.on('exit', exit);
    // when
    restart(manager, tab.id);
    ptys[0].emitExit(0);
    // then
    expect(ptys[0].killed).toBe(true);
    expect(exit).not.toHaveBeenCalled();
    expect(manager.isAlive(tab.id)).toBe(true);
  });

  test('card output never emits batch', () => {
    // given
    const { manager, ptys } = setup();
    manager.startCard('DIG', 'DIG-44');
    const batch = vi.fn();
    manager.on('batch', batch);
    // when
    ptys[0].emitData('MAPLE-BATCH: DIG-1\r\n');
    // then
    expect(batch).not.toHaveBeenCalled();
  });

  test('close stops watching for the worktree', async () => {
    // given
    const stop = vi.fn();
    vi.mocked(watchWorktrees).mockReturnValue(stop);
    const { manager } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    await vi.waitFor(() => {
      expect(findWorktree).toHaveBeenCalledTimes(1);
    });
    // when
    manager.close(tab.id);
    // then
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test('a found worktree keeps the watch running', async () => {
    // given
    const stop = vi.fn();
    vi.mocked(watchWorktrees).mockReturnValue(stop);
    vi.mocked(findWorktree).mockResolvedValue('/tmp/wts/dig-days-dig-44');
    const { manager } = setup();
    // when
    const tab = manager.startCard('DIG', 'DIG-44');
    // then
    await vi.waitFor(() => {
      expect(manager.get(tab.id)?.worktreePath).toBe('/tmp/wts/dig-days-dig-44');
    });
    expect(stop).not.toHaveBeenCalled();
  });

  test('clears the worktree once it is removed', async () => {
    // given
    let onChange: () => void = () => undefined;
    vi.mocked(watchWorktrees).mockImplementation((_dir, cb) => {
      onChange = cb;
      return () => undefined;
    });
    vi.mocked(findWorktree).mockResolvedValueOnce('/tmp/wts/dig-days-dig-44').mockResolvedValueOnce(null);
    const { manager, logger, save } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    await vi.waitFor(() => {
      expect(manager.get(tab.id)?.worktreePath).toBe('/tmp/wts/dig-days-dig-44');
    });
    // when
    onChange();
    // then
    await vi.waitFor(() => {
      expect(manager.get(tab.id)?.worktreePath).toBeNull();
    });
    expect(save).toHaveBeenLastCalledWith([{ ...tab, worktreePath: null }], {});
    expect(logger.info).toHaveBeenCalledWith('worktree', 'gone', { cardKey: 'DIG-44' });
  });

  test('keeps the worktree when a later lookup fails', async () => {
    // given
    let onChange: () => void = () => undefined;
    vi.mocked(watchWorktrees).mockImplementation((_dir, cb) => {
      onChange = cb;
      return () => undefined;
    });
    vi.mocked(findWorktree)
      .mockResolvedValueOnce('/tmp/wts/dig-days-dig-44')
      .mockRejectedValueOnce(new Error('listing worktrees: denied'));
    const { manager, logger } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    await vi.waitFor(() => {
      expect(manager.get(tab.id)?.worktreePath).toBe('/tmp/wts/dig-days-dig-44');
    });
    // when
    onChange();
    // then
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith('worktree', 'failed', expect.anything());
    });
    expect(manager.get(tab.id)?.worktreePath).toBe('/tmp/wts/dig-days-dig-44');
  });

  test('an unchanged worktree does not save again', async () => {
    // given
    let onChange: () => void = () => undefined;
    vi.mocked(watchWorktrees).mockImplementation((_dir, cb) => {
      onChange = cb;
      return () => undefined;
    });
    vi.mocked(findWorktree).mockResolvedValue('/tmp/wts/dig-days-dig-44');
    const { manager, save } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    await vi.waitFor(() => {
      expect(manager.get(tab.id)?.worktreePath).toBe('/tmp/wts/dig-days-dig-44');
    });
    const saves = save.mock.calls.length;
    // when
    onChange();
    // then
    await vi.waitFor(() => {
      expect(findWorktree).toHaveBeenCalledTimes(2);
    });
    expect(save).toHaveBeenCalledTimes(saves);
  });

  test('sets the worktree again when it comes back', async () => {
    // given
    let onChange: () => void = () => undefined;
    vi.mocked(watchWorktrees).mockImplementation((_dir, cb) => {
      onChange = cb;
      return () => undefined;
    });
    vi.mocked(findWorktree)
      .mockResolvedValueOnce('/tmp/wts/dig-days-dig-44')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('/tmp/wts/dig-days-dig-44-again');
    const { manager } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    await vi.waitFor(() => {
      expect(manager.get(tab.id)?.worktreePath).toBe('/tmp/wts/dig-days-dig-44');
    });
    onChange();
    await vi.waitFor(() => {
      expect(manager.get(tab.id)?.worktreePath).toBeNull();
    });
    // when
    onChange();
    // then
    await vi.waitFor(() => {
      expect(manager.get(tab.id)?.worktreePath).toBe('/tmp/wts/dig-days-dig-44-again');
    });
  });

  test('a lookup that finishes after close changes nothing', async () => {
    // given
    let resolve: (path: string | null) => void = () => undefined;
    vi.mocked(findWorktree).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { manager, save } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    manager.close(tab.id);
    const saves = save.mock.calls.length;
    // when
    resolve('/tmp/wts/dig-days-dig-44');
    await Promise.resolve();
    await Promise.resolve();
    // then
    expect(save).toHaveBeenCalledTimes(saves);
  });

  test('logs exited with the code', () => {
    // given
    const { manager, ptys, logger } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    // when
    ptys[0].emitExit(3);
    // then
    expect(logger.info).toHaveBeenCalledWith('session', 'exited', { tabId: tab.id, code: 3 });
  });

  test('logs spawned with resumed true for a resume', () => {
    // given
    const { manager, logger } = setup();
    // when
    manager.openCard('DIG', 'DIG-44', 'old');
    // then
    expect(logger.info).toHaveBeenCalledWith('session', 'spawned', expect.objectContaining({ resumed: true }));
  });

  test('logs the first 80 characters of a sent prompt', () => {
    // given
    const { manager, logger } = setup();
    const tab = manager.openPlanner('DIG', null);
    // when
    manager.sendPrompt(tab.id, 'x'.repeat(100));
    // then
    expect(logger.info).toHaveBeenCalledWith('session', 'prompt sent', { tabId: tab.id, text: 'x'.repeat(80) });
  });

  test('logs a fresh start when a resume has no transcript', () => {
    // given
    const { manager, logger } = setup({}, () => false);
    // when
    const tab = manager.openCard('DIG', 'DIG-44', 'old');
    // then
    expect(logger.warn).toHaveBeenCalledWith('session', 'no transcript, starting fresh', {
      tabId: tab.id,
      sessionId: 'old',
    });
  });

  test('logs a found worktree', async () => {
    // given
    vi.mocked(findWorktree).mockResolvedValue('/tmp/wts/dig-days-dig-44');
    const { manager, logger } = setup();
    // when
    manager.startCard('DIG', 'DIG-44');
    // then
    await vi.waitFor(() => {
      expect(logger.info).toHaveBeenCalledWith('worktree', 'found', {
        cardKey: 'DIG-44',
        path: '/tmp/wts/dig-days-dig-44',
      });
    });
  });

  test('logs a failed worktree lookup at warn', async () => {
    // given
    vi.mocked(findWorktree).mockRejectedValue(new Error('listing worktrees: denied'));
    const { manager, logger } = setup();
    // when
    manager.startCard('DIG', 'DIG-44');
    // then
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith('worktree', 'failed', {
        operation: 'findWorktree',
        cardKey: 'DIG-44',
        error: 'listing worktrees: denied',
      });
    });
  });

  test('logs a failed worktree watch at warn', () => {
    // given
    vi.mocked(watchWorktrees).mockImplementation(() => {
      throw new Error('watching worktrees: ENOENT');
    });
    const { manager, logger } = setup();
    // when
    manager.startCard('DIG', 'DIG-44');
    // then
    expect(logger.warn).toHaveBeenCalledWith('worktree', 'failed', {
      operation: 'watchWorktrees',
      cardKey: 'DIG-44',
      error: 'watching worktrees: ENOENT',
    });
  });

  test('logs a failed state save at error', async () => {
    // given
    const { manager, save, logger } = setup();
    save.mockRejectedValue(new Error('writing state: disk full'));
    // when
    manager.startCard('DIG', 'DIG-44');
    // then
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith('session', 'failed', {
        operation: 'saveState',
        error: 'writing state: disk full',
      });
    });
  });

  test('names the tmux session after the tab id', () => {
    // given
    const { manager, ptys } = setup();
    // when
    const tab = manager.startCard('DIG', 'DIG-44');
    // then
    const { args } = ptys[0];
    expect(args[args.indexOf('-s') + 1]).toBe(`maple-${tab.id}`);
  });

  test.each([
    {
      name: 'startFresh',
      restart: (m: SessionManager, id: string) => {
        m.startFresh(id);
      },
    },
    {
      name: 'resume',
      restart: (m: SessionManager, id: string) => {
        m.resume(id);
      },
    },
  ])('$name ends the old tmux session before spawning', ({ restart }) => {
    // given
    const { manager, spawnFn, endTmux } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    // when
    restart(manager, tab.id);
    // then
    expect(endTmux).toHaveBeenCalledWith(`maple-${tab.id}`);
    expect(endTmux.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(spawnFn).mock.invocationCallOrder[1]);
  });

  test('close ends the tab tmux session', () => {
    // given
    const { manager, endTmux } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    // when
    manager.close(tab.id);
    // then
    expect(endTmux).toHaveBeenCalledWith(`maple-${tab.id}`);
  });

  test('killAll ends the tmux server', () => {
    // given
    const { manager, endTmux } = setup();
    manager.startCard('DIG', 'DIG-44');
    // when
    manager.killAll();
    // then
    expect(endTmux).toHaveBeenCalledWith(null);
  });

  test.each([
    { name: 'openCard', open: (m: SessionManager) => m.openCard('DIG', 'DIG-44', 's-1', 'tab-9') },
    { name: 'openPlanner', open: (m: SessionManager) => m.openPlanner('DIG', 's-1', 'tab-9') },
  ])('$name with a tab id keeps that id and leaves its tmux session running', ({ open }) => {
    // given
    const { manager, ptys, endTmux } = setup();
    // when
    const tab = open(manager);
    // then
    expect(tab.id).toBe('tab-9');
    expect(ptys[0].args).toContain('MAPLE_TAB_ID=tab-9');
    expect(endTmux).not.toHaveBeenCalled();
  });
});
