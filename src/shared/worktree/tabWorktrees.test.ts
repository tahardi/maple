import { describe, expect, test } from 'vitest';
import type { TabState } from '@shared/types/tabs/tabState';
import { tabWorktrees } from './tabWorktrees';

const tab: TabState = {
  id: 't1',
  projectKey: 'DIG',
  kind: 'card',
  cardKey: 'DIG-44',
  sessionId: 's1',
  worktreePath: null,
  worktreePaths: [],
};

describe('tabWorktrees', () => {
  test.each([
    { name: 'no worktree', worktreePath: null, worktreePaths: [], want: [] },
    { name: 'only a selected worktree', worktreePath: '/a', worktreePaths: [], want: ['/a'] },
    { name: 'a listed selected worktree', worktreePath: '/b', worktreePaths: ['/a', '/b'], want: ['/a', '/b'] },
    { name: 'an unlisted selected worktree', worktreePath: '/c', worktreePaths: ['/a'], want: ['/a', '/c'] },
  ])('lists every worktree once for $name', ({ worktreePath, worktreePaths, want }) => {
    // given
    const given = { ...tab, worktreePath, worktreePaths };
    // when
    const got = tabWorktrees(given);
    // then
    expect(got).toEqual(want);
  });
});
