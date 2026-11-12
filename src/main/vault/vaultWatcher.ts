import type { Logger } from '@main/app/log/log';
import { watchWorktree } from '@main/git/worktreeWatcher';
import { errorText } from '@shared/errors/errorText';

export function vaultWatcher(onChange: () => void, logger: Logger): (dir: string) => void {
  let watcher: { dir: string; stop: () => void } | null = null;
  return (dir) => {
    if (watcher?.dir === dir) {
      return;
    }
    watcher?.stop();
    watcher = null;
    try {
      watcher = { dir, stop: watchWorktree(dir, onChange) };
    } catch (err) {
      const error = errorText(err);
      logger.warn('vault', 'failed', { operation: 'watchWorktree', args: [dir], error });
    }
  };
}
