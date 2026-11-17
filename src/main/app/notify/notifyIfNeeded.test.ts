import { describe, expect, test, vi } from 'vitest';
import type { ProjectConfig } from '@shared/types/config/projectConfig';
import type { TabState } from '@shared/types/tabs/tabState';
import type { TabStatus } from '@shared/types/tabs/tabStatus';
import { notifyIfNeeded, type NotifyDeps } from './notifyIfNeeded';

const tab: TabState = {
  id: 't1',
  projectKey: 'DIG',
  kind: 'card',
  cardKey: 'DIG-44',
  sessionId: 's1',
  worktreePath: null,
  worktreePaths: [],
};

const project: ProjectConfig = {
  name: 'Dig Days',
  jiraKey: 'DIG',
  jiraBoardId: 1,
  plannerDir: '/plans',
  repo: '/repo',
  otherRepos: [],
};

const waiting: TabStatus = {
  tabId: 't1',
  dot: 'waiting',
  sessionAlive: true,
  exitCode: null,
  resumeFailed: false,
  sync: null,
};

function fakeDeps(overrides: Partial<NotifyDeps> = {}) {
  const notify = vi.fn<NotifyDeps['notify']>();
  const deps: NotifyDeps = {
    tab: () => tab,
    focused: () => false,
    activeTabId: () => null,
    enabled: () => Promise.resolve(true),
    project: () => Promise.resolve(project),
    notify,
    ...overrides,
  };
  return { deps, notify };
}

describe('notifyIfNeeded', () => {
  test('notifies with the project name when a tab starts waiting in the background', async () => {
    // given
    const { deps, notify } = fakeDeps({ focused: () => true, activeTabId: () => 't2' });
    // when
    await notifyIfNeeded(deps, waiting, 'working');
    // then
    expect(notify).toHaveBeenCalledExactlyOnceWith(tab, 'Dig Days');
  });

  test('falls back to the project key when the project is not in config', async () => {
    // given
    const { deps, notify } = fakeDeps({ project: () => Promise.resolve(null) });
    // when
    await notifyIfNeeded(deps, waiting, 'working');
    // then
    expect(notify).toHaveBeenCalledExactlyOnceWith(tab, 'DIG');
  });

  test.each<{ name: string; overrides: Partial<NotifyDeps> }>([
    { name: 'the tab is no longer open', overrides: { tab: () => null } },
    { name: 'notifications are off', overrides: { enabled: () => Promise.resolve(false) } },
    { name: 'the window is focused on that tab', overrides: { focused: () => true, activeTabId: () => 't1' } },
  ])('does not notify when $name', async ({ overrides }) => {
    // given
    const { deps, notify } = fakeDeps(overrides);
    // when
    await notifyIfNeeded(deps, waiting, 'working');
    // then
    expect(notify).not.toHaveBeenCalled();
  });
});
