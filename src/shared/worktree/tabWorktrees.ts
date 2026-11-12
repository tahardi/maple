import type { TabState } from '@shared/types/tabs';

export function tabWorktrees(tab: Pick<TabState, 'worktreePath' | 'worktreePaths'>): string[] {
  return [...new Set([...tab.worktreePaths, ...(tab.worktreePath === null ? [] : [tab.worktreePath])])];
}
