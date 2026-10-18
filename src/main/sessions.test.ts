import type { IPty, spawn } from 'node-pty';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MapleConfig, TabState } from '@shared/types';
import { findWorktree } from './git';
import { SessionManager } from './sessions';
import { watchWorktrees } from './worktreeWatcher';

vi.mock('./git', () => ({ findWorktree: vi.fn() }));
vi.mock('./worktreeWatcher', () => ({ watchWorktrees: vi.fn() }));

type FakePty = {
  args: string[];
  options: { cwd?: string; cols?: number; rows?: number; env?: Record<string, string | undefined> };
  written: string[];
  killed: boolean;
  emitData: (data: string) => void;
  emitExit: (exitCode: number) => void;
};

const config: MapleConfig = {
  worktreesDir: '/tmp/wts',
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
      resize: vi.fn(),
      kill: () => {
        fake.killed = true;
      },
    };
    return pty as unknown as IPty;
  });
}

function setup(closedSessions: Record<string, string> = {}) {
  const ptys: FakePty[] = [];
  let n = 0;
  const save = vi.fn<(tabs: TabState[], closed: Record<string, string>) => Promise<void>>(() => Promise.resolve());
  const spawnFn = fakeSpawn(ptys);
  const manager = new SessionManager({
    spawn: spawnFn,
    config: () => config,
    hooksFile: '/tmp/maple/hooksFile.json',
    socketPath: '/tmp/maple.sock',
    save,
    closedSessions,
    uuid: () => `uuid-${String(++n)}`,
  });
  return { manager, ptys, save, spawnFn };
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
    expect(vi.mocked(spawnFn).mock.calls[0][0]).toBe('claude');
    expect(ptys[0].args).toEqual([...base, '--session-id', tab.sessionId, '/card DIG-44']);
    expect(ptys[0].options).toMatchObject({ cwd: '/tmp/dig-days', cols: 120, rows: 40 });
    expect(ptys[0].options.env).toMatchObject({
      MAPLE_TAB_ID: tab.id,
      MAPLE_SOCKET: '/tmp/maple.sock',
      TERM: 'xterm-256color',
    });
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
    manager.openCard('DIG', 'DIG-44', resumeId);
    // then
    expect(ptys[0].args).toEqual([...base, ...want]);
  });

  test('close then openCard resumes the closed session', () => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    manager.close(tab.id);
    // when
    manager.openCard('DIG', 'DIG-44', null);
    // then
    expect(ptys[0].killed).toBe(true);
    expect(ptys[1].args).toEqual([...base, '--resume', tab.sessionId]);
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
    expect(ptys[1].args).toEqual([...base, '--session-id', fresh?.sessionId, '/card DIG-44']);
    expect(save).toHaveBeenLastCalledWith([fresh], {});
  });

  test('startFresh on a planner tab spawns a new session without a prompt', () => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.openPlanner('DIG', null);
    // when
    manager.startFresh(tab.id);
    // then
    expect(ptys[1].args).toEqual([...base, '--session-id', manager.get(tab.id)?.sessionId]);
  });

  test('resume respawns the tab with its session id', () => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    ptys[0].emitExit(1);
    // when
    manager.resume(tab.id);
    // then
    expect(ptys[1].args).toEqual([...base, '--resume', tab.sessionId]);
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
    expect(ptys[0].args).toEqual([...base, '--resume', want]);
    expect(tab.sessionId).toBe(want);
  });

  test('openPlanner with a resume id resumes it in the planner dir', () => {
    // given
    const { manager, ptys } = setup();
    // when
    const tab = manager.openPlanner('HALO', 'planner-session');
    // then
    expect(ptys[0].args).toEqual([...base, '--resume', 'planner-session']);
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

  test('a worktree found on the first check stops the watch', async () => {
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
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
