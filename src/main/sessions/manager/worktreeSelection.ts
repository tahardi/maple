import type { TabState } from '@shared/types/tabs/tabState';

export function withWorktrees(tab: TabState, paths: string[]): TabState {
  const { worktreePath, worktreePaths } = tab;
  const newest = paths.at(0) ?? null;
  const kept = worktreePath !== null && paths.includes(worktreePath) ? worktreePath : newest;
  const selected = newest !== null && !worktreePaths.includes(newest) ? newest : kept;
  return { ...tab, worktreePath: selected, worktreePaths: paths };
}

export function withSelectedWorktree(tab: TabState, path: string): TabState {
  if (!tab.worktreePaths.includes(path)) {
    throw new Error(`selecting worktree: ${path} is not a worktree of ${tab.cardKey ?? tab.id}`);
  }
  return { ...tab, worktreePath: path };
}
