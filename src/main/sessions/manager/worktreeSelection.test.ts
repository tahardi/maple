import { describe, expect, test } from 'vitest';
import type { TabState } from '@shared/types/tabs/tabState';
import { withSelectedWorktree, withWorktrees } from './worktreeSelection';

function tab(worktreePath: string | null, worktreePaths: string[]): TabState {
  return { id: 't1', projectKey: 'DIG', kind: 'card', cardKey: 'DIG-44', sessionId: 's1', worktreePath, worktreePaths };
}

describe('withWorktrees', () => {
  test.each([
    { name: 'the first worktree is found', selected: null, before: [], after: ['/a'], want: '/a' },
    { name: 'a newer worktree appears', selected: '/a', before: ['/a'], after: ['/b', '/a'], want: '/b' },
    {
      name: 'the list is unchanged after picking an older one',
      selected: '/a',
      before: ['/b', '/a'],
      after: ['/b', '/a'],
      want: '/a',
    },
    { name: 'the selected worktree is removed', selected: '/b', before: ['/b', '/a'], after: ['/a'], want: '/a' },
    { name: 'all are removed', selected: '/b', before: ['/b', '/a'], after: [], want: null },
  ])('withWorktrees selects $want when $name', ({ selected, before, after, want }) => {
    // given
    const current = tab(selected, before);
    // when
    const got = withWorktrees(current, after);
    // then
    expect(got).toEqual(tab(want, after));
  });
});

describe('withSelectedWorktree', () => {
  test('selects a listed worktree', () => {
    // given
    const current = tab('/b', ['/b', '/a']);
    // when
    const got = withSelectedWorktree(current, '/a');
    // then
    expect(got).toEqual(tab('/a', ['/b', '/a']));
  });

  test('throws for a path that is not listed', () => {
    // given
    const current = tab('/b', ['/b', '/a']);
    // when
    const select = () => withSelectedWorktree(current, '/x');
    // then
    expect(select).toThrow('selecting worktree: /x is not a worktree of DIG-44');
  });
});
