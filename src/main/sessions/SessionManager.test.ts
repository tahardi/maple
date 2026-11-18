import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { TabState } from '@shared/types/tabs/tabState';
import { findWorktrees } from '@main/git/findWorktrees';
import { fakeRunnerPty, type FakePty } from '@main/testing/fakeSpawn';
import { SessionManager } from './SessionManager';
import { tmuxArgs } from './tmux';
import { watchWorktrees } from '@main/git/worktreeWatcher';
import { fakeRunner } from '@main/testing/fakeRunner';

vi.mock('@main/git/findWorktrees', () => ({ findWorktrees: vi.fn() }));
vi.mock('@main/git/worktreeWatcher', () => ({ watchWorktrees: vi.fn() }));

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
    { name: 'Halo', jiraKey: 'HALO', jiraBoardId: 2, plannerDir: '/tmp/halo', repo: 'tahardi/halo', otherRepos: [] },
  ],
  actions: [],
  remote: null,
};

const vaultConfig: MapleConfig = { ...config, vaultDir: '/tmp/vault' };

function setup(closedSessions: Record<string, string> = {}, cfg: MapleConfig = config) {
  const ptys: FakePty[] = [];
  let n = 0;
  const save = vi.fn<(tabs: TabState[], closed: Record<string, string>) => Promise<void>>(() => Promise.resolve());
  const spawnFn = fakeRunnerPty(ptys);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const endTmux = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
  const manager = new SessionManager({
    config: () => cfg,
    save,
    closedSessions,
    uuid: () => `uuid-${String(++n)}`,
    tmuxConf: '/home/dev/.xena/maple-tmux.conf',
    endTmux,
    logger,
    runner: fakeRunner({ spawnPty: spawnFn }),
    home: '/home/dev',
  });
  return { manager, ptys, save, spawnFn, logger, endTmux };
}

async function fresh(manager: SessionManager, tab: TabState): Promise<TabState> {
  await manager.startFresh(tab.id);
  return tab;
}

function resumed(manager: SessionManager, tab: TabState): TabState {
  manager.resume(tab.id);
  return tab;
}

function keptTab(kind: TabState['kind'], projectKey: string, cardKey: string | null): TabState {
  return { id: 'old-1', projectKey, kind, cardKey, sessionId: 's-old', worktreePath: null, worktreePaths: [] };
}

const base = ['--dangerously-skip-permissions'];

const TMUX_CONF = '/home/dev/.xena/maple-tmux.conf';

function wrapped(tabId: string, claude: string[], cwd = '/tmp/dig-days'): string[] {
  return ['tmux', ...tmuxArgs(`maple-${tabId}`, TMUX_CONF, cwd, { MAPLE_TAB_ID: tabId }, ['claude', ...claude])];
}

function wrappedCard(tabId: string, claude: string[]): string[] {
  const env = { MAPLE_TAB_ID: tabId, MAPLE_FINDINGS_DIR: '/home/dev/.local/state/maple/findings' };
  return ['tmux', ...tmuxArgs(`maple-${tabId}`, TMUX_CONF, '/tmp/dig-days', env, ['claude', ...claude])];
}

function spawned(pty: FakePty): string[] {
  return [pty.file, ...pty.args];
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.mocked(findWorktrees).mockReset().mockResolvedValue([]);
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
    expect(spawned(ptys[0])).toEqual(wrappedCard(tab.id, [...base, '--session-id', tab.sessionId, '/card DIG-44']));
    expect(ptys[0].options).toEqual({ cwd: '/tmp/dig-days', cols: 120, rows: 40, env: {} });
  });

  test('sessionOf finds the session of an open card, a closed card, and no card', () => {
    // given
    const { manager } = setup({ 'DIG-7': 'closed-session' });
    const tab = manager.startCard('DIG', 'DIG-44');
    // when
    const got = ['DIG-44', 'DIG-7', 'DIG-8'].map((key) => manager.sessionOf(key));
    // then
    expect(got).toEqual([tab.sessionId, 'closed-session', null]);
  });

  test.each([
    { name: 'planner', open: (manager: SessionManager) => manager.openPlanner('DIG', null) },
    { name: 'vault', open: (manager: SessionManager) => manager.openVault('DIG', null) },
  ])('gives a $name session no snapshot dir', ({ open }) => {
    // given
    const { manager, ptys } = setup({}, vaultConfig);
    // when
    open(manager);
    // then
    expect(ptys[0].args.join(' ')).not.toContain('MAPLE_SNAPSHOT_DIR');
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
  ])('$name emits spawn with prompted $prompted and resumes $resumes', async ({ open, prompted, resumes }) => {
    // given
    const { manager } = setup();
    const onSpawn = vi.fn();
    manager.on('spawn', onSpawn);
    // when
    const tab = await open(manager);
    // then
    expect(onSpawn).toHaveBeenLastCalledWith(tab.id, prompted, resumes);
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
    expect(spawned(ptys[0])).toEqual(wrappedCard(tab.id, [...base, ...want]));
  });

  test('close then openCard resumes the closed session', async () => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    await manager.close(tab.id);
    // when
    const reopened = manager.openCard('DIG', 'DIG-44', null);
    // then
    expect(ptys[0].killed).toBe(true);
    expect(spawned(ptys[1])).toEqual(wrappedCard(reopened.id, [...base, '--resume', tab.sessionId]));
  });

  test('startFresh on a card tab spawns a new session with the card prompt', async () => {
    // given
    const { manager, ptys, save } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    // when
    await manager.startFresh(tab.id);
    // then
    const fresh = manager.get(tab.id);
    expect(fresh?.sessionId).not.toBe(tab.sessionId);
    expect(spawned(ptys[1])).toEqual(
      wrappedCard(tab.id, [...base, '--session-id', fresh?.sessionId ?? '', '/card DIG-44']),
    );
    expect(save).toHaveBeenLastCalledWith([fresh], {});
  });

  test('startFresh on a planner tab spawns a new session without a prompt', async () => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.openPlanner('DIG', null);
    // when
    await manager.startFresh(tab.id);
    // then
    expect(spawned(ptys[1])).toEqual(wrapped(tab.id, [...base, '--session-id', manager.get(tab.id)?.sessionId ?? '']));
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
    expect(spawned(ptys[1])).toEqual(wrappedCard(tab.id, [...base, '--resume', tab.sessionId]));
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
    { name: 'Esc', key: '\x1b' },
    { name: 'Ctrl+C', key: '\x03' },
  ])('write of $name emits interrupt', ({ key }) => {
    // given
    const { manager } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    const interrupt = vi.fn();
    manager.on('interrupt', interrupt);
    // when
    manager.write(tab.id, key);
    // then
    expect(interrupt).toHaveBeenCalledWith(tab.id);
  });

  test('other keystrokes do not emit interrupt', () => {
    // given
    const { manager } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    const interrupt = vi.fn();
    manager.on('interrupt', interrupt);
    // when
    manager.write(tab.id, 'a');
    manager.write(tab.id, '\x1b[A');
    manager.write(tab.id, '\x1ba');
    // then
    expect(interrupt).not.toHaveBeenCalled();
  });

  test('Esc after the session exits does not emit interrupt', () => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    ptys[0].emitExit(1);
    const interrupt = vi.fn();
    manager.on('interrupt', interrupt);
    // when
    manager.write(tab.id, '\x1b');
    // then
    expect(interrupt).not.toHaveBeenCalled();
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

  test('every tab list change saves all tabs and closed sessions and emits changed', async () => {
    // given
    vi.mocked(findWorktrees).mockReturnValue(new Promise(() => undefined));
    const { manager, save } = setup({ 'DIG-1': 'old' });
    const changed = vi.fn<(tabs: TabState[]) => void>();
    manager.on('changed', changed);
    // when
    const card = manager.startCard('DIG', 'DIG-44');
    const planner = manager.openPlanner('DIG', null);
    manager.setWorktrees(card.id, ['/tmp/wts/dig-days-dig-44']);
    await manager.close(planner.id);
    await manager.close(card.id);
    // then
    const withWorktree = {
      ...card,
      worktreePath: '/tmp/wts/dig-days-dig-44',
      worktreePaths: ['/tmp/wts/dig-days-dig-44'],
    };
    expect(save.mock.calls).toEqual([
      [[card], { 'DIG-1': 'old' }],
      [[card, planner], { 'DIG-1': 'old' }],
      [[withWorktree, planner], { 'DIG-1': 'old' }],
      [[withWorktree], { 'DIG-1': 'old' }],
      [[], { 'DIG-1': 'old', 'DIG-44': card.sessionId }],
    ]);
    expect(changed.mock.calls.map(([tabs]) => tabs)).toEqual(save.mock.calls.map(([tabs]) => tabs));
  });

  test('holdSaves saves nothing until released, then saves every tab once', () => {
    // given
    const { manager, save } = setup();
    const changed = vi.fn<(tabs: TabState[]) => void>();
    manager.on('changed', changed);
    const release = manager.holdSaves();
    // when
    const card = manager.startCard('DIG', 'DIG-44');
    const planner = manager.openPlanner('DIG', null);
    // then
    expect(save).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(2);
    // when
    release();
    // then
    expect(save.mock.calls).toEqual([[[card, planner], {}]]);
  });

  test('keep adds a tab to every save until a tab for its card opens', () => {
    // given
    const { manager, save } = setup();
    const kept = keptTab('card', 'DIG', 'DIG-44');
    manager.keep(kept, 'starting session: spawn failed');
    // when
    const card45 = manager.startCard('DIG', 'DIG-45');
    // then
    expect(save).toHaveBeenLastCalledWith([card45, kept], {});
    // when
    const card44 = manager.startCard('DIG', 'DIG-44');
    // then
    expect(save).toHaveBeenLastCalledWith([card45, card44], {});
  });

  test.each([
    { kind: 'planner', cardKey: null, open: (m: SessionManager) => m.openPlanner('DIG', null) },
    { kind: 'card', cardKey: 'DIG-44', open: (m: SessionManager) => m.openCard('DIG', 'DIG-44', null) },
    { kind: 'vault', cardKey: null, open: (m: SessionManager) => m.openVault('DIG', null) },
  ] as const)('a kept $kind tab leaves the kept list once it reopens', ({ kind, cardKey, open }) => {
    // given
    const { manager } = setup({}, vaultConfig);
    manager.keep(keptTab(kind, 'DIG', cardKey), 'project DIG is not in config');
    // when
    open(manager);
    // then
    expect(manager.keptTabs()).toEqual([]);
  });

  test('discardKept drops the kept tab and saves', () => {
    // given
    const { manager, save } = setup();
    const kept = keptTab('card', 'DIG', 'DIG-44');
    manager.keep(kept, 'starting session: spawn failed');
    // when
    manager.discardKept(kept.id);
    // then
    expect(save).toHaveBeenLastCalledWith([], {});
    expect(manager.keptTabs()).toEqual([]);
  });

  test('holdSaves does not save on release when no tab changed', () => {
    // given
    const { manager, save } = setup();
    const release = manager.holdSaves();
    manager.keep(keptTab('card', 'DIG', 'DIG-44'), 'starting session: spawn failed');
    // when
    release();
    // then
    expect(save).not.toHaveBeenCalled();
  });

  test('holdSaves forgets changes from an earlier hold', () => {
    // given
    const { manager, save } = setup();
    const first = manager.holdSaves();
    manager.startCard('DIG', 'DIG-44');
    first();
    save.mockClear();
    const second = manager.holdSaves();
    // when
    second();
    // then
    expect(save).not.toHaveBeenCalled();
  });

  test.each([
    { name: 'the kept session over a closed one', keptCard: 'DIG-44', resumeId: null, want: 's-old' },
    { name: 'a given session over the kept one', keptCard: 'DIG-44', resumeId: 'given', want: 'given' },
    { name: 'the closed session when another card is kept', keptCard: 'DIG-45', resumeId: null, want: 'closed' },
  ])('openCard resumes $name', ({ keptCard, resumeId, want }) => {
    // given
    const { manager } = setup({ 'DIG-44': 'closed' });
    manager.keep(keptTab('card', 'DIG', keptCard), 'starting session: spawn failed');
    // when
    const tab = manager.openCard('DIG', 'DIG-44', resumeId);
    // then
    expect(tab.sessionId).toBe(want);
  });

  test('holdSaves writes the tabs and closed sessions as they are when released', async () => {
    // given
    const { manager, save } = setup();
    const card = manager.startCard('DIG', 'DIG-44');
    const planner = manager.openPlanner('DIG', null);
    save.mockClear();
    const release = manager.holdSaves();
    // when
    await manager.close(card.id);
    release();
    // then
    expect(save.mock.calls).toEqual([[[planner], { 'DIG-44': card.sessionId }]]);
  });

  test('holdSaves includes kept tabs in the save on release', () => {
    // given
    const { manager, save } = setup();
    const kept = keptTab('card', 'DIG', 'DIG-44');
    const release = manager.holdSaves();
    // when
    manager.keep(kept, 'starting session: spawn failed');
    const card = manager.startCard('DIG', 'DIG-45');
    release();
    // then
    expect(save.mock.calls).toEqual([[[card, kept], {}]]);
  });

  test('keep holds on to a tab when a launch for its card fails', () => {
    // given
    const { manager, save, spawnFn } = setup();
    const kept = keptTab('card', 'DIG', 'DIG-44');
    manager.keep(kept, 'starting session: spawn failed');
    const card = manager.startCard('DIG', 'DIG-45');
    vi.mocked(spawnFn).mockImplementationOnce(() => {
      throw new Error('starting session: spawn failed');
    });
    // when
    expect(() => manager.startCard('DIG', 'DIG-44')).toThrow('starting session: spawn failed');
    manager.setWorktrees(card.id, []);
    // then
    expect(save).toHaveBeenLastCalledWith([card, kept], {});
  });

  test.each([
    { name: 'a vault tab in the same project', open: (m: SessionManager) => m.openVault('DIG', null) },
    { name: 'a planner tab in another project', open: (m: SessionManager) => m.openPlanner('HALO', null) },
  ])('keep holds on to a planner tab when $name opens', ({ open }) => {
    // given
    const { manager, save } = setup({}, vaultConfig);
    const kept = keptTab('planner', 'DIG', null);
    manager.keep(kept, 'starting session: spawn failed');
    // when
    const tab = open(manager);
    // then
    expect(save).toHaveBeenLastCalledWith([tab, kept], {});
  });

  test('startCard sets the worktrees once findWorktrees finds them', async () => {
    // given
    let onChange: () => void = () => undefined;
    vi.mocked(watchWorktrees).mockImplementation((_dir, cb) => {
      onChange = cb;
      return () => undefined;
    });
    vi.mocked(findWorktrees).mockResolvedValueOnce([]).mockResolvedValueOnce(['/tmp/wts/dig-days-dig-44']);
    const { manager } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    await vi.waitFor(() => {
      expect(findWorktrees).toHaveBeenCalledTimes(1);
    });
    // when
    onChange();
    // then
    await vi.waitFor(() => {
      expect(manager.get(tab.id)?.worktreePath).toBe('/tmp/wts/dig-days-dig-44');
    });
    expect(findWorktrees).toHaveBeenCalledWith('/tmp/wts', 'DIG-44');
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
    expect(spawned(ptys[0])).toEqual(wrappedCard(tab.id, [...base, '--resume', want]));
    expect(tab.sessionId).toBe(want);
  });

  test('openPlanner with a resume id resumes it in the planner dir', () => {
    // given
    const { manager, ptys } = setup();
    // when
    const tab = manager.openPlanner('HALO', 'planner-session');
    // then
    expect(spawned(ptys[0])).toEqual(wrapped(tab.id, [...base, '--resume', 'planner-session'], '/tmp/halo'));
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

  test('openVault starts a session in the VM home', () => {
    // given
    const { manager, ptys } = setup({}, vaultConfig);
    // when
    const tab = manager.openVault('DIG', null);
    // then
    expect(spawned(ptys[0])).toEqual(wrapped(tab.id, [...base, '--session-id', tab.sessionId], '/home/dev'));
    expect(ptys[0].options.cwd).toBe('/home/dev');
    expect(tab).toMatchObject({ kind: 'vault', cardKey: null, projectKey: 'DIG' });
  });

  test('openVault with a resume id resumes it in the VM home', () => {
    // given
    const { manager, ptys } = setup({}, vaultConfig);
    // when
    const tab = manager.openVault('DIG', 'vault-session');
    // then
    expect(spawned(ptys[0])).toEqual(wrapped(tab.id, [...base, '--resume', 'vault-session'], '/home/dev'));
    expect(ptys[0].options.cwd).toBe('/home/dev');
  });

  test('openVault returns the open vault tab of the project', () => {
    // given
    const { manager, spawnFn } = setup({}, vaultConfig);
    const first = manager.openVault('DIG', null);
    // when
    const again = manager.openVault('DIG', null);
    const halo = manager.openVault('HALO', null);
    // then
    expect(again.id).toBe(first.id);
    expect(halo.id).not.toBe(first.id);
    expect(spawnFn).toHaveBeenCalledTimes(2);
  });

  test('openVault without a vaultDir throws and spawns nothing', () => {
    // given
    const { manager, spawnFn, save } = setup();
    // when
    const open = () => manager.openVault('DIG', null);
    // then
    expect(open).toThrow('opening vault: no vaultDir in config');
    expect(spawnFn).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  test('openLearning returns the existing learning tab', () => {
    // given
    const { manager, spawnFn, ptys } = setup({}, vaultConfig);
    const first = manager.openLearning('DIG', null);
    // when
    const again = manager.openLearning('DIG', null);
    // then
    expect(again.id).toBe(first.id);
    expect(first).toMatchObject({ kind: 'learning', cardKey: null, projectKey: 'DIG' });
    expect(ptys[0].options.cwd).toBe('/home/dev');
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  test('openLearning starts a new learning tab with the prompt', () => {
    // given
    const { manager, ptys } = setup({}, vaultConfig);
    // when
    const tab = manager.openLearning('DIG', null, null, '/learn Learning/Security/xss.md');
    // then
    expect(ptys[0].args.slice(-3)).toEqual(['--session-id', tab.sessionId, '/learn Learning/Security/xss.md']);
  });

  test('openLearning throws without a vaultDir', () => {
    // given
    const { manager, spawnFn, save } = setup();
    // when
    const open = () => manager.openLearning('DIG', null);
    // then
    expect(open).toThrow('opening learning: no vaultDir in config');
    expect(spawnFn).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  test('openCard that fails to launch leaves no tab behind', () => {
    // given
    const { manager } = setup();
    // when
    const open = () => manager.openCard('NOPE', 'NOPE-1', null);
    // then
    expect(open).toThrow('starting session: unknown project NOPE');
    expect(open).toThrow('starting session: unknown project NOPE');
    expect(manager.list()).toEqual([]);
  });

  test('openVault and openPlanner keep separate tabs in one project', () => {
    // given
    const { manager } = setup({}, vaultConfig);
    const planner = manager.openPlanner('DIG', null);
    const vault = manager.openVault('DIG', null);
    // when
    const plannerAgain = manager.openPlanner('DIG', null);
    const vaultAgain = manager.openVault('DIG', null);
    // then
    expect(plannerAgain.id).toBe(planner.id);
    expect(vaultAgain.id).toBe(vault.id);
    expect(vault.id).not.toBe(planner.id);
  });

  test('startFresh on a vault tab spawns a new session in the VM home without a prompt', async () => {
    // given
    const { manager, ptys } = setup({}, vaultConfig);
    const tab = manager.openVault('DIG', null);
    // when
    await manager.startFresh(tab.id);
    // then
    const sessionId = manager.get(tab.id)?.sessionId ?? '';
    expect(spawned(ptys[1])).toEqual(wrapped(tab.id, [...base, '--session-id', sessionId], '/home/dev'));
    expect(ptys[1].options.cwd).toBe('/home/dev');
  });

  test('close on a vault tab saves no closed session', async () => {
    // given
    const { manager, save } = setup({}, vaultConfig);
    const tab = manager.openVault('DIG', null);
    // when
    await manager.close(tab.id);
    // then
    expect(save).toHaveBeenLastCalledWith([], {});
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
        return Promise.resolve();
      },
    },
    {
      name: 'startFresh',
      restart: (m: SessionManager, id: string) => m.startFresh(id),
    },
  ])('$name kills the old pty and ignores its late exit', async ({ restart }) => {
    // given
    const { manager, ptys } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    const exit = vi.fn();
    manager.on('exit', exit);
    // when
    await restart(manager, tab.id);
    ptys[0].emitExit(0);
    // then
    expect(ptys[0].killed).toBe(true);
    expect(exit).not.toHaveBeenCalled();
    expect(manager.isAlive(tab.id)).toBe(true);
  });

  test.each([
    { kind: 'card', open: (m: SessionManager) => m.startCard('DIG', 'DIG-44') },
    { kind: 'vault', open: (m: SessionManager) => m.openVault('DIG', null) },
  ])('$kind output never emits batch', ({ open }) => {
    // given
    const { manager, ptys } = setup({}, vaultConfig);
    open(manager);
    const batch = vi.fn();
    manager.on('batch', batch);
    // when
    ptys[0].emitData('MAPLE-BATCH: DIG-1\r\n');
    // then
    expect(batch).not.toHaveBeenCalled();
  });

  test.each([
    { before: [], after: ['/wts/a'], selected: null, want: '/wts/a' },
    { before: ['/wts/a'], after: ['/wts/b', '/wts/a'], selected: '/wts/a', want: '/wts/b' },
    { before: ['/wts/b', '/wts/a'], after: ['/wts/b', '/wts/a'], selected: '/wts/a', want: '/wts/a' },
    { before: ['/wts/b', '/wts/a'], after: ['/wts/b'], selected: '/wts/a', want: '/wts/b' },
    { before: ['/wts/a'], after: [], selected: '/wts/a', want: null },
    { before: ['/wts/b', '/wts/a'], after: ['/wts/a', '/wts/b'], selected: '/wts/b', want: '/wts/b' },
  ])(
    'setWorktrees selects $want when the list goes from $before to $after with $selected selected',
    ({ before, after, selected, want }) => {
      // given
      vi.mocked(findWorktrees).mockReturnValue(new Promise(() => undefined));
      const { manager } = setup();
      const tab = manager.startCard('DIG', 'DIG-44');
      manager.setWorktrees(tab.id, before);
      if (selected !== null) {
        manager.selectWorktree(tab.id, selected);
      }
      // when
      manager.setWorktrees(tab.id, after);
      // then
      expect(manager.get(tab.id)?.worktreePath).toBe(want);
      expect(manager.get(tab.id)?.worktreePaths).toEqual(after);
    },
  );

  test("selectWorktree selects a worktree from the tab's list and saves it", () => {
    // given
    vi.mocked(findWorktrees).mockReturnValue(new Promise(() => undefined));
    const { manager, save } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    manager.setWorktrees(tab.id, ['/wts/b', '/wts/a']);
    // when
    manager.selectWorktree(tab.id, '/wts/a');
    // then
    expect(manager.get(tab.id)?.worktreePath).toBe('/wts/a');
    expect(save).toHaveBeenLastCalledWith(
      [{ ...tab, worktreePath: '/wts/a', worktreePaths: ['/wts/b', '/wts/a'] }],
      {},
    );
  });

  test('logs a selected worktree', () => {
    // given
    vi.mocked(findWorktrees).mockReturnValue(new Promise(() => undefined));
    const { manager, logger } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    manager.setWorktrees(tab.id, ['/wts/b', '/wts/a']);
    // when
    manager.selectWorktree(tab.id, '/wts/a');
    // then
    expect(logger.info).toHaveBeenCalledWith('worktree', 'selected', { cardKey: 'DIG-44', path: '/wts/a' });
  });

  test("selectWorktree rejects a path that is not one of the tab's worktrees", () => {
    // given
    vi.mocked(findWorktrees).mockReturnValue(new Promise(() => undefined));
    const { manager } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    manager.setWorktrees(tab.id, ['/wts/a']);
    // when
    const select = () => {
      manager.selectWorktree(tab.id, '/etc');
    };
    // then
    expect(select).toThrow('selecting worktree: /etc is not a worktree of DIG-44');
    expect(manager.get(tab.id)?.worktreePath).toBe('/wts/a');
  });

  test('close stops watching for the worktree', async () => {
    // given
    const stop = vi.fn();
    vi.mocked(watchWorktrees).mockReturnValue(stop);
    const { manager } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    await vi.waitFor(() => {
      expect(findWorktrees).toHaveBeenCalledTimes(1);
    });
    // when
    await manager.close(tab.id);
    // then
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test('a found worktree keeps the watch running', async () => {
    // given
    const stop = vi.fn();
    vi.mocked(watchWorktrees).mockReturnValue(stop);
    vi.mocked(findWorktrees).mockResolvedValue(['/tmp/wts/dig-days-dig-44']);
    const { manager } = setup();
    // when
    const tab = manager.startCard('DIG', 'DIG-44');
    // then
    await vi.waitFor(() => {
      expect(manager.get(tab.id)?.worktreePath).toBe('/tmp/wts/dig-days-dig-44');
    });
    expect(stop).not.toHaveBeenCalled();
  });

  test('clears the worktrees once they are removed', async () => {
    // given
    let onChange: () => void = () => undefined;
    vi.mocked(watchWorktrees).mockImplementation((_dir, cb) => {
      onChange = cb;
      return () => undefined;
    });
    vi.mocked(findWorktrees).mockResolvedValueOnce(['/tmp/wts/dig-days-dig-44']).mockResolvedValueOnce([]);
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

  test('keeps the worktrees when a later lookup fails', async () => {
    // given
    let onChange: () => void = () => undefined;
    vi.mocked(watchWorktrees).mockImplementation((_dir, cb) => {
      onChange = cb;
      return () => undefined;
    });
    vi.mocked(findWorktrees)
      .mockResolvedValueOnce(['/tmp/wts/dig-days-dig-44'])
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
    vi.mocked(findWorktrees).mockResolvedValue(['/tmp/wts/dig-days-dig-44']);
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
      expect(findWorktrees).toHaveBeenCalledTimes(2);
    });
    expect(save).toHaveBeenCalledTimes(saves);
  });

  test('sets the worktrees again when they come back', async () => {
    // given
    let onChange: () => void = () => undefined;
    vi.mocked(watchWorktrees).mockImplementation((_dir, cb) => {
      onChange = cb;
      return () => undefined;
    });
    vi.mocked(findWorktrees)
      .mockResolvedValueOnce(['/tmp/wts/dig-days-dig-44'])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['/tmp/wts/dig-days-dig-44-again']);
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
    let resolve: (paths: string[]) => void = () => undefined;
    vi.mocked(findWorktrees).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const { manager, save } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    await manager.close(tab.id);
    const saves = save.mock.calls.length;
    // when
    resolve(['/tmp/wts/dig-days-dig-44']);
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

  test('logs the length of a sent prompt but never its text', () => {
    // given
    const { manager, logger } = setup();
    const tab = manager.openPlanner('DIG', null);
    const text = 'secret plan ' + 'x'.repeat(88);
    // when
    manager.sendPrompt(tab.id, text);
    // then
    expect(logger.info).toHaveBeenCalledWith('session', 'prompt sent', { tabId: tab.id, length: text.length });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('secret plan');
  });

  test('logs a found worktree', async () => {
    // given
    vi.mocked(findWorktrees).mockResolvedValue(['/tmp/wts/dig-days-dig-44']);
    const { manager, logger } = setup();
    // when
    manager.startCard('DIG', 'DIG-44');
    // then
    await vi.waitFor(() => {
      expect(logger.info).toHaveBeenCalledWith('worktree', 'found', {
        cardKey: 'DIG-44',
        paths: ['/tmp/wts/dig-days-dig-44'],
      });
    });
  });

  test('logs a failed worktree lookup at warn', async () => {
    // given
    vi.mocked(findWorktrees).mockRejectedValue(new Error('listing worktrees: denied'));
    const { manager, logger } = setup();
    // when
    manager.startCard('DIG', 'DIG-44');
    // then
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalledWith('worktree', 'failed', {
        operation: 'findWorktrees',
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

  test('startFresh ends the old tmux session before spawning', async () => {
    // given
    const { manager, spawnFn, endTmux } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    // when
    await manager.startFresh(tab.id);
    // then
    expect(endTmux).toHaveBeenCalledWith(`maple-${tab.id}`);
    expect(endTmux.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(spawnFn).mock.invocationCallOrder[1]);
  });

  test('resume reattaches without ending the tmux session', () => {
    // given
    const { manager, spawnFn, endTmux } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    // when
    manager.resume(tab.id);
    // then
    expect(spawnFn).toHaveBeenCalledTimes(2);
    expect(endTmux).not.toHaveBeenCalled();
  });

  test('close ends the tab tmux session', async () => {
    // given
    const { manager, endTmux } = setup();
    const tab = manager.startCard('DIG', 'DIG-44');
    // when
    await manager.close(tab.id);
    // then
    expect(endTmux).toHaveBeenCalledWith(`maple-${tab.id}`);
  });

  test('killAll leaves the tmux sessions running', () => {
    // given
    const { manager, ptys, endTmux } = setup();
    manager.startCard('DIG', 'DIG-44');
    // when
    manager.killAll();
    // then
    expect(ptys[0].killed).toBe(true);
    expect(endTmux).not.toHaveBeenCalled();
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
