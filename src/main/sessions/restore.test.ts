import { describe, expect, test, vi } from 'vitest';
import type { TabState } from '@shared/types/tabs';
import { restoreTabs } from './restore';
import type { SessionManager } from './sessions';
import type { SavedState } from '@main/app/state';

function savedTab(kind: TabState['kind'], projectKey: string, cardKey: string | null, sessionId: string): TabState {
  return { id: `old-${sessionId}`, projectKey, kind, cardKey, sessionId, worktreePath: '/wts/old' };
}

function saved(tabs: TabState[]): SavedState {
  return { version: 1, tabs, closedSessions: {}, notifications: null, zoom: 0, lastProject: null, seen: {} };
}

function fakeSessions(projects: string[]) {
  const opened: TabState[] = [];
  const release = vi.fn();
  const open = (
    projectKey: string,
    kind: TabState['kind'],
    cardKey: string | null,
    sessionId: string | null,
    tabId: string | null,
  ) => {
    const tab: TabState = {
      id: tabId ?? `new-${String(opened.length)}`,
      projectKey,
      kind,
      cardKey,
      sessionId: sessionId ?? 'fresh',
      worktreePath: null,
    };
    opened.push(tab);
    return tab;
  };
  const sessions = {
    holdSaves: vi.fn(() => release),
    keep: vi.fn(),
    hasProject: vi.fn((key: string) => projects.includes(key)),
    openCard: vi.fn((projectKey: string, cardKey: string, id: string | null, tabId: string | null = null) =>
      open(projectKey, 'card', cardKey, id, tabId),
    ),
    openPlanner: vi.fn((projectKey: string, id: string | null, tabId: string | null = null) =>
      open(projectKey, 'planner', null, id, tabId),
    ),
    openVault: vi.fn((projectKey: string, id: string | null, tabId: string | null = null) =>
      open(projectKey, 'vault', null, id, tabId),
    ),
    get: vi.fn((tabId: string): TabState | null => opened.find((t) => t.id === tabId) ?? null),
    setWorktree: vi.fn((tabId: string, path: string) => {
      const tab = opened.find((t) => t.id === tabId);
      if (tab) {
        tab.worktreePath = path;
      }
    }),
  };
  return { sessions, opened, release, manager: sessions as unknown as SessionManager };
}

describe('restoreTabs', () => {
  test('reopens card and planner tabs with their saved session ids', async () => {
    // given
    const { sessions, opened, manager } = fakeSessions(['DIG', 'BEAR']);
    const state = saved([
      savedTab('card', 'DIG', 'DIG-44', 's1'),
      savedTab('planner', 'DIG', null, 's2'),
      savedTab('card', 'BEAR', 'BEAR-12', 's3'),
    ]);
    const findWt = vi.fn((key: string) => Promise.resolve(`/wts/${key.toLowerCase()}`));
    // when
    const result = await restoreTabs(state, manager, findWt);
    // then
    expect(result).toEqual({ restored: 3, warnings: [] });
    expect(sessions.openCard.mock.calls).toEqual([
      ['DIG', 'DIG-44', 's1', 'old-s1'],
      ['BEAR', 'BEAR-12', 's3', 'old-s3'],
    ]);
    expect(sessions.openPlanner.mock.calls).toEqual([['DIG', 's2', 'old-s2']]);
    expect(opened.map((t) => [t.id, t.sessionId, t.worktreePath])).toEqual([
      ['old-s1', 's1', '/wts/dig-44'],
      ['old-s2', 's2', null],
      ['old-s3', 's3', '/wts/bear-12'],
    ]);
  });

  test.each([
    { tab: savedTab('card', 'DIG', 'DIG-44', 's1'), warning: 'dropped DIG-44: project DIG is not in config' },
    { tab: savedTab('planner', 'DIG', null, 's2'), warning: 'dropped DIG planner: project DIG is not in config' },
    { tab: savedTab('vault', 'DIG', null, 's4'), warning: 'dropped DIG vault: project DIG is not in config' },
  ])('drops a $tab.kind tab whose project is gone', async ({ tab, warning }) => {
    // given
    const { sessions, manager } = fakeSessions(['BEAR']);
    const state = saved([tab, savedTab('card', 'BEAR', 'BEAR-12', 's3')]);
    // when
    const result = await restoreTabs(state, manager, () => Promise.resolve(null));
    // then
    expect(result).toEqual({ restored: 1, warnings: [warning] });
    expect(sessions.openCard.mock.calls).toEqual([['BEAR', 'BEAR-12', 's3', 'old-s3']]);
    expect(sessions.openPlanner).not.toHaveBeenCalled();
    expect(sessions.keep).not.toHaveBeenCalled();
  });

  test('reopens a vault tab with its saved session id', async () => {
    // given
    const { sessions, manager } = fakeSessions(['DIG']);
    // when
    const result = await restoreTabs(saved([savedTab('vault', 'DIG', null, 's4')]), manager, () =>
      Promise.resolve(null),
    );
    // then
    expect(result).toEqual({ restored: 1, warnings: [] });
    expect(sessions.openVault.mock.calls).toEqual([['DIG', 's4', 'old-s4']]);
  });

  test('keeps a vault tab when the vault is not configured', async () => {
    // given
    const { sessions, manager } = fakeSessions(['DIG']);
    sessions.openVault.mockImplementation(() => {
      throw new Error('opening vault: no vaultDir in config');
    });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    // when
    const result = await restoreTabs(
      saved([savedTab('vault', 'DIG', null, 's4')]),
      manager,
      () => Promise.resolve(null),
      logger,
    );
    // then
    expect(result).toEqual({
      restored: 0,
      warnings: ['kept DIG vault for the next launch: opening vault: no vaultDir in config'],
    });
    expect(logger.warn).toHaveBeenCalledWith('restore', 'kept', {
      tab: 'DIG vault',
      reason: 'opening vault: no vaultDir in config',
    });
  });

  test('holds saves until every tab is reopened', async () => {
    // given
    const { sessions, release, manager } = fakeSessions(['DIG']);
    const state = saved([
      savedTab('planner', 'DIG', null, 's2'),
      savedTab('vault', 'DIG', null, 's4'),
      savedTab('card', 'DIG', 'DIG-44', 's1'),
    ]);
    // when
    await restoreTabs(state, manager, () => Promise.resolve('/wts/dig-44'));
    // then
    const [held] = sessions.holdSaves.mock.invocationCallOrder;
    const [released] = release.mock.invocationCallOrder;
    const opens = [sessions.openPlanner, sessions.openVault, sessions.openCard].flatMap(
      (open) => open.mock.invocationCallOrder,
    );
    expect(sessions.holdSaves).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(held).toBeLessThan(Math.min(...opens));
    expect(released).toBeGreaterThan(Math.max(...opens, ...sessions.setWorktree.mock.invocationCallOrder));
  });

  test.each([
    { tab: savedTab('card', 'DIG', 'DIG-44', 's1'), method: 'openCard', name: 'DIG-44' },
    { tab: savedTab('planner', 'DIG', null, 's2'), method: 'openPlanner', name: 'DIG planner' },
    { tab: savedTab('vault', 'DIG', null, 's4'), method: 'openVault', name: 'DIG vault' },
  ] as const)('keeps a $tab.kind tab that fails to launch and restores the rest', async ({ tab, method, name }) => {
    // given
    const { sessions, opened, manager } = fakeSessions(['DIG']);
    sessions[method].mockImplementationOnce(() => {
      throw new Error('starting session: spawn failed');
    });
    const state = saved([tab, savedTab('card', 'DIG', 'DIG-45', 's5')]);
    const findWt = vi.fn(() => Promise.resolve('/wts/dig-45'));
    // when
    const result = await restoreTabs(state, manager, findWt);
    // then
    expect(result).toEqual({
      restored: 1,
      warnings: [`kept ${name} for the next launch: starting session: spawn failed`],
    });
    expect(sessions.keep.mock.calls).toEqual([[tab]]);
    expect(opened.map((t) => t.cardKey)).toEqual(['DIG-45']);
    expect(findWt.mock.calls).toEqual([['DIG-45']]);
    expect(sessions.setWorktree.mock.calls).toEqual([['old-s5', '/wts/dig-45']]);
  });

  test('keeps a tab whose launch throws something other than an Error', async () => {
    // given
    const { sessions, manager } = fakeSessions(['DIG']);
    sessions.openPlanner.mockImplementationOnce(() => {
      const thrown: unknown = 'boom';
      throw thrown;
    });
    // when
    const result = await restoreTabs(saved([savedTab('planner', 'DIG', null, 's2')]), manager, () =>
      Promise.resolve(null),
    );
    // then
    expect(result).toEqual({ restored: 0, warnings: ['kept DIG planner for the next launch: boom'] });
  });

  test('holds and releases saves once when there are no tabs to restore', async () => {
    // given
    const { sessions, release, manager } = fakeSessions(['DIG']);
    // when
    const result = await restoreTabs(saved([]), manager, () => Promise.resolve(null));
    // then
    expect(result).toEqual({ restored: 0, warnings: [] });
    expect(sessions.holdSaves).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  test('skips the worktree of a tab closed during its lookup and restores the rest', async () => {
    // given
    const { sessions, manager } = fakeSessions(['DIG']);
    sessions.get.mockReturnValueOnce(null);
    const state = saved([savedTab('card', 'DIG', 'DIG-44', 's1'), savedTab('card', 'DIG', 'DIG-45', 's5')]);
    // when
    const result = await restoreTabs(state, manager, () => Promise.resolve('/wts/dig'));
    // then
    expect(result).toEqual({ restored: 2, warnings: [] });
    expect(sessions.setWorktree.mock.calls).toEqual([['old-s5', '/wts/dig']]);
  });

  test('releases the save hold when restore throws', async () => {
    // given
    const { sessions, release, manager } = fakeSessions(['DIG']);
    sessions.setWorktree.mockImplementation(() => {
      throw new Error('finding tab: old-s1 does not exist');
    });
    // when
    const result = restoreTabs(saved([savedTab('card', 'DIG', 'DIG-44', 's1')]), manager, () =>
      Promise.resolve('/wts/dig-44'),
    );
    // then
    await expect(result).rejects.toThrow('finding tab: old-s1 does not exist');
    expect(release).toHaveBeenCalledTimes(1);
  });

  test('keeps restoring tabs after a vault tab fails', async () => {
    // given
    const { sessions, manager } = fakeSessions(['DIG']);
    sessions.openVault.mockImplementation(() => {
      throw new Error('opening vault: no vaultDir in config');
    });
    const state = saved([savedTab('vault', 'DIG', null, 's4'), savedTab('card', 'DIG', 'DIG-44', 's1')]);
    // when
    const result = await restoreTabs(state, manager, () => Promise.resolve(null));
    // then
    expect(result.restored).toBe(1);
    expect(sessions.openCard.mock.calls).toEqual([['DIG', 'DIG-44', 's1', 'old-s1']]);
  });

  test('reopens a card whose worktree is gone with no worktree path', async () => {
    // given
    const { sessions, opened, manager } = fakeSessions(['DIG']);
    const findWt = vi.fn(() => Promise.resolve(null));
    // when
    const result = await restoreTabs(saved([savedTab('card', 'DIG', 'DIG-44', 's1')]), manager, findWt);
    // then
    expect(result).toEqual({ restored: 1, warnings: [] });
    expect(findWt).toHaveBeenCalledWith('DIG-44');
    expect(sessions.setWorktree).not.toHaveBeenCalled();
    expect(opened[0]?.worktreePath).toBeNull();
  });

  test('completes without calling Jira', async () => {
    // given
    const { manager } = fakeSessions(['DIG']);
    const jira = { getCard: vi.fn(() => Promise.reject(new Error('fetching card: offline'))) };
    // when
    const result = await restoreTabs(saved([savedTab('card', 'DIG', 'DIG-44', 's1')]), manager, () =>
      Promise.resolve(null),
    );
    // then
    expect(result.restored).toBe(1);
    expect(jira.getCard).not.toHaveBeenCalled();
  });

  test('logs each restored tab and whether its worktree was found', async () => {
    // given
    const { manager } = fakeSessions(['DIG']);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const state = saved([
      savedTab('card', 'DIG', 'DIG-44', 's1'),
      savedTab('card', 'DIG', 'DIG-45', 's2'),
      savedTab('planner', 'DIG', null, 's3'),
    ]);
    const findWt = (key: string) => Promise.resolve(key === 'DIG-44' ? '/wts/dig-44' : null);
    // when
    await restoreTabs(state, manager, findWt, logger);
    // then
    expect(logger.info.mock.calls).toEqual([
      ['restore', 'restored', { projectKey: 'DIG', cardKey: 'DIG-44' }],
      ['worktree', 'found', { cardKey: 'DIG-44', path: '/wts/dig-44' }],
      ['restore', 'restored', { projectKey: 'DIG', cardKey: 'DIG-45' }],
      ['worktree', 'gone', { cardKey: 'DIG-45' }],
      ['restore', 'restored', { projectKey: 'DIG', kind: 'planner' }],
    ]);
  });

  test('logs a dropped tab with the reason at warn', async () => {
    // given
    const { manager } = fakeSessions([]);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    // when
    await restoreTabs(saved([savedTab('card', 'DIG', 'DIG-44', 's1')]), manager, () => Promise.resolve(null), logger);
    // then
    expect(logger.warn).toHaveBeenCalledWith('restore', 'dropped', { tab: 'DIG-44', reason: 'project not in config' });
  });

  test('logs a failed worktree lookup at warn and restores the tab', async () => {
    // given
    const { opened, manager } = fakeSessions(['DIG']);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const findWt = () => Promise.reject(new Error('listing worktrees: denied'));
    // when
    const result = await restoreTabs(saved([savedTab('card', 'DIG', 'DIG-44', 's1')]), manager, findWt, logger);
    // then
    expect(result.restored).toBe(1);
    expect(opened[0]?.worktreePath).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('worktree', 'failed', {
      operation: 'findWorktree',
      cardKey: 'DIG-44',
      error: 'listing worktrees: denied',
    });
  });
});
