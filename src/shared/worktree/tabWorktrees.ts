import type { TabState } from '@shared/types/tabs/tabState';

export function tabWorktrees(tab: Pick<TabState, 'worktreePath' | 'worktreePaths'>): string[] {
  return [...new Set([...tab.worktreePaths, ...(tab.worktreePath === null ? [] : [tab.worktreePath])])];
}
