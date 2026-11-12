import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MapleConfig } from '@shared/types/config/mapleConfig';
import type { TabState } from '@shared/types/tabs/tabState';
import { findWorktrees } from '@main/git/findWorktrees';
import { fakeSpawn, type FakePty } from '@main/testing/fakeSpawn';
import { SessionManager } from './SessionManager';
import { tmuxArgs } from './tmux';
import { watchWorktrees } from '@main/git/worktreeWatcher';

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
};

const vaultConfig: MapleConfig = { ...config, vaultDir: '/tmp/vault' };

const JIRA_ENV = { JIRA_SITE: 'https://x.atlassian.net', JIRA_EMAIL: 'me@example.com', JIRA_TOKEN: 'tok-1' };

function setup(
  closedSessions: Record<string, string> = {},
  hasTranscript: (id: string) => boolean = () => true,
  cfg: MapleConfig = config,
) {
  const ptys: FakePty[] = [];
  let n = 0;
  const save = vi.fn<(tabs: TabState[], closed: Record<string, string>) => Promise<void>>(() => Promise.resolve());
  const spawnFn = fakeSpawn(ptys);
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const endTmux = vi.fn<(name: string | null) => void>();
  const manager = new SessionManager({
    spawn: spawnFn,
    config: () => cfg,
    hooksFile: '/tmp/maple/hooksFile.json',
    socketPath: '/tmp/maple.sock',
    snapshotRoot: '/tmp/maple/snapshots',
    findingsDir: '/tmp/maple/findings',
    save,
    closedSessions,
    uuid: () => `uuid-${String(++n)}`,
    hasTranscript,
    tmuxConf: '/tmp/maple/tmux.conf',
    endTmux,
    sessionEnv: JIRA_ENV,
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

function keptTab(kind: TabState['kind'], projectKey: string, cardKey: string | null): TabState {
  return { id: 'old-1', projectKey, kind, cardKey, sessionId: 's-old', worktreePath: null, worktreePaths: [] };
}

const base = ['--dangerously-skip-permissions', '--settings', '/tmp/maple/hooksFile.json'];

function wrapped(tabId: string, claude: string[], cwd = '/tmp/dig-days'): string[] {
  const env = { MAPLE_TAB_ID: tabId, MAPLE_SOCKET: '/tmp/maple.sock' };
  return tmuxArgs(`maple-${tabId}`, '/tmp/maple/tmux.conf', cwd, env, ['claude', ...claude]);
}

function wrappedCard(tabId: string, claude: string[]): string[] {
  const flag = claude.includes('--resume') ? '--resume' : '--session-id';
  const env = {
    MAPLE_TAB_ID: tabId,
    MAPLE_SOCKET: '/tmp/maple.sock',
    MAPLE_SNAPSHOT_DIR: `/tmp/maple/snapshots/${claude[claude.indexOf(flag) + 1]}`,
    MAPLE_FINDINGS_DIR: '/tmp/maple/findings',
  };
  return tmuxArgs(`maple-${tabId}`, '/tmp/maple/tmux.conf', '/tmp/dig-days', env, ['claude', ...claude]);
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
    expect(vi.mocked(spawnFn).mock.calls[0][0]).toBe('tmux');
    expect(ptys[0].args).toEqual(wrappedCard(tab.id, [...base, '--session-id', tab.sessionId, '/card DIG-44']));
    expect(ptys[0].options).toMatchObject({ cwd: '/tmp/dig-days', cols: 120, rows: 40 });
    expect(ptys[0].options.env).toMatchObject({ TERM: 'xterm-256color' });
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

  test('gives a card session its snapshot dir and the vault dir', () => {
    // given
    const { manager, ptys } = setup({}, () => true, vaultConfig);
    // when
    const tab = manager.startCard('DIG', 'DIG-44');
    // then
    const args = ptys[0].args.join(' ');
    expect(args).toContain(`MAPLE_SNAPSHOT_DIR=/tmp/maple/snapshots/${tab.sessionId}`);
    expect(args).toContain('MAPLE_VAULT_DIR=/tmp/vault');
  });

  test.each([
    { name: 'planner', open: (manager: SessionManager) => manager.openPlanner('DIG', null) },
    { name: 'vault', open: (manager: SessionManager) => manager.openVault('DIG', null) },
  ])('gives a $name session no snapshot dir', ({ open }) => {
    // given
    const { manager, ptys } = setup({}, () => true, vaultConfig);
    // when
    open(manager);
    // then
    expect(ptys[0].args.join(' ')).not.toContain('MAPLE_SNAPSHOT_DIR');
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

  test('gives the session the Jira env through the pty env, never the tmux arguments', () => {
    // given
    const { manager, ptys } = setup();
    // when
    manager.openPlanner('DIG', null);
    // then
    expect(ptys[0].options.env).toMatchObject(JIRA_ENV);
    expect(ptys[0].args.join(' ')).not.toContain('tok-1');
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
    expect(ptys[0].args).toEqual(wrappedCard(tab.id, [...base, ...want]));
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
    expect(ptys[1].args).toEqual(wrappedCard(reopened.id, [...base, '--resume', tab.sessionId]));
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
    expect(ptys[1].args).toEqual(
      wrappedCard(tab.id, [...base, '--session-id', fresh?.sessionId ?? '', '/card DIG-44']),
    );
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
    expect(ptys[0].args).toEqual(wrappedCard(tab.id, [...base, '--session-id', 'old-session']));
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
    expect(ptys[1].args).toEqual(wrappedCard(tab.id, [...base, '--resume', tab.sessionId]));
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

  test('every tab list change saves all tabs and closed sessions and emits changed', () => {
    // given
    const { manager, save } = setup({ 'DIG-1': 'old' });
    const changed = vi.fn<(tabs: TabState[]) => void>();
    manager.on('changed', changed);
    // when
    const card = manager.startCard('DIG', 'DIG-44');
    const planner = manager.openPlanner('DIG', null);
    manager.setWorktrees(card.id, ['/tmp/wts/dig-days-dig-44']);
    manager.close(planner.id);
    manager.close(card.id);
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
    manager.keep(kept);
    // when
    const card45 = manager.startCard('DIG', 'DIG-45');
    // then
    expect(save).toHaveBeenLastCalledWith([card45, kept], {});
    // when
    const card44 = manager.startCard('DIG', 'DIG-44');
    // then
    expect(save).toHaveBeenLastCalledWith([card45, card44], {});
  });

  test('holdSaves does not save on release when no tab changed', () => {
    // given
    const { manager, save } = setup();
    const release = manager.holdSaves();
    manager.keep(keptTab('card', 'DIG', 'DIG-44'));
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
    manager.keep(keptTab('card', 'DIG', keptCard));
    // when
    const tab = manager.openCard('DIG', 'DIG-44', resumeId);
    // then
    expect(tab.sessionId).toBe(want);
  });

  test('holdSaves writes the tabs and closed sessions as they are when released', () => {
    // given
    const { manager, save } = setup();
    const card = manager.startCard('DIG', 'DIG-44');
    const planner = manager.openPlanner('DIG', null);
    save.mockClear();
    const release = manager.holdSaves();
    // when
    manager.close(card.id);
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
    manager.keep(kept);
    const card = manager.startCard('DIG', 'DIG-45');
    release();
    // then
    expect(save.mock.calls).toEqual([[[card, kept], {}]]);
  });

  test('keep holds on to a tab when a launch for its card fails', () => {
    // given
    const { manager, save, spawnFn } = setup();
    const kept = keptTab('card', 'DIG', 'DIG-44');
    manager.keep(kept);
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
    const { manager, save } = setup({}, () => true, vaultConfig);
    const kept = keptTab('planner', 'DIG', null);
    manager.keep(kept);
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
    expect(ptys[0].args).toEqual(wrappedCard(tab.id, [...base, '--resume', want]));
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

  test('openVault starts a session in the vault dir', () => {
    // given
    const { manager, ptys } = setup({}, () => true, vaultConfig);
    // when
    const tab = manager.openVault('DIG', null);
    // then
    expect(ptys[0].args).toEqual(wrapped(tab.id, [...base, '--session-id', tab.sessionId], '/tmp/vault'));
    expect(ptys[0].options.cwd).toBe('/tmp/vault');
    expect(tab).toMatchObject({ kind: 'vault', cardKey: null, projectKey: 'DIG' });
  });

  test('openVault with a resume id resumes it in the vault dir', () => {
    // given
    const { manager, ptys } = setup({}, () => true, vaultConfig);
    // when
    const tab = manager.openVault('DIG', 'vault-session');
    // then
    expect(ptys[0].args).toEqual(wrapped(tab.id, [...base, '--resume', 'vault-session'], '/tmp/vault'));
    expect(ptys[0].options.cwd).toBe('/tmp/vault');
  });

  test('openVault returns the open vault tab of the project', () => {
    // given
    const { manager, spawnFn } = setup({}, () => true, vaultConfig);
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
    const { manager } = setup({}, () => true, vaultConfig);
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

  test('startFresh on a vault tab spawns a new session in the vault dir without a prompt', () => {
    // given
    const { manager, ptys } = setup({}, () => true, vaultConfig);
    const tab = manager.openVault('DIG', null);
    // when
    manager.startFresh(tab.id);
    // then
    const sessionId = manager.get(tab.id)?.sessionId ?? '';
    expect(ptys[1].args).toEqual(wrapped(tab.id, [...base, '--session-id', sessionId], '/tmp/vault'));
    expect(ptys[1].options.cwd).toBe('/tmp/vault');
  });

  test('resume on a vault tab throws once the vaultDir is gone', () => {
    // given
    const cfg: MapleConfig = { ...vaultConfig };
    const { manager } = setup({}, () => true, cfg);
    const tab = manager.openVault('DIG', null);
    cfg.vaultDir = null;
    // when
    const resume = () => {
      manager.resume(tab.id);
    };
    // then
    expect(resume).toThrow('starting session: no vaultDir in config');
  });

  test('close on a vault tab saves no closed session', () => {
    // given
    const { manager, save } = setup({}, () => true, vaultConfig);
    const tab = manager.openVault('DIG', null);
    // when
    manager.close(tab.id);
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

  test.each([
    { kind: 'card', open: (m: SessionManager) => m.startCard('DIG', 'DIG-44') },
    { kind: 'vault', open: (m: SessionManager) => m.openVault('DIG', null) },
  ])('$kind output never emits batch', ({ open }) => {
    // given
    const { manager, ptys } = setup({}, () => true, vaultConfig);
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
    manager.close(tab.id);
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
    manager.close(tab.id);
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
